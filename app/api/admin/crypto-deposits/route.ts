import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import {
  adminOverrideCryptoDeposit,
  listCryptoDepositSecurityEvents,
} from "@/lib/server/crypto-deposit-service"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(user)
    const admin = createAdminClient()
    const status = new URL(request.url).searchParams.get("status")?.trim()
    let q = admin
      .from("crypto_deposit_requests")
      .select(
        "id,user_id,user_email,amount_usd,tx_hash,status,on_chain_amount_usdt,confirmations,min_confirmations,failure_reason,receive_address,created_at,credited_at,verified_at,last_checked_at,credited_principal_usd,compensation_usd,total_credited_usd,security_flag,auto_approved,chain_block_timestamp_ms",
      )
      .order("created_at", { ascending: false })
      .limit(200)
    if (status) q = q.eq("status", status)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const securityEvents = await listCryptoDepositSecurityEvents(admin, 80).catch(() => [])
    return NextResponse.json({ deposits: data ?? [], securityEvents })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(user)
    const body = (await request.json().catch(() => ({}))) as {
      depositId?: string
      action?: "approve" | "reject" | "retry"
      note?: string
    }
    if (!body.depositId || !body.action) {
      return NextResponse.json({ error: "depositId and action are required." }, { status: 400 })
    }
    const admin = createAdminClient()
    const deposit = await adminOverrideCryptoDeposit(admin, {
      depositId: body.depositId,
      adminUserId: user.id,
      action: body.action,
      note: body.note,
    })
    return NextResponse.json({ ok: true, deposit })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 400 })
  }
}
