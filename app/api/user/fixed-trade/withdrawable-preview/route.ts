import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"
import type { FixedTradeWithdrawableRpcBase } from "@/lib/server/fixed-trade-withdraw-rpc-types"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level === 2 || level === 5) {
      return NextResponse.json({ error: "This account type cannot query fixed-trade withdrawable preview." }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const sessionId = (searchParams.get("sessionId") ?? "").trim()
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 })

    const admin = createAdminClient()
    const { data, error } = await admin.rpc("fixed_trade_calculate_withdrawable_v1", {
      p_session_id: sessionId,
      p_user_id: user.id,
    })
    if (error) throw new Error(error.message)

    const row = data as FixedTradeWithdrawableRpcBase | null
    if (!row || row.ok === false) {
      return NextResponse.json(row ?? { ok: false, error: "rpc_empty" }, { status: 400 })
    }

    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
