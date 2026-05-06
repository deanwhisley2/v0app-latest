import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { logEvolutionAudit } from "@/lib/evolution-governor"
import {
  runSandboxSimulation,
  type ShadowExecutionSessionInput,
  type WorldReplayModifiers,
} from "@/lib/sandbox-execution-engine"

export type EraSplitMode = "FIXED_DAYS" | "CALENDAR_MONTH" | "EXPLICIT_ERAS"

export type TemporalEraBoundary = {
  id: string
  label: string
  replayFromIso: string
  replayToIso: string
}

/** Deterministic structural-stress rotation across eras (long-cycle hostility proxy — not historical truth). */
export const STRUCTURAL_CYCLE_STRESS_ROTATION: Array<{ key: string; label: string; modifiers: WorldReplayModifiers }> = [
  { key: "calm_carry", label: "Calm systemic baseline", modifiers: { systemicRiskAssumption: "NORMAL", regimeStressMode: "NONE" } },
  {
    key: "corr_compression",
    label: "Elevated correlation / vol lift",
    modifiers: { systemicRiskAssumption: "ELEVATED_CORRELATION", regimeStressMode: "PROMOTE_VOLATILITY" },
  },
  {
    key: "liquidity_wave",
    label: "Liquidity compression phase",
    modifiers: {
      systemicRiskAssumption: "LIQUIDITY_DANGER",
      regimeStressMode: "LOW_LIQUIDITY_STRESS",
      hypotheticalCompressionStressMultiplier: 1.06,
    },
  },
  {
    key: "cascade_persist",
    label: "Sustained cascade bias",
    modifiers: { systemicRiskAssumption: "CASCADE_RISK", regimeStressMode: "CASCADE_BIAS" },
  },
  {
    key: "panic_friction_tail",
    label: "Extreme vol + hostility proxy persistence",
    modifiers: {
      systemicRiskAssumption: "EXTREME_VOLATILITY",
      regimeStressMode: "PANIC_TAIL",
      hypotheticalCompressionStressMultiplier: 1.1,
    },
  },
]

function requireAdmin() {
  return createAdminClient()
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function clamp01(x: number) {
  return clamp(x, 0, 1)
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function stddev(xs: number[]) {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1))
}

function linearSlopeNorm(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return 0
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
  }
  sx /= n
  sy /= n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - sx
    const dy = ys[i] - sy
    num += dx * dy
    den += dx * dx
  }
  if (den < 1e-9) return 0
  const slope = num / den
  const scale = Math.abs(mean(ys)) + 35
  return slope / scale
}

