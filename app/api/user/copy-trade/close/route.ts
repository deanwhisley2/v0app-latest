import { NextResponse } from "next/server"
import { COPY_TRADE_CYCLE_MS } from "@/lib/copy-trade-policy"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { customerTradingApiGuardResponse } from "@/lib/server/customer-trading-api-guard"
import { settleCopyTradeSessionForUser } from "@/lib/server/copy-trade-settle"
import { envelopeFromCopyCloseMessage, jsonMutationError } from "@/lib/api/mutation-error-envelope"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const tradingBlock = await customerTradingApiGuardResponse(
      user.id,
      user.email,
      "copy-trade/close",
    )
    if (tradingBlock) return tradingBlock

    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string
      floatingPnLUsd?: number
      coinImpactFraction?: number
      /** When true, use force-exit fee model even after 24h. */
      force?: boolean
    }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
    if (!sessionId) {
      return jsonMutationError(
        400,
        "SESSION_ID_REQUIRED",
        "Session reference missing. Refresh and try again.",
        "copy-trade/close: missing sessionId.",
      )
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
    if (!sessRow) {
      return NextResponse.json(envelopeFromCopyCloseMessage("Session not found"), { status: 404 })
    }

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
        success: true,
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
        balances: {
          available_balance: balances.available_balance,
          container_withdrawable_earnings: balances.container_withdrawable_earnings,
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Internal error"
      if (msg === "Session not found")
        return NextResponse.json(envelopeFromCopyCloseMessage(msg), { status: 404 })
      if (msg === "Forbidden") return NextResponse.json(envelopeFromCopyCloseMessage(msg), { status: 403 })
      if (msg === "Session already closed")
        return NextResponse.json(envelopeFromCopyCloseMessage(msg), { status: 400 })
      if (msg === "COPY_LIFECYCLE_BUCKET_RECONCILE_FAILED") {
        return jsonMutationError(
          422,
          "COPY_LIFECYCLE_RECONCILE",
          "Copy session accrual verification failed. Contact support.",
          msg,
          { suggested_action: "Contact support if this repeats after refresh." },
        )
      }
      if (msg === "SETTLEMENT_CONFLICT") {
        return jsonMutationError(
          409,
          "SETTLEMENT_CONFLICT",
          "This session is already closing or was settled. Refresh the dashboard.",
          msg,
          { suggested_action: "Refresh Container Mode and confirm the allocation is still open." },
        )
      }
      throw e
    }
  } catch (e) {
    console.error("[copy-trade/close]", e)
    return jsonMutationError(
      500,
      "INTERNAL_ERROR",
      "Copy settlement did not complete. Please try again.",
      e instanceof Error ? e.message : "unknown",
    )
  }
}
