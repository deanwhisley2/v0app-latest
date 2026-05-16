import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  createCryptoDepositRequest,
  processCryptoDepositVerification,
  refreshUserCryptoDeposits,
} from "@/lib/server/crypto-deposit-service"
import {
  DuplicateFundingReferenceError,
  FUNDING_REFERENCE_ALREADY_USED_MESSAGE,
  FUNDING_REFERENCE_UNAVAILABLE_MESSAGE,
  isFundingReferenceCooldownActive,
} from "@/lib/server/funding-reference-guard"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")?.trim()
    const shouldRefresh = searchParams.get("refresh") === "1"
    let refreshMeta: { refreshed: number; credited: number; errors: string[] } | null = null
    if (shouldRefresh) {
      refreshMeta = await refreshUserCryptoDeposits(admin, user.id)
    }
    let q = admin
      .from("crypto_deposit_requests")
      .select(
        "id,amount_usd,tx_hash,status,on_chain_amount_usdt,confirmations,min_confirmations,failure_reason,created_at,credited_at,verified_at,credited_principal_usd,compensation_usd,total_credited_usd",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
    if (id) q = q.eq("id", id)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      deposits: data ?? [],
      ...(refreshMeta ? { refresh: refreshMeta } : {}),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as {
      amountUsd?: number
      txHash?: string
    }
    const amountUsd = Number(body.amountUsd ?? 0)
    const txHash = typeof body.txHash === "string" ? body.txHash.trim() : ""
    if (!txHash || !(amountUsd > 0)) {
      return NextResponse.json({ error: "amountUsd and txHash are required." }, { status: 400 })
    }

    const admin = createAdminClient()
    if (await isFundingReferenceCooldownActive(admin, user.id)) {
      return NextResponse.json(
        { error: "Funding temporarily unavailable.", code: "FUNDING_COOLDOWN" },
        { status: 429 },
      )
    }
    const email = user.email ?? ""
    const created = await createCryptoDepositRequest(admin, {
      userId: user.id,
      userEmail: email,
      amountUsd,
      txHash,
    })

    try {
      const verified = await processCryptoDepositVerification(admin, created.id, {
        actorId: user.id,
        actorType: "user",
      })
      return NextResponse.json({ ok: true, deposit: verified })
    } catch (e) {
      const { data: latest } = await admin
        .from("crypto_deposit_requests")
        .select(
          "id,amount_usd,tx_hash,status,on_chain_amount_usdt,confirmations,min_confirmations,failure_reason,created_at,credited_at",
        )
        .eq("id", created.id)
        .maybeSingle()
      return NextResponse.json({
        ok: true,
        deposit: latest ?? created,
        verifyMessage: e instanceof Error ? e.message : "Verification pending.",
      })
    }
  } catch (e) {
    if (e instanceof DuplicateFundingReferenceError) {
      return NextResponse.json(
        { error: e.customerMessage, code: e.code },
        { status: e.httpStatus },
      )
    }
    const msg = e instanceof Error ? e.message : "Internal error"
    if (
      msg === FUNDING_REFERENCE_ALREADY_USED_MESSAGE ||
      msg === FUNDING_REFERENCE_UNAVAILABLE_MESSAGE
    ) {
      return NextResponse.json(
        { error: msg, code: "DUPLICATE_FUNDING_REFERENCE" },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
