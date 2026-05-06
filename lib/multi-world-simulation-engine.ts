import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { logEvolutionAudit } from "@/lib/evolution-governor"
import {
  runSandboxSimulation,
  type ShadowExecutionSessionInput,
  type WorldReplayModifiers,
} from "@/lib/sandbox-execution-engine"

/** One hypothetical environment for cross-world comparison (deterministic presets + optional customs). */
export type ComparativeEvolutionScenario = {
  id: string
  label: string
  category:
    | "TREND"
    | "VOLATILITY"
    | "LIQUIDITY"
    | "CASCADE"
    | "RECOVERY"
    | "CORRELATION"
    | "LATENCY_PROXY"
    | "SPREAD_STRESS"
  modifiers: WorldReplayModifiers
}

function requireAdmin() {
  return createAdminClient()
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function stddev(xs: number[]) {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

/**
 * Default multi-world suite: varied systemic stacks + regime-stress lenses + light friction proxies.
 * Not exhaustive of “all realities” — complements custom operator suites.
 */
export const DEFAULT_COMPARATIVE_WORLD_SUITE: ComparativeEvolutionScenario[] = [
  {
    id: "w_calmsys",
    label: "Trending-ish calm systemic",
    category: "TREND",
    modifiers: { systemicRiskAssumption: "NORMAL", regimeStressMode: "NONE" },
  },
  {
    id: "w_corr_vol",
    label: "Elevated correlation + volatility lift",
    category: "CORRELATION",
    modifiers: {
      systemicRiskAssumption: "ELEVATED_CORRELATION",
      regimeStressMode: "PROMOTE_VOLATILITY",
    },
  },
  {
    id: "w_stress_chop",
    label: "Market stress + illiquidity mapping",
    category: "VOLATILITY",
    modifiers: {
      systemicRiskAssumption: "MARKET_STRESS",
      regimeStressMode: "LOW_LIQUIDITY_STRESS",
    },
  },
  {
    id: "w_cascade",
    label: "Cascade risk bias on regimes",
    category: "CASCADE",
    modifiers: { systemicRiskAssumption: "CASCADE_RISK", regimeStressMode: "CASCADE_BIAS" },
  },
  {
    id: "w_panic_tail",
    label: "Extreme systemic + panic tail remap",
    category: "VOLATILITY",
    modifiers: {
      systemicRiskAssumption: "EXTREME_VOLATILITY",
      regimeStressMode: "PANIC_TAIL",
    },
  },
  {
    id: "w_liq_danger_spread_proxy",
    label: "Liquidity danger + hypo compression friction",
    category: "LIQUIDITY",
    modifiers: {
      systemicRiskAssumption: "LIQUIDITY_DANGER",
      regimeStressMode: "LOW_LIQUIDITY_STRESS",
      hypotheticalCompressionStressMultiplier: 1.08,
    },
  },
  {
    id: "w_latency_spread_proxy",
    label: "Market stress + spread / latency hostility proxy",
    category: "LATENCY_PROXY",
    modifiers: {
      systemicRiskAssumption: "MARKET_STRESS",
      regimeStressMode: "NONE",
      hypotheticalCompressionStressMultiplier: 1.12,
    },
  },
]

export type PerWorldStressResult = {
  worldId: string
  label: string
  category: ComparativeEvolutionScenario["category"]
  modifiers: WorldReplayModifiers
  /** Recorded-trade reality (same across worlds). */
  realityPnlUsd: number
  hypotheticalPnlUsd: number
  /** Hypothetical minus reality on same replay. */
  deltaPnlUsd: number
  hypotheticalTradeCount: number
  reliabilityScore: number
  avgCompressionRatio: number | null
}

/** MultiWorldSimulationEngine: orchestrates N shadow replays — never touches production mutation. */
export async function runMultiWorldComparativeSimulation(
  input: ShadowExecutionSessionInput & {
    worlds?: ComparativeEvolutionScenario[]
    suiteLabel?: string
    persistComparative?: boolean
  }
) {
  const worlds =
    input.worlds && input.worlds.length > 0 ? input.worlds : DEFAULT_COMPARATIVE_WORLD_SUITE
  const suiteLabel = input.suiteLabel ?? "default_suite"

  const shared: ShadowExecutionSessionInput = {
    userId: input.userId,
    symbol: input.symbol,
    replayFrom: input.replayFrom,
    replayTo: input.replayTo,
    sandboxProfileId: input.sandboxProfileId,
    proposalId: input.proposalId,
    governancePatch: input.governancePatch,
    confidencePolicy: input.confidencePolicy,
    tradeLimit: input.tradeLimit,
    persist: false,
    quietSandboxLogs: true,
  }

  console.log(
    `[multi-world-simulation] userId=${input.userId} symbol=${shared.symbol} worlds=${worlds.length} suite=${suiteLabel} proposalId=${input.proposalId ?? "-"}`
  )

  const perWorld: PerWorldStressResult[] = []
  let baselineRealityPnl = 0

  for (const w of worlds) {
    const r = await runSandboxSimulation({
      ...shared,
      worldModifiers: w.modifiers,
    })
    const realityPnlUsd = Number(r.counterfactualComparison?.reality?.totalPnlUsd ?? 0)
    const hypoPnl = Number(r.counterfactualComparison?.hypothetical?.totalPnlUsd ?? 0)
    if (!perWorld.length) baselineRealityPnl = realityPnlUsd
    const hypoTrades = Number(r.counterfactualComparison?.hypothetical?.tradeCount ?? 0)
    const avgComp = Number(r.shadowExecutionResult?.avgCompressionRatio ?? NaN)

    const row: PerWorldStressResult = {
      worldId: w.id,
      label: w.label,
      category: w.category,
      modifiers: w.modifiers,
      realityPnlUsd,
      hypotheticalPnlUsd: hypoPnl,
      deltaPnlUsd: hypoPnl - realityPnlUsd,
      hypotheticalTradeCount: hypoTrades,
      reliabilityScore: Number(r.simulationReliability?.score ?? 0),
      avgCompressionRatio: Number.isFinite(avgComp) ? avgComp : null,
    }
    perWorld.push(row)

    console.log(
      `[cross-world-analysis] world=${w.id} deltaPnl=${row.deltaPnlUsd.toFixed(4)} hypoTrades=${hypoTrades} reliability=${row.reliabilityScore.toFixed(3)}`
    )
    console.log(
      `[stress-survivability] world=${w.id} systemic=${w.modifiers.systemicRiskAssumption} regimeMode=${String(w.modifiers.regimeStressMode ?? "NONE")} hypoMult=${String(w.modifiers.hypotheticalCompressionStressMultiplier ?? 1)}`
    )
    console.log(
      `[scenario-divergence] world=${w.id} realityPnl=${realityPnlUsd.toFixed(4)} hypoPnl=${hypoPnl.toFixed(4)}`
    )
  }

  const deltas = perWorld.map((p) => p.deltaPnlUsd)
  const rels = perWorld.map((p) => p.reliabilityScore)
  const eps = Math.max(2, Math.abs(baselineRealityPnl) * 0.02)
  const worldsNotWorseThanReality = perWorld.filter((p) => p.deltaPnlUsd >= -eps).length

  const minReliability = Math.min(...rels, 1)
  const robustnessFraction = worlds.length > 0 ? worldsNotWorseThanReality / worlds.length : 0
  const normalizedDeltas = deltas.map((d) => d / Math.max(20, Math.abs(baselineRealityPnl) || 1))
  const stabilityConsistency = clamp01(1 - stddev(normalizedDeltas) * 1.65)
  const worstDelta = deltas.length ? Math.min(...deltas) : 0
  const bestDelta = deltas.length ? Math.max(...deltas) : 0

  /** Adaptation favors mostly trends if best delta clustered in PROMOTE_VOL / NORMAL only — crude fragility cue */
  const positiveWorldsByCategory = new Map<string, number>()
  for (const p of perWorld) {
    if (p.deltaPnlUsd <= 0) continue
    positiveWorldsByCategory.set(p.category, (positiveWorldsByCategory.get(p.category) ?? 0) + 1)
  }

  /** Governance survivability: hypothetical trade retention under friction */
  const tradeCounts = perWorld.map((p) => p.hypotheticalTradeCount)
  const retentionStability =
    tradeCounts.length > 1 ? clamp01(1 - stddev(tradeCounts) / (mean(tradeCounts) + 0.001) / 8) : 0.72

  const compositeEvolutionFitness = clamp01(
    minReliability * 0.28 +
      robustnessFraction * 0.32 +
      stabilityConsistency * 0.22 +
      retentionStability * 0.18
  )

  const survivabilityProfile = {
    stabilitySurvivability: stabilityConsistency,
    governanceSurvivability: robustnessFraction,
    executionSurvivability: retentionStability,
    regimeSurvivability: clamp01(positiveWorldsByCategory.size / 4),
    rollbackSurvivability: 1,
    /** Proxy: min reliability across worlds caps trust in “confidence realism” under stress */
    confidenceSurvivability: minReliability,
    compositeEvolutionFitness,
  }

  const uniqueSystemic = new Set(worlds.map((w) => w.modifiers.systemicRiskAssumption.toUpperCase()))
  const uniqueRegimeModes = new Set(worlds.map((w) => String(w.modifiers.regimeStressMode ?? "NONE")))
  const suiteDepthPenalty = worlds.length < 5 ? 0.12 : 0
  const diversityScore = clamp01(
    (uniqueSystemic.size / 6) * 0.55 + (uniqueRegimeModes.size / 5) * 0.45 - suiteDepthPenalty
  )

  const adaptationRobustness = {
    worldsWhereHypoNotWorseThanReality: worldsNotWorseThanReality,
    robustnessFraction,
    worstCaseDeltaPnlUsd: worstDelta,
    bestCaseDeltaPnlUsd: bestDelta,
    spreadDeltaPnlUsd: bestDelta - worstDelta,
    positiveWorldCategoryCounts: Object.fromEntries(positiveWorldsByCategory),
    narrative:
      worstDelta < -Math.abs(bestDelta) * 1.4
        ? "Fragile: worst-world drawdown dominates best-world upside"
        : "Moderate cross-world balance — still not live promotion signal",
  }

  const crossWorldComparison = {
    baselineRealityPnlUsd: baselineRealityPnl,
    worldCount: worlds.length,
    perWorld: perWorld.map((p) => ({
      worldId: p.worldId,
      label: p.label,
      category: p.category,
      deltaPnlUsd: p.deltaPnlUsd,
      reliabilityScore: p.reliabilityScore,
      hypotheticalTradeCount: p.hypotheticalTradeCount,
    })),
    adaptationRobustness,
  }

  const metaSimulationReliability = {
    diversityScore,
    worldsEvaluated: worlds.length,
    uniqueSystemicAssumptions: [...uniqueSystemic],
    regimeStressVariety: uniqueRegimeModes.size,
    caveat:
      worlds.length < 5
        ? "Low world count reduces comparative confidence — extend suite when possible."
        : "Synthetic worlds approximate macro stress — not exhaustive rare-event enumeration.",
    simulationBiasFlags: [] as string[],
  }
  const deltaSpread = adaptationRobustness.spreadDeltaPnlUsd
  if (deltaSpread > Math.max(250, Math.abs(baselineRealityPnl || 1) * 2)) {
    metaSimulationReliability.simulationBiasFlags.push("HIGH_CROSS_WORLD_DELTA_SPREAD_MODEL_UNCERTAINTY")
  }
  if (diversityScore < 0.45) {
    metaSimulationReliability.simulationBiasFlags.push("SCENARIO_DIVERSITY_WEAK")
  }

  console.log(`[evolution-fitness] composite=${compositeEvolutionFitness.toFixed(4)} robustnessFrac=${robustnessFraction.toFixed(3)} minReliability=${minReliability.toFixed(3)}`)
  console.log(`[adaptation-robustness] worstDelta=${worstDelta.toFixed(4)} bestDelta=${bestDelta.toFixed(4)} worldsOk=${worldsNotWorseThanReality}/${worlds.length}`)
  console.log(`[simulation-bias] diversity=${diversityScore.toFixed(3)} flags=${JSON.stringify(metaSimulationReliability.simulationBiasFlags)}`)

  const evolutionFitnessSnapshot = {
    evolutionFitnessScore: compositeEvolutionFitness,
    dimensionsExplained: {
      minReliabilityAcrossWorlds: minReliability,
      robustnessFraction,
      stabilityConsistencyAcrossDeltas: stabilityConsistency,
      hypotheticalTradeRetentionStability: retentionStability,
    },
    nonGoals: ["NO_LIVE_PROMOTION", "NO_RL", "NO_PRODUCTION_WRITE"],
  }

  const stressScenarioResults = worlds.map((w, i) => ({
    scenarioId: w.id,
    label: w.label,
    category: w.category,
    stressConditions: w.modifiers,
    outcome: perWorld[i],
  }))

  let comparativeRunId: string | undefined
  if (input.persistComparative !== false) {
    comparativeRunId = await persistComparativeSimulationRun({
      userId: input.userId,
      symbol: shared.symbol ?? input.symbol,
      proposalId: input.proposalId ?? null,
      sandboxProfileId: input.sandboxProfileId ?? null,
      replayFrom: input.replayFrom,
      replayTo: input.replayTo,
      suiteLabel,
      worldsDefinition: worlds,
      baselineRealityPnlUsd: baselineRealityPnl,
      perWorldResults: perWorld,
      evolutionFitnessSnapshot,
      survivabilityProfile,
      crossWorldComparison,
      metaSimulationReliability,
      stressScenarioResults,
    })
    await logEvolutionAudit({
      userId: input.userId,
      proposalId: input.proposalId ?? undefined,
      eventType: "MULTI_WORLD_COMPARATIVE_COMPLETE",
      details: {
        comparativeRunId,
        evolutionFitnessScore: compositeEvolutionFitness,
        worldCount: worlds.length,
      },
    })
  }

  return {
    comparativeRunId,
    suiteLabel,
    worldsEvaluated: worlds.length,
    perWorldStressResults: stressScenarioResults,
    evolutionFitnessSnapshot,
    survivabilityProfile,
    crossWorldComparison,
    metaSimulationReliability,
    evolutionFitnessScore: compositeEvolutionFitness,
  }
}

export async function persistComparativeSimulationRun(payload: {
  userId: string
  symbol: string
  proposalId?: string | null
  sandboxProfileId?: string | null
  replayFrom?: string
  replayTo?: string
  suiteLabel: string
  worldsDefinition: ComparativeEvolutionScenario[]
  baselineRealityPnlUsd: number
  perWorldResults: PerWorldStressResult[]
  evolutionFitnessSnapshot: Record<string, unknown>
  survivabilityProfile: Record<string, unknown>
  crossWorldComparison: Record<string, unknown>
  metaSimulationReliability: Record<string, unknown>
  stressScenarioResults: Record<string, unknown>[]
}) {
  const admin = requireAdmin()
  const id = `mws_${randomUUID()}`
  const row = {
    id,
    userId: payload.userId,
    symbol: payload.symbol.toUpperCase(),
    suiteLabel: payload.suiteLabel.slice(0, 200),
    proposalId: payload.proposalId ?? null,
    sandboxProfileId: payload.sandboxProfileId ?? null,
    replayFrom: payload.replayFrom ?? null,
    replayTo: payload.replayTo ?? null,
    baselineRealityPnlUsd: payload.baselineRealityPnlUsd,
    worldsDefinition: payload.worldsDefinition,
    perWorldResults: payload.perWorldResults,
    evolutionFitnessSnapshot: payload.evolutionFitnessSnapshot,
    survivabilityProfile: payload.survivabilityProfile,
    crossWorldComparison: payload.crossWorldComparison,
    metaSimulationReliability: payload.metaSimulationReliability,
    stressScenarioResults: payload.stressScenarioResults,
  }
  const { error } = await admin.from("ComparativeSimulationRun").insert(row)
  if (error) throw new Error(`DB_WRITE_FAILED: ComparativeSimulationRun insert — ${error.message}`)
  console.log(`[multi-world-simulation] persisted comparativeRunId=${id}`)
  return id
}

export async function listComparativeSimulationRuns(userId: string, limit = 25) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("ComparativeSimulationRun")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(80, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: ComparativeSimulationRun — ${error.message}`)
  return data ?? []
}
