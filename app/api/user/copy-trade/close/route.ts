import { NextResponse } from "next/server"
import { COPY_TRADE_CYCLE_MS } from "@/lib/copy-trade-policy"
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
      /** When true, use force-exit fee model even after 24h. */
      force?: boolean
    }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 })
    }

    const floatingPnLUsd = Number(body.floatingPnLUsd ?? 0)
    const coinImpactFraction =
      body.coinImpactFraction !== undefined ? Number(body.coinImpactFraction) : 0

    const admin = createAdminClient()

    const { data: sessRow, error: sErr } = await admin
      .from("copy_trade_sessions")
      .select("created_at")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (sErr) throw new Error(sErr.message)
    if (!sessRow) return NextResponse.json({ error: "Session not found" }, { status: 404 })

    const ageMs = Date.now() - new Date(String(sessRow.created_at)).getTime()
    const forceRequested = body.force === true
    const kind: "scheduled" | "force" =
      forceRequested ? "force" : ageMs >= COPY_TRADE_CYCLE_MS ? "scheduled" : "force"

    try {
      const { settlement, balances } = await settleCopyTradeSessionForUser(admin, {
        userId: user.id,
        sessionId,
        floatingPnLUsd,
        coinImpactFraction,
        financialActorType: "user",
        kind,
      })
      return NextResponse.json({
        ok: true,
        settlement: {
          kind: settlement.kind,
          stakeUsd: settlement.stakeUsd,
          grossBeforeFeesUsd: settlement.grossBeforeFeesUsd,
          cancelFeeUsd: settlement.cancelFeeUsd,
          withdrawFeeUsd: settlement.withdrawFeeUsd,
          netToMainUsd: settlement.netToMainUsd,
          mainCreditUsd: settlement.mainCreditUsd,
          liquidCreditUsd: settlement.liquidCreditUsd,
          earningsExecutionFeeUsd: settlement.earningsExecutionFeeUsd,
        },
        balances: { available_balance: balances.available_balance, container_withdrawable_earnings: balances.container_withdrawable_earnings },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Internal error"
      if (msg === "Session not found") return NextResponse.json({ error: msg }, { status: 404 })
      if (msg === "Forbidden") return NextResponse.json({ error: msg }, { status: 403 })
      if (msg === "Session already closed") return NextResponse.json({ error: msg }, { status: 400 })
      if (msg === "COPY_LIFECYCLE_BUCKET_RECONCILE_FAILED") {
        return NextResponse.json(
          { error: "Copy lifecycle buckets do not reconcile to target gross — contact support." },
          { status: 422 },
        )
      }
      if (msg === "SETTLEMENT_CONFLICT") {
        return NextResponse.json({ error: "Session is already being settled or was closed." }, { status: 409 })
      }
      throw e
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