function utcMidnight(ms: number) {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Non-overlapping eras by fixed stride [from, to] inclusive on ISO day boundaries. */
export function buildFixedDayEras(replayFromIso: string, replayToIso: string, strideDays: number): TemporalEraBoundary[] {
  const fromMs = new Date(replayFromIso).getTime()
  const toMs = new Date(replayToIso).getTime()
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return []
  const stride = clamp(Math.round(strideDays), 7, 180)
  const strideMs = stride * 86400_000
  const eras: TemporalEraBoundary[] = []
  let start = utcMidnight(fromMs)
  const endExclusive = utcMidnight(toMs) + 86400_000
  let idx = 0
  while (start < endExclusive && idx < 64) {
    const segEnd = Math.min(start + strideMs - 1, endExclusive - 1)
    eras.push({
      id: `era_fd_${idx}`,
      label: `Fixed ${stride}d slice ${idx + 1}`,
      replayFromIso: new Date(start).toISOString(),
      replayToIso: new Date(segEnd).toISOString(),
    })
    start += strideMs
    idx++
  }
  return eras
}

/** Calendar UTC month buckets between bounds. */
export function buildCalendarMonthEras(replayFromIso: string, replayToIso: string): TemporalEraBoundary[] {
  const from = new Date(replayFromIso)
  const to = new Date(replayToIso)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return []

  let y = from.getUTCFullYear()
  let m = from.getUTCMonth()
  const eras: TemporalEraBoundary[] = []
  for (let guard = 0; guard < 48; guard++) {
    const monthStartMs = Date.UTC(y, m, 1)
    const monthEndMs = Date.UTC(y, m + 1, 1) - 1
    if (monthStartMs > to.getTime()) break

    const segFrom = Math.max(monthStartMs, from.getTime())
    const segTo = Math.min(monthEndMs, to.getTime())
    if (segTo >= segFrom) {
      eras.push({
        id: `era_mo_${y}_${m + 1}`,
        label: `${y}-${String(m + 1).padStart(2, "0")} UTC`,
        replayFromIso: new Date(segFrom).toISOString(),
        replayToIso: new Date(segTo).toISOString(),
      })
    }

    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
    if (Date.UTC(y, m, 1) > to.getTime()) break
  }
  return eras
}

export async function runTemporalEvolutionAnalysis(
  input: ShadowExecutionSessionInput & {
    eraSplitMode?: EraSplitMode
    eraStrideDays?: number
    explicitEras?: TemporalEraBoundary[]
    structuralRotation?: typeof STRUCTURAL_CYCLE_STRESS_ROTATION
    suiteLabel?: string | null
    persistTemporal?: boolean
    disableStructuralRotation?: boolean
  }
) {
  const mode: EraSplitMode = input.explicitEras?.length ? "EXPLICIT_ERAS" : input.eraSplitMode ?? "FIXED_DAYS"
  const rotation = input.structuralRotation ?? STRUCTURAL_CYCLE_STRESS_ROTATION

  let eras: TemporalEraBoundary[]
  if (mode === "EXPLICIT_ERAS" && input.explicitEras?.length) {
    eras = input.explicitEras.map((e, i) => ({
      ...e,
      id: e.id || `era_ex_${i}`,
      label: e.label || `Era ${i + 1}`,
    }))
  } else if (mode === "CALENDAR_MONTH") {
    eras = buildCalendarMonthEras(input.replayFrom ?? "", input.replayTo ?? "")
  } else {
    const stride = input.eraStrideDays ?? 42
    eras = buildFixedDayEras(input.replayFrom ?? "", input.replayTo ?? "", stride)
  }

  console.log(`[temporal-evolution] userId=${input.userId} symbol=${input.symbol} eras=${eras.length} mode=${mode}`)
  if (eras.length === 0) {
    throw new Error(
      "TEMPORAL_INPUT: No eras constructed — supply replayFrom/replayTo, adjust stride, or pass explicitEras[]."
    )
  }

  const sharedBase: Omit<ShadowExecutionSessionInput, "replayFrom" | "replayTo" | "worldModifiers"> = {
    userId: input.userId,
    symbol: input.symbol,
    sandboxProfileId: input.sandboxProfileId,
    proposalId: input.proposalId,
    governancePatch: input.governancePatch,
    confidencePolicy: input.confidencePolicy,
    tradeLimit: input.tradeLimit,
    persist: false,
    quietSandboxLogs: true,
  }

  const perEra: Record<string, unknown>[] = []
  const deltaPnls: number[] = []
  const reliabilities: number[] = []

  let idx = 0
  for (const era of eras) {
    const rot = input.disableStructuralRotation ? rotation[0] : rotation[idx % rotation.length]
    console.log(
      `[era-analysis] era=${era.id} from=${era.replayFromIso} to=${era.replayToIso} stress=${rot.key} structural=${rot.label}`
    )
    const r = await runSandboxSimulation({
      ...sharedBase,
      replayFrom: era.replayFromIso,
      replayTo: era.replayToIso,
      worldModifiers: rot.modifiers,
    })

    const trades = Number(r.shadowExecutionResult?.tradesAnalyzed ?? 0)
    const reality = Number(r.counterfactualComparison?.reality?.totalPnlUsd ?? 0)
    const hypo = Number(r.counterfactualComparison?.hypothetical?.totalPnlUsd ?? 0)
    const delta = hypo - reality
    deltaPnls.push(delta)
    reliabilities.push(Number(r.simulationReliability?.score ?? 0))

    perEra.push({
      era,
      structuralCycleKey: rot.key,
      structuralCycleLabel: rot.label,
      worldModifiers: rot.modifiers,
      tradesAnalyzed: trades,
      realityPnlUsd: reality,
      hypotheticalPnlUsd: hypo,
      deltaPnlUsd: delta,
      simulationReliability: r.simulationReliability,
      skippedEmpty: trades === 0,
    })

    console.log(`[long-horizon-fitness] era=${era.id} trades=${trades} delta=${delta.toFixed(4)} rel=${Number(r.simulationReliability?.score ?? 0).toFixed(3)}`)
    console.log(`[structural-cycle-stress] rotation=${rot.key} systemic=${rot.modifiers.systemicRiskAssumption}`)
    idx++
  }

  const nonEmptyIdx = deltaPnls.map((_, i) => (Number(perEra[i]?.tradesAnalyzed ?? 0) > 0 ? i : -1)).filter((i) => i >= 0)
  const deltasFilled = nonEmptyIdx.map((i) => deltaPnls[i])
  const relFilled = nonEmptyIdx.map((i) => reliabilities[i])

  const norm = deltasFilled.map((d) => d / Math.max(25, Math.abs(mean(deltasFilled)) || 1, 35))
  const persistenceStability = nonEmptyIdx.length >= 3 ? clamp01(1 - stddev(norm) * 1.2) : 0.42
  const minReliability = relFilled.length ? Math.min(...relFilled) : 0
  const half = Math.floor(deltasFilled.length / 2) || 1
  const earlyMean = mean(deltasFilled.slice(0, half))
  const lateMean = mean(deltasFilled.slice(half))
  const adaptationFatigueRatio =
    Math.abs(earlyMean) > 1e-6 ? clamp((lateMean - earlyMean) / (Math.abs(earlyMean) + 20), -1.5, 1.5) : 0
  const slopes = deltasFilled.map((_, i) => i)
  const adaptationFatigueSlope = linearSlopeNorm(slopes, deltasFilled)

  const worldsNotCollapsed = deltasFilled.filter((d) => d >= -Math.max(8, Math.abs(mean(deltasFilled) || 1) * 0.03)).length
  const governanceTemporalResilience = deltasFilled.length ? worldsNotCollapsed / deltasFilled.length : 0

  const temporalSurvivabilityProfile = {
    persistenceStability,
    governanceTemporalResilience,
    temporalDriftResistanceProxy: clamp01(1 - Math.max(0, adaptationFatigueSlope)),
    adaptationFatigueScore: clamp01(1 - Math.abs(adaptationFatigueRatio)),
    structuralRegimeSurvivability: clamp01(mean(relFilled.length ? relFilled : [0.55])),
    delayedRollbackRiskProxy: adaptationFatigueRatio < -0.35 ? 0.45 : 0.12,
  }

  const evolutionPersistenceRecord = {
    deltaPnlPerEra: deltaPnls,
    deltasNonEmptyErasOnly: deltasFilled,
    earlyVsLateMeanDelta: { earlyMean, lateMean, adaptationFatigueRatio },
    adaptationFatigueSlope,
    erasWithTrades: nonEmptyIdx.length,
    erasTotal: eras.length,
  }

  const structuralCycleStressSummary = {
    rotationKeysUsed: eras.map((_, i) => rotation[i % rotation.length].key),
    note: "Each era applies one rotated structural preset over the same hypothetical adaptation.",
  }

  /** Meta skepticism — long-horizon sim trustworthiness */
  const flags: string[] = []
  if (nonEmptyIdx.length < 3) flags.push("INSUFFICIENT_ERA_SAMPLES")
  const yearsSpanned =
    eras.length >= 2
      ? new Date(eras[eras.length - 1].replayToIso).getUTCFullYear() - new Date(eras[0].replayFromIso).getUTCFullYear()
      : 0
  if (yearsSpanned === 0 && eras.length >= 4) flags.push("SINGLE_YEAR_SPAN_BIAS")
  const tradeCountsFilled = nonEmptyIdx.map((i) => Number((perEra[i] as Record<string, unknown>).tradesAnalyzed ?? 0))
  if (tradeCountsFilled.length && mean(tradeCountsFilled) < 2) flags.push("LOW_TRADE_DENSITY_ERAS")

  const temporalReliability = {
    flags,
    minReliabilityAcrossEras: minReliability,
    erasEvaluated: eras.length,
    erasNonEmpty: nonEmptyIdx.length,
    skepticismScore: clamp01(
      minReliability * 0.4 + persistenceStability * 0.35 + (nonEmptyIdx.length >= 4 ? 0.25 : 0.1) - flags.length * 0.07
    ),
    narrative: flags.length ? "Treat long-horizon conclusion as exploratory — skepticism flags active." : "Moderate temporal coverage — still not deployment authority.",
  }

  console.log(`[evolution-persistence] fatigueSlope=${adaptationFatigueSlope.toFixed(6)} fatigueRatio=${adaptationFatigueRatio.toFixed(4)}`)

  console.log(`[temporal-drift] persistenceStable=${persistenceStability.toFixed(3)} governanceTemporal=${governanceTemporalResilience.toFixed(3)}`)
  console.log(`[adaptation-fatigue] earlyMean=${earlyMean.toFixed(4)} lateMean=${lateMean.toFixed(4)}`)

  const longHorizonFitnessProfile = clamp01(
    temporalSurvivabilityProfile.persistenceStability * 0.28 +
      temporalSurvivabilityProfile.governanceTemporalResilience * 0.26 +
      temporalSurvivabilityProfile.temporalDriftResistanceProxy * 0.22 +
      temporalSurvivabilityProfile.structuralRegimeSurvivability * 0.18 +
      (1 - temporalSurvivabilityProfile.delayedRollbackRiskProxy) * 0.06
  )

  console.log(`[temporal-evolution] longHorizonFitness=${longHorizonFitnessProfile.toFixed(4)} skepticism=${temporalReliability.skepticismScore.toFixed(4)}`)

  let temporalRunId: string | undefined
  if (input.persistTemporal !== false) {
    const spanFrom = input.replayFrom ?? eras[0]?.replayFromIso
    const spanTo = input.replayTo ?? eras[eras.length - 1]?.replayToIso
    temporalRunId = await persistTemporalEvolutionRun({
      userId: input.userId,
      symbol: input.symbol,
      suiteLabel: input.suiteLabel ?? "default_temporal",
      replayFrom: spanFrom,
      replayTo: spanTo,
      proposalId: input.proposalId ?? null,
      sandboxProfileId: input.sandboxProfileId ?? null,
      eraSplitMode: mode,
      eraStrideDays: input.eraStrideDays ?? null,
      erasDefinition: eras,
      perEraResults: perEra,
      longHorizonFitnessProfile,
      evolutionPersistenceRecord,
      structuralCycleStressSummary,
      temporalSurvivabilityProfile,
      temporalReliability,
    })
    await logEvolutionAudit({
      userId: input.userId,
      proposalId: input.proposalId ?? undefined,
      eventType: "TEMPORAL_EVOLUTION_COMPLETE",
      details: { temporalRunId, longHorizonFitnessProfile, eras: eras.length },
    })
  }

  return {
    temporalRunId,
    suiteLabel: input.suiteLabel ?? "default_temporal",
    eraSplitMode: mode,
    erasEvaluated: eras,
    longHorizonFitnessScore: longHorizonFitnessProfile,
    longHorizonFitnessProfileDimensions: temporalSurvivabilityProfile,
    evolutionPersistenceRecord,
    structuralCycleStressSummary,
    temporalSurvivabilityProfile,
    temporalReliability,
    perEraResults: perEra,
  }
}

async function persistTemporalEvolutionRun(row: {
  userId: string
  symbol: string
  suiteLabel: string
  replayFrom?: string
  replayTo?: string
  proposalId?: string | null
  sandboxProfileId?: string | null
  eraSplitMode: string
  eraStrideDays: number | null
  erasDefinition: TemporalEraBoundary[]
  perEraResults: unknown[]
  longHorizonFitnessProfile: number
  evolutionPersistenceRecord: Record<string, unknown>
  structuralCycleStressSummary: Record<string, unknown>
  temporalSurvivabilityProfile: Record<string, unknown>
  temporalReliability: Record<string, unknown>
}) {
  const admin = requireAdmin()
  const id = `tev_${randomUUID()}`
  const payload = {
    id,
    userId: row.userId,
    symbol: row.symbol.toUpperCase(),
    suiteLabel: row.suiteLabel.slice(0, 200),
    replayFrom: row.replayFrom ?? null,
    replayTo: row.replayTo ?? null,
    proposalId: row.proposalId ?? null,
    sandboxProfileId: row.sandboxProfileId ?? null,
    eraSplitMode: row.eraSplitMode,
    eraStrideDays: row.eraStrideDays,
    erasDefinition: row.erasDefinition,
    perEraResults: row.perEraResults,
    longHorizonFitnessSnapshot: {
      compositeLongHorizonFitness: row.longHorizonFitnessProfile,
      dimensions: row.temporalSurvivabilityProfile,
    },
    evolutionPersistenceRecord: row.evolutionPersistenceRecord,
    structuralCycleStressSummary: row.structuralCycleStressSummary,
    temporalSurvivabilityProfile: row.temporalSurvivabilityProfile,
    temporalReliability: row.temporalReliability,
  }
  const { error } = await admin.from("TemporalEvolutionRun").insert(payload)
  if (error) throw new Error(`DB_WRITE_FAILED: TemporalEvolutionRun insert — ${error.message}`)
  console.log(`[temporal-evolution] persisted temporalRunId=${id}`)
  return id
}

export async function listTemporalEvolutionRuns(userId: string, limit = 25) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("TemporalEvolutionRun")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(60, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: TemporalEvolutionRun — ${error.message}`)
  return data ?? []
}
