import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { notifyUserFundingDecision } from "@/lib/server/approval-inbox-notify"
import { getTradingUserLevel } from "@/lib/server/security-authz"
import {
  assertNoDuplicatePendingRetailerTopup,
  DuplicatePendingError,
} from "@/lib/server/funding-duplicate-guard"
import {
  assertFundingPaymentReferenceAvailable,
  DuplicateFundingReferenceError,
  isFundingReferenceCooldownActive,
  registerFundingPaymentReference,
} from "@/lib/server/funding-reference-guard"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level !== 2) return NextResponse.json({ requests: [] })
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("retailer_admin_topup_requests")
      .select("id,amount_requested,crypto_tx_reference,status,commission_rate,amount_credited,created_at,reviewed_at,note")
      .eq("retailer_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ requests: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level !== 2) {
      return NextResponse.json({ error: "Retailer top-up requests are for level 2 desks." }, { status: 403 })
    }
    const admin = createAdminClient()
    const { data: desk } = await admin.from("retailer_profiles").select("id").eq("user_id", user.id).maybeSingle()
    if (!desk?.id) {
      return NextResponse.json({ error: "Create your retailer profile first (payment details)." }, { status: 400 })
    }
    const body = (await request.json().catch(() => ({}))) as {
      amountRequested?: number
      cryptoTxReference?: string
      note?: string
    }
    const amount = Number(body.amountRequested ?? 0)
    const cryptoTxReference = typeof body.cryptoTxReference === "string" ? body.cryptoTxReference.trim() : ""
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null
    if (!Number.isFinite(amount) || amount <= 0 || !cryptoTxReference) {
      return NextResponse.json({ error: "amountRequested and cryptoTxReference are required." }, { status: 400 })
    }
    if (await isFundingReferenceCooldownActive(admin, user.id)) {
      return NextResponse.json(
        { error: "Funding temporarily unavailable.", code: "FUNDING_COOLDOWN" },
        { status: 429 },
      )
    }
    let normalizedRef: string
    try {
      normalizedRef = await assertFundingPaymentReferenceAvailable(admin, {
        rawReference: cryptoTxReference,
        userId: user.id,
      })
    } catch (err) {
      if (err instanceof DuplicateFundingReferenceError) {
        return NextResponse.json(
          { error: err.customerMessage, code: err.code },
          { status: err.httpStatus },
        )
      }
      throw err
    }

    try {
      await assertNoDuplicatePendingRetailerTopup(admin, user.id, amount)
    } catch (err) {
      if (err instanceof DuplicatePendingError) {
        return NextResponse.json({ error: err.message, code: "DUPLICATE_PENDING" }, { status: 409 })
      }
      throw err
    }
    const { data, error } = await admin
      .from("retailer_admin_topup_requests")
      .insert({
        retailer_user_id: user.id,
        amount_requested: amount,
        crypto_tx_reference: cryptoTxReference,
        note,
        status: "pending",
      })
      .select("id,amount_requested,crypto_tx_reference,status,created_at")
      .single()
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Transaction reference already used.", code: "DUPLICATE_FUNDING_REFERENCE" },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    await registerFundingPaymentReference(admin, {
      normalized: normalizedRef,
      userId: user.id,
      sourceTable: "retailer_admin_topup_requests",
      sourceId: String(data.id),
      statusSnapshot: "pending",
    })
    await notifyUserFundingDecision(admin, {
      userId: user.id,
      headline: "Float top-up request queued for Level-5 review",
      relatedId: data.id as string,
    })
    return NextResponse.json({ ok: true, request: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
