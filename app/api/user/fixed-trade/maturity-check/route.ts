import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { officialLeaseEndDate } from "@/lib/fixed-trade-session-lease"
import type { FixPeriodMonths } from "@/lib/container-earnings-schedule"
import { getTradingUserLevel } from "@/lib/server/security-authz"
import { settleFixedTradeMaturityForUser } from "@/lib/server/fixed-trade-maturity-settle"

/**
 * User-triggered maturity sweep for the authenticated account (same logic as cron, bounded).
 * Lets the dashboard settle promptly without waiting for the global worker.
 */
export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level === 2 || level === 5) {
      return NextResponse.json({ error: "This account type cannot run fixed-trade maturity." }, { status: 403 })
    }

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
      error?: string
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
        results.push({ sessionId, ok: false, error: msg })
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
