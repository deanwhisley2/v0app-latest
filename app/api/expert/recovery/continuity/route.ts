import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getGovernanceState } from "@/lib/global-execution-governor"
import { getResumeGate } from "@/lib/startup-recovery"

/**
 * Cross-device/session continuity snapshot for restoring operational visibility.
 */
export async function GET() {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const userId = userOrRes
    const admin = createAdminClient()
    const [gate, governance, sessions, positions, execution, daemonStates, leases, simulations] = await Promise.all([
      getResumeGate(),
      getGovernanceState(),
      admin
        .from("TradeSession")
        .select("id,symbol,mode,status,totalAmount,usedAmount,startTime,endTime,config")
        .eq("userId", userId)
        .in("status", ["PENDING", "ACTIVE"])
        .order("startTime", { ascending: false })
        .limit(200),
      admin
        .from("PositionState")
        .select("userId,symbol,sessionId,status,quantity,entryPrice,updatedAt,version")
        .eq("userId", userId)
        .order("updatedAt", { ascending: false })
        .limit(300),
      admin
        .from("ExecutionState")
        .select("sessionId,userId,symbol,status,lastError,lastExecutionAt,version,updatedAt")
        .eq("userId", userId)
        .order("updatedAt", { ascending: false })
        .limit(300),
      admin
        .from("DaemonSymbolState")
        .select("daemonType,userId,symbol,positionStatus,lastExecutionAt,lastEntryAt,streakAction,streakCount,updatedAt")
        .eq("userId", userId)
        .order("updatedAt", { ascending: false })
        .limit(500),
      admin.from("OrchestrationLease").select("leaseKey,ownerId,heartbeatAt,expiresAt").limit(200),
      admin
        .from("SimulationRun")
        .select("id,userId,symbol,createdAt,status,reliabilityScore")
        .eq("userId", userId)
        .order("createdAt", { ascending: false })
        .limit(50),
    ])

    if (sessions.error) throw new Error(`DB_READ_FAILED: TradeSession — ${sessions.error.message}`)
    if (positions.error) throw new Error(`DB_READ_FAILED: PositionState — ${positions.error.message}`)
    if (execution.error) throw new Error(`DB_READ_FAILED: ExecutionState — ${execution.error.message}`)
    if (daemonStates.error) throw new Error(`DB_READ_FAILED: DaemonSymbolState — ${daemonStates.error.message}`)
    if (leases.error) throw new Error(`DB_READ_FAILED: OrchestrationLease — ${leases.error.message}`)
    if (simulations.error) throw new Error(`DB_READ_FAILED: SimulationRun — ${simulations.error.message}`)

    const focusObserverLease = (leases.data ?? []).find((x) => String(x.leaseKey).includes("focus-20-observer"))
    const focusObserverRuntime = (daemonStates.data ?? []).filter((x) => x.daemonType === "focus-20-observer")
    const autoTraderRuntime = (daemonStates.data ?? []).filter((x) => x.daemonType === "auto-trader-daemon")

    return NextResponse.json({
      resumeGate: gate,
      governance: {
        mode: governance.mode,
        healthState: governance.healthState,
        marketRegime: governance.marketRegime,
        systemicRiskState: governance.systemicRiskState,
      },
      continuity: {
        activeSessions: sessions.data ?? [],
        positionState: positions.data ?? [],
        executionState: execution.data ?? [],
        focusObserver: {
          lease: focusObserverLease ?? null,
          runtime: focusObserverRuntime,
        },
        autoTrader: {
          runtime: autoTraderRuntime,
        },
        simulationState: simulations.data ?? [],
      },
      restoredAt: new Date().toISOString(),
    })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
