/**
 * Controlled observational learning — analysis + regime + governance probe + shadow simulation.
 * No strategy mutation, no live execution (tick never calls exchange execute routes).
 */
import { timeBoundAnalysis } from "@/lib/analysis/time-bound-analysis"
import { calibrateConfidence } from "@/lib/confidence-calibration"
import { computeAnalysisTtlSeconds } from "@/lib/expert/analysis-ttl"
import { createAnalysis, makeId } from "@/lib/expert/phase2-store"
import { logEvolutionAudit } from "@/lib/evolution-governor"
import { getGovernanceState, requestGovernanceApproval } from "@/lib/global-execution-governor"
import { regimeBucketForTradeMemory, resolveAuthoritativeMarketState } from "@/lib/market-state-authority"
import { refreshStabilityIntelligence } from "@/lib/stability-intelligence-engine"
import { runSandboxSimulation } from "@/lib/sandbox-execution-engine"
import { getResumeGate } from "@/lib/startup-recovery"
import {
  behaviorIntelligenceToReasons,
  deriveBehaviorIntelligence,
} from "@/lib/behavior-market-intelligence"

export type ObservationWindowTickOptions = {
  userId: string
  symbols: string[]
  /** Analysis time window (seconds). Keep modest for daemon cadence. */
  analysisWindowSeconds: number
  /** USD — governance BUY probe only (no order placement). */
  governanceProbeQuoteUsd: number
  /** Persist shadow replay to SimulationRun + audit. */
  persistSandbox: boolean
  /** Skip stability refresh when false. */
  includeStabilityRefresh: boolean
}

export type ObservationWindowTickResult = {
  market: Awaited<ReturnType<typeof resolveAuthoritativeMarketState>>
  gate: Awaited<ReturnType<typeof getResumeGate>>
  governanceSummary: { mode: string; healthState: string }
  governanceProbe: {
    symbol: string
    approved: boolean
    status: string
    reason?: string
  }
  analyses: Array<{
    symbol: string
    analysisId: string
    action: string
    calibratedConfidence: number
  }>
  sandbox: {
    runId?: string
    tradesAnalyzed: number
    baselinePnlUsd: number
    hypotheticalPnlUsd: number
    reliabilityScore: number
  } | null
  stabilityRefreshed: boolean
}

export async function runObservationWindowTick(opts: ObservationWindowTickOptions): Promise<ObservationWindowTickResult> {
  const primary = opts.symbols[0]?.toUpperCase() ?? "BTCUSDT"

  const market = await resolveAuthoritativeMarketState({
    consumer: "observation-window",
    minRefreshMs: 15_000,
  })

  const gate = await getResumeGate()
  const govRow = await getGovernanceState()
  const governanceSummary = {
    mode: String(govRow.mode ?? "UNKNOWN"),
    healthState: String(govRow.healthState ?? "UNKNOWN"),
  }

  const workerId = `obs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const probe = await requestGovernanceApproval({
    workerId,
    lane: "observation-window",
    userId: opts.userId,
    symbol: primary.endsWith("USDT") ? primary : `${primary}USDT`,
    action: "BUY",
    requestedQuoteUsd: Math.max(1, opts.governanceProbeQuoteUsd),
  })

  const analyses: ObservationWindowTickResult["analyses"] = []

  for (const raw of opts.symbols) {
    const symbol = raw.trim().toUpperCase()
    if (!symbol) continue

    const result = await timeBoundAnalysis.startAnalysis({
      symbol,
      timeWindowMs: opts.analysisWindowSeconds * 1000,
      includeGrok: false,
      fastMode: true,
    })

    const liveForPenalty = market.degraded ? "UNKNOWN" : market.marketRegime
    const calibration = await calibrateConfidence({
      userId: opts.userId,
      symbol,
      decision: result.fusedDecision.action,
      rawConfidence: result.fusedDecision.confidence,
      marketRegime: regimeBucketForTradeMemory(market.marketRegime),
      liveMarketRegimeForPenalty: liveForPenalty,
    })

    const analysisId = makeId("analysis")
    const ttlSeconds = computeAnalysisTtlSeconds({
      mode: result.mode,
      timeWindowSeconds: opts.analysisWindowSeconds,
    })
    const behaviorIntel = deriveBehaviorIntelligence(result, {
      observationWindowSec: opts.analysisWindowSeconds,
      signalFreshnessSec: 0,
    })
    const behaviorReasons = behaviorIntelligenceToReasons(behaviorIntel)

    await createAnalysis({
      id: analysisId,
      userId: opts.userId,
      symbol,
      timeWindow: opts.analysisWindowSeconds,
      action: result.fusedDecision.action,
      confidence: calibration.final,
      rawConfidence: result.fusedDecision.confidence,
      calibratedConfidence: calibration.final,
      confidenceExplanation: calibration,
      reasons: [
        ...result.fusedDecision.reasons,
        ...behaviorReasons,
        "OBSERVATION_WINDOW",
        "observational-learning-phase",
      ],
      tradeExecuted: false,
      ttlSeconds,
    })

    analyses.push({
      symbol,
      analysisId,
      action: result.fusedDecision.action,
      calibratedConfidence: calibration.final,
    })
  }

  let sandbox: ObservationWindowTickResult["sandbox"] = null
  if (opts.persistSandbox) {
    const sim = await runSandboxSimulation({
      userId: opts.userId,
      symbol: primary.endsWith("USDT") ? primary : `${primary}USDT`,
      persist: true,
      quietSandboxLogs: true,
      tradeLimit: 200,
    })
    sandbox = {
      runId: sim.runId,
      tradesAnalyzed: sim.shadowExecutionResult?.tradesAnalyzed ?? 0,
      baselinePnlUsd: sim.counterfactualComparison?.reality?.totalPnlUsd ?? 0,
      hypotheticalPnlUsd: sim.counterfactualComparison?.hypothetical?.totalPnlUsd ?? 0,
      reliabilityScore: sim.simulationReliability?.score ?? 0,
    }
  }

  let stabilityRefreshed = false
  if (opts.includeStabilityRefresh) {
    try {
      await refreshStabilityIntelligence({
        userId: opts.userId,
        force: false,
        minRefreshMs: 120_000,
      })
      stabilityRefreshed = true
    } catch {
      stabilityRefreshed = false
    }
  }

  await logEvolutionAudit({
    userId: opts.userId,
    eventType: "OBSERVATION_WINDOW_TICK",
    details: {
      marketRegime: market.marketRegime,
      systemicRiskState: market.systemicRiskState,
      marketDegraded: market.degraded,
      gate: gate.status,
      gateUnresolved: gate.unresolvedCount,
      governanceMode: governanceSummary.mode,
      governanceProbe: {
        approved: probe.approved,
        status: probe.status,
        reason: probe.reason,
      },
      analyses: analyses.map((a) => ({
        symbol: a.symbol,
        analysisId: a.analysisId,
        action: a.action,
        calibratedConfidence: a.calibratedConfidence,
      })),
      sandbox,
      stabilityRefreshed,
      isolationNote: "No live orders; governance probe is approval-path only; sandbox is shadow replay.",
    },
  })

  console.log(
    `[observation-window] tick gate=${gate.status} regime=${market.marketRegime} sandboxTrades=${sandbox?.tradesAnalyzed ?? 0} govProbe=${probe.status}`,
  )

  return {
    market,
    gate,
    governanceSummary,
    governanceProbe: {
      symbol: primary,
      approved: probe.approved,
      status: probe.status,
      reason: probe.reason,
    },
    analyses,
    sandbox,
    stabilityRefreshed,
  }
}
