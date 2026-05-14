import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"
import { settleCopyTradeSessionForUser } from "@/lib/server/copy-trade-settle"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level === 2 || level === 5) {
      return NextResponse.json(
        { error: "Retailer and Level-5 admin accounts are operational/supervisory and cannot manage copy-trade sessions." },
        { status: 403 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string
      floatingPnLUsd?: number
      coinImpactFraction?: number
    }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 })
    }

    const floatingPnLUsd = Number(body.floatingPnLUsd ?? 0)
    const coinImpactFraction =
      body.coinImpactFraction !== undefined ? Number(body.coinImpactFraction) : 0

    const admin = createAdminClient()
    try {
      const { settlement, balances } = await settleCopyTradeSessionForUser(admin, {
        userId: user.id,
        sessionId,
        floatingPnLUsd,
        coinImpactFraction,
        financialActorType: "user",
      })
      return NextResponse.json({
        ok: true,
        settlement: {
          stakeUsd: settlement.stakeUsd,
          grossBeforeFeesUsd: settlement.grossBeforeFeesUsd,
          cancelFeeUsd: settlement.cancelFeeUsd,
          withdrawFeeUsd: settlement.withdrawFeeUsd,
          netToMainUsd: settlement.netToMainUsd,
          mainCreditUsd: settlement.mainCreditUsd,
          liquidCreditUsd: settlement.liquidCreditUsd,
        },
        balances: { available_balance: balances.available_balance, container_withdrawable_earnings: balances.container_withdrawable_earnings },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Internal error"
      if (msg === "Session not found") return NextResponse.json({ error: msg }, { status: 404 })
      if (msg === "Forbidden") return NextResponse.json({ error: msg }, { status: 403 })
      if (msg === "Session already closed") return NextResponse.json({ error: msg }, { status: 400 })
      if (msg === "SETTLEMENT_CONFLICT") {
        return NextResponse.json({ error: "Session is already being settled or was closed." }, { status: 409 })
      }
      throw e
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
