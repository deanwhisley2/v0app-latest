import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { setGovernanceState } from "@/lib/global-execution-governor"

export async function POST(req: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const body = (await req.json().catch(() => ({}))) as {
      mode?: "NORMAL" | "GLOBAL_PAUSE" | "LIQUIDATION_ONLY" | "SAFE_MODE" | "EXECUTION_DISABLED" | "RECOVERY_ONLY"
      healthState?:
        | "HEALTHY"
        | "DEGRADED"
        | "RECOVERY_MODE"
        | "HIGH_RISK"
        | "PAUSED"
        | "GOVERNANCE_LOCKED"
        | "MANUAL_INTERVENTION_REQUIRED"
      reason?: string
      maxPortfolioExposureUsd?: number
      maxSymbolExposureUsd?: number
      maxActiveSessions?: number
      maxConcurrentLiquidations?: number
      maxDailyLossUsd?: number
      marketRegime?:
        | "TRENDING"
        | "VOLATILE"
        | "CHOPPING"
        | "PANIC"
        | "LOW_LIQUIDITY"
        | "SIDEWAYS"
        | "LIQUIDITY_STRESS"
        | "CASCADE_CONDITIONS"
        | "RECOVERY_BOUNCE"
      systemicRiskState?:
        | "NORMAL"
        | "ELEVATED_CORRELATION"
        | "MARKET_STRESS"
        | "CASCADE_RISK"
        | "EXTREME_VOLATILITY"
        | "LIQUIDITY_DANGER"
      effectiveExposureMultiplier?: number
      correlationUncertainty?: number
    }
    const governance = await setGovernanceState(body)
    return NextResponse.json({ governance })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
