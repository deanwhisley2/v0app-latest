import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"
export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level === 2 || level === 5) {
      return NextResponse.json({ error: "This account type cannot release fixed-trade earnings." }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as { sessionId?: string }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 })

    const admin = createAdminClient()
    const { data, error } = await admin.rpc("fixed_trade_release_earnings_window_v1", {
      p_session_id: sessionId,
      p_user_id: user.id,
    })
    if (error) throw new Error(error.message)

    const rpc = data as Record<string, unknown> | null
    if (!rpc || typeof rpc.ok !== "boolean") {
      return NextResponse.json({ error: "Empty RPC response" }, { status: 500 })
    }

    if (rpc.ok === false && rpc.error === "WITHDRAW_WINDOW_LOCKED") {
      return NextResponse.json(rpc, { status: 423 })
    }

    if (rpc.ok === false) {
      const err = typeof rpc.error === "string" ? rpc.error : ""
      const status =
        err === "session_not_found" ? 404 : err === "forbidden" ? 403 : 400
      return NextResponse.json(rpc, { status })
    }

    const ok = rpc
    const num = (v: unknown) => Number(v ?? 0)

    return NextResponse.json({
      ok: true,
      releasedGrossUsd: num(ok.released_gross_usd),
      feeUsd: num(ok.fee_usd),
      creditedLiquidUsd: num(ok.credited_liquid_usd),
      cumulativeReleasedUsd: num(ok.cumulative_released_usd),
      policyGrossUsd: num(ok.policy_gross_usd),
      idempotent: Boolean(ok.idempotent ?? ok.replay),
      replay: Boolean(ok.replay),
      balances: {
        available_balance: num(ok.available_balance),
        container_withdrawable_earnings: num(ok.container_withdrawable_earnings),
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
