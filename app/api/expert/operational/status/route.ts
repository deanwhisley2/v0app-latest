import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getGovernanceState } from "@/lib/global-execution-governor"
import { resolveAuthoritativeMarketState } from "@/lib/market-state-authority"
import { getResumeGate } from "@/lib/startup-recovery"

/**
 * Consolidated operational visibility — read-only advisory JSON for dashboards / operators.
 */
export async function GET() {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const userId = userOrRes

    const [gate, governance, liveMarket] = await Promise.all([
      getResumeGate(),
      getGovernanceState(),
      resolveAuthoritativeMarketState({ consumer: "api-operational-status", minRefreshMs: 25_000 }),
    ])

    const admin = createAdminClient()
    const [lastGovLog, epistemic, drift, approvalCount] = await Promise.all([
      admin
        .from("GovernanceApprovalLog")
        .select("status,reason,createdAt,symbol,action,lane")
        .eq("userId", userId)
        .order("createdAt", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("EpistemicCalibrationSnapshot")
        .select("epistemicCalibrationIndex,createdAt")
        .eq("userId", userId)
        .order("createdAt", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("DriftDetectionState")
        .select("driftLevel,stabilityPressure,updatedAt")
        .eq("userId", userId)
        .maybeSingle(),
      admin.from("GovernanceApprovalLog").select("id", { head: true, count: "exact" }).eq("userId", userId),
    ])

    return NextResponse.json({
      resumeGate: gate,
      engineGovernance: {
        mode: governance.mode,
        healthState: governance.healthState,
        marketRegime: governance.marketRegime,
        systemicRiskState: governance.systemicRiskState,
        updatedAt: governance.updatedAt,
      },
      authoritativeMarket: liveMarket,
      cognitionHooks: {
        latestEpistemicCalibrationIndex:
          epistemic.data?.epistemicCalibrationIndex != null ? Number(epistemic.data.epistemicCalibrationIndex) : null,
        epistemicSnapshotAt: epistemic.data?.createdAt ?? null,
        driftLevel: drift.data?.driftLevel ?? null,
        stabilityPressure: drift.data?.stabilityPressure != null ? Number(drift.data.stabilityPressure) : null,
        driftUpdatedAt: drift.data?.updatedAt ?? null,
      },
      lastGovernanceDecision: lastGovLog.data ?? null,
      governanceDecisionCount: approvalCount.count ?? null,
      hints: [
        gate.status !== "SAFE_TO_RESUME"
          ? "Resume gate blocking execution — run scripts/reconcile-on-start.ts or POST /api/expert/recovery/startup."
          : null,
        liveMarket.degraded ? "Live market structure degraded — check Binance connectivity and SUPABASE_SERVICE_ROLE_KEY." : null,
      ].filter(Boolean),
    })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
