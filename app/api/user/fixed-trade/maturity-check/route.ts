import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { officialLeaseEndDate } from "@/lib/fixed-trade-session-lease"
import type { FixPeriodMonths } from "@/lib/container-earnings-schedule"
import { customerTradingApiGuardResponse } from "@/lib/server/customer-trading-api-guard"
import { settleFixedTradeMaturityForUser } from "@/lib/server/fixed-trade-maturity-settle"
import { envelopeFromMaturityExceptionMessage, jsonMutationError } from "@/lib/api/mutation-error-envelope"

/**
 * User-triggered maturity sweep for the authenticated account (same logic as cron, bounded).
 * Lets the dashboard settle promptly without waiting for the global worker.
 */
export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const tradingBlock = await customerTradingApiGuardResponse(
      user.id,
      user.email,
      "maturity-check",
    )
    if (tradingBlock) return tradingBlock

    const admin = createAdminClient()
    const now = new Date()
    const { data: rows, error } = await admin
      .from("fixed_trade_sessions")
      .select("id,created_at,fix_period_months,status,maturity_settled_at,maturity_next_retry_at,maturity_attempts")
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("maturity_settled_at", null)
      .order("created_at", { ascending: true })
      .limit(20)

    if (error) throw new Error(error.message)

    const results: Array<{
      sessionId: string
      ok: boolean
      idempotent?: boolean
      success?: boolean
      error?: { error_code: string; user_message: string; technical_message: string }
      settlement?: {
        principalReturnedUsd: number
        finalPolicyGrossUsd: number
        terminalGrossUsd: number
        terminalFeeUsd: number
        terminalLiquidNetUsd: number
      }
    }> = []

    for (const r of rows ?? []) {
      const sessionId = String(r.id)
      const months = Number(r.fix_period_months) as FixPeriodMonths
      const leaseEnd = officialLeaseEndDate(String(r.created_at), months)
      if (now.getTime() < leaseEnd.getTime()) continue
      const next = (r as { maturity_next_retry_at?: string | null }).maturity_next_retry_at
      if (next && new Date(next).getTime() > now.getTime()) continue

      try {
        const out = await settleFixedTradeMaturityForUser(admin, { userId: user.id, sessionId })
        results.push({
          sessionId,
          ok: true,
          success: true,
          idempotent: out.idempotent,
          settlement: {
            principalReturnedUsd: out.settlement.principalReturnedUsd,
            finalPolicyGrossUsd: out.settlement.finalPolicyGrossUsd,
            terminalGrossUsd: out.settlement.terminalGrossUsd,
            terminalFeeUsd: out.settlement.terminalFeeUsd,
            terminalLiquidNetUsd: out.settlement.terminalLiquidNetUsd,
          },
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const env = envelopeFromMaturityExceptionMessage(msg)
        results.push({
          sessionId,
          ok: false,
          success: false,
          error: {
            error_code: env.error_code,
            user_message: env.user_message,
            technical_message: env.technical_message,
          },
        })
      }
    }

    return NextResponse.json({ success: true, ok: true, processed: results.length, results })
  } catch (e) {
    console.error("[maturity-check]", e)
    return jsonMutationError(
      500,
      "INTERNAL_ERROR",
      "Maturity sweep could not run. Please try again shortly.",
      e instanceof Error ? e.message : "unknown",
    )
  }
}
