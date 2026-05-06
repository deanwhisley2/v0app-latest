import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getGovernanceState } from "@/lib/global-execution-governor"
import { queryTradeMemory, type TradeMemoryRow } from "@/lib/trade-memory"
import { IMMUTABLE_MUTATION_ZONES, logEvolutionAudit } from "@/lib/evolution-governor"

/** In-sandbox-only governance knobs — strict subset of production row; never persisted to EngineGovernanceState from this module. */
export type SandboxGovernanceOverrides = Partial<{
  effectiveExposureMultiplier: number
  correlationUncertainty: number
  maxPortfolioExposureUsd: number
  maxSymbolExposureUsd: number
}>

export type ConfidencePolicy = Partial<{
  /** Trades below this effective confidence are excluded from hypothetical PnL (stricter approval proxy). */
  minCalibratedToExecute: number
  /** Multiplier applied before the min gate (e.g. 1.05 tightens toward requiring higher raw confidence). */
  scale: number
}>

export type RegimeStressMode = "NONE" | "PROMOTE_VOLATILITY" | "PANIC_TAIL" | "LOW_LIQUIDITY_STRESS" | "CASCADE_BIAS"

export type WorldReplayModifiers = {
  systemicRiskAssumption: string
  regimeStressMode?: RegimeStressMode
  hypotheticalCompressionStressMultiplier?: number
}

export type ShadowExecutionSessionInput = {
  userId: string
  symbol: string
  replayFrom?: string
  replayTo?: string
  /** Optional link to saved profile (merged before governancePatch). */
  sandboxProfileId?: string | null
  /** Optional adaptation proposal — drives mapping + immutability check. */
  proposalId?: string | null
  governancePatch?: SandboxGovernanceOverrides | null
  confidencePolicy?: ConfidencePolicy | null
  /** Regime engine not replayed per bar; default NORMAL for historical systemic stack. */
  systemicRiskAssumption?: string
  worldModifiers?: WorldReplayModifiers | null
  quietSandboxLogs?: boolean
  /** Persist row in SimulationRun */
  persist?: boolean
  tradeLimit?: number
}

const ALLOWED_PATCH_KEYS = new Set([
  "effectiveExposureMultiplier",
  "correlationUncertainty",
  "maxPortfolioExposureUsd",
  "maxSymbolExposureUsd",
])

const REGIME_COMPRESSION: Record<string, number> = {
  TRENDING: 1,
  CHOPPING: 0.9,
  VOLATILE: 0.75,
  PANIC: 0.55,
  LOW_LIQUIDITY: 0.6,
  SIDEWAYS: 0.95,
  LIQUIDITY_STRESS: 0.5,
  CASCADE_CONDITIONS: 0.52,
  RECOVERY_BOUNCE: 0.85,
  UNKNOWN: 0.88,
}

const SYSTEMIC_COMPRESSION: Record<string, number> = {
  NORMAL: 1,
  ELEVATED_CORRELATION: 0.85,
  MARKET_STRESS: 0.7,
  CASCADE_RISK: 0.55,
  EXTREME_VOLATILITY: 0.5,
  LIQUIDITY_DANGER: 0.45,
}

function requireAdmin() {
  return createAdminClient()
}

function normalizeRegime(regime: string): string {
  const u = String(regime || "UNKNOWN").toUpperCase()
  return u in REGIME_COMPRESSION ? u : "UNKNOWN"
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

/** Map stored trade regime through a deterministic stress lens for multi-world comparative replay. */
export function mapRegimeForWorldStress(marketRegime: string, mode: RegimeStressMode | undefined): string {
  if (!mode || mode === "NONE") return marketRegime
  const r = normalizeRegime(marketRegime)
  if (mode === "PROMOTE_VOLATILITY") {
    if (r === "TRENDING" || r === "SIDEWAYS" || r === "UNKNOWN" || r === "CHOPPING" || r === "RECOVERY_BOUNCE") return "VOLATILE"
    return marketRegime
  }
  if (mode === "PANIC_TAIL") {
    if (["VOLATILE", "PANIC", "CHOPPING", "TRENDING", "SIDEWAYS", "UNKNOWN"].includes(r)) return "PANIC"
    return marketRegime
  }
  if (mode === "LOW_LIQUIDITY_STRESS") {
    if (r === "TRENDING" || r === "SIDEWAYS") return "LOW_LIQUIDITY"
    if (r === "VOLATILE" || r === "CHOPPING") return "LIQUIDITY_STRESS"
    return marketRegime
  }
  if (mode === "CASCADE_BIAS") {
    if (["TRENDING", "VOLATILE", "CHOPPING", "PANIC"].includes(r)) return "CASCADE_CONDITIONS"
    return marketRegime
  }
  return marketRegime
}

function governanceCompressionScore(
  gov: SandboxGovernanceOverrides & { effectiveExposureMultiplier?: number; correlationUncertainty?: number },
  regime: string,
  systemic: string
) {
  const rc = REGIME_COMPRESSION[normalizeRegime(regime)] ?? 0.88
  const sc = SYSTEMIC_COMPRESSION[systemic] ?? 1
  const em = Number(gov.effectiveExposureMultiplier ?? 1)
  const corrU = Number(gov.correlationUncertainty ?? 0.2)
  return Math.max(0.35, Math.min(1, rc * sc * em)) * (1 - Math.min(0.4, Math.max(0, corrU * 0.5)))
}

function fingerprintGovernance(gov: Record<string, unknown>) {
  return [
    gov.effectiveExposureMultiplier,
    gov.correlationUncertainty,
    gov.maxPortfolioExposureUsd,
    gov.maxSymbolExposureUsd,
    gov.marketRegime,
    gov.systemicRiskState,
  ]
    .map((v) => (v === undefined || v === null ? "null" : String(v)))
    .join("|")
}

function pickAllowedGovernance(base: Record<string, unknown>): SandboxGovernanceOverrides {
  return {
    effectiveExposureMultiplier: Number(base.effectiveExposureMultiplier ?? 1),
    correlationUncertainty: Number(base.correlationUncertainty ?? 0.2),
    maxPortfolioExposureUsd: Number(base.maxPortfolioExposureUsd ?? 0),
    maxSymbolExposureUsd: Number(base.maxSymbolExposureUsd ?? 0),
  }
}

export function mergeSandboxGovernance(
  baseline: SandboxGovernanceOverrides,
  patch: SandboxGovernanceOverrides | null | undefined
): SandboxGovernanceOverrides {
  if (!patch) return { ...baseline }
  const next = { ...baseline }
  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED_PATCH_KEYS.has(k)) continue
    if (typeof v === "number" && Number.isFinite(v)) {
      ;(next as Record<string, number>)[k] = v
    }
  }
  return next
}

export function assertSandboxPatchSafe(patch: SandboxGovernanceOverrides | null | undefined) {
  if (!patch) return
  for (const k of Object.keys(patch)) {
    if (!ALLOWED_PATCH_KEYS.has(k)) {
      throw new Error(`SANDBOX_REJECT: governance key not allowed in shadow — ${k}`)
    }
  }
}

async function sessionIdsForUserSymbol(userId: string, symbol: string, from?: string, to?: string): Promise<string[]> {
  const admin = requireAdmin()
  let q = admin.from("TradeSession").select("id").eq("userId", userId).eq("symbol", symbol.toUpperCase())
  if (from) q = q.gte("startTime", from)
  if (to) q = q.lte("startTime", to)
  const { data, error } = await q
  if (error) throw new Error(`DB_READ_FAILED: TradeSession — ${error.message}`)
  return (data ?? []).map((r) => String(r.id)).filter(Boolean)
}

async function loadSandboxProfile(userId: string, id: string): Promise<SandboxGovernanceOverrides> {
  const admin = requireAdmin()
  const { data, error } = await admin.from("SandboxGovernanceProfile").select("*").eq("id", id).eq("userId", userId).maybeSingle()
  if (error) throw new Error(`DB_READ_FAILED: SandboxGovernanceProfile — ${error.message}`)
  if (!data) throw new Error("NOT_FOUND: sandbox profile")
  const raw = data.governanceOverrides as Record<string, unknown>
  const patch: SandboxGovernanceOverrides = {}
  for (const k of ALLOWED_PATCH_KEYS) {
    if (typeof raw[k] === "number" && Number.isFinite(raw[k] as number)) {
      ;(patch as Record<string, number>)[k] = raw[k] as number
    }
  }
  assertSandboxPatchSafe(patch)
  return patch
}

type ProposalRow = {
  id: string
  subsystem: string
  parameterKey: string
  proposedValue: unknown
}

function mapProposalToSandbox(proposal: ProposalRow): {
  governancePatch: SandboxGovernanceOverrides | null
  confidencePolicy: ConfidencePolicy | null
  summary: Record<string, unknown>
} {
  const subsystem = String(proposal.subsystem || "").toUpperCase()
  if (IMMUTABLE_MUTATION_ZONES.has(subsystem)) {
    throw new Error("SANDBOX_REJECT: proposal targets immutable zone — cannot simulate autonomous mutation")
  }
  const pv = proposal.proposedValue as Record<string, unknown> | number | null
  const obj = typeof pv === "object" && pv !== null && !Array.isArray(pv) ? pv : null
  const governancePatch: SandboxGovernanceOverrides = {}
  const confidencePolicy: ConfidencePolicy = {}

  const num = typeof pv === "number" && Number.isFinite(pv) ? pv : null
  if (subsystem === "GOVERNANCE_COMPRESSION" || subsystem === "EXPOSURE_MULTIPLIERS_TUNING") {
    if (num != null) governancePatch.effectiveExposureMultiplier = num
    if (obj && typeof obj.effectiveExposureMultiplier === "number") governancePatch.effectiveExposureMultiplier = obj.effectiveExposureMultiplier
    if (obj && typeof obj.correlationUncertainty === "number") governancePatch.correlationUncertainty = obj.correlationUncertainty
  }
  if (subsystem === "CORRELATION_SENSITIVITY") {
    if (num != null) governancePatch.correlationUncertainty = num
    if (obj && typeof obj.correlationUncertainty === "number") governancePatch.correlationUncertainty = obj.correlationUncertainty
  }
  if (subsystem === "CONFIDENCE_CALIBRATION") {
    if (num != null) confidencePolicy.scale = num
    if (obj && typeof obj.minCalibratedToExecute === "number") confidencePolicy.minCalibratedToExecute = obj.minCalibratedToExecute
    if (obj && typeof obj.scale === "number") confidencePolicy.scale = obj.scale
  }
  assertSandboxPatchSafe(Object.keys(governancePatch).length ? governancePatch : null)
  const governancePatchOut = Object.keys(governancePatch).length ? governancePatch : null
  const confidencePolicyOut = Object.keys(confidencePolicy).length ? confidencePolicy : null
  return {
    governancePatch: governancePatchOut,
    confidencePolicy: confidencePolicyOut,
    summary: {
      subsystem,
      parameterKey: proposal.parameterKey,
      proposedValue: proposal.proposedValue,
      ...(governancePatchOut == null && confidencePolicyOut == null
        ? { warning: "No automatic field mapping for this subsystem; pass governancePatch or confidencePolicy." }
        : {}),
    },
  }
}

async function loadProposalRow(userId: string, proposalId: string): Promise<ProposalRow> {
  const admin = requireAdmin()
  const { data, error } = await admin.from("AdaptationProposal").select("id,subsystem,parameterKey,proposedValue").eq("id", proposalId).eq("userId", userId).maybeSingle()
  if (error) throw new Error(`DB_READ_FAILED: AdaptationProposal — ${error.message}`)
  if (!data) throw new Error("NOT_FOUND: proposal")
  return data as ProposalRow
}

function effectiveConfidence(row: TradeMemoryRow, scale: number) {
  const c = row.calibratedConfidence ?? row.rawConfidence ?? 0
  return c * scale
}

function summarizeTrades(rows: TradeMemoryRow[], included: boolean[]) {
  let pnl = 0
  let wins = 0
  let n = 0
  for (let i = 0; i < rows.length; i++) {
    if (!included[i]) continue
    const row = rows[i]
    const p = tradePnlUsd(row)
    pnl += p
    if (p > 0) wins += 1
    n += 1
  }
  return {
    tradeCount: n,
    totalPnlUsd: pnl,
    winRate: n > 0 ? wins / n : 0,
  }
}

function tradePnlUsd(row: TradeMemoryRow) {
  return Number(row.pnlUsd ?? 0)
}

function computeReliability(input: {
  trades: TradeMemoryRow[]
  baselinePnl: number
  hypotheticalPnl: number
  replayToMs: number | null
}) {
  const n = input.trades.length
  const sampleSize = clamp(n / 28, 0, 1)
  const regimes = new Set(input.trades.map((t) => normalizeRegime(t.marketRegime)))
  const regimeDiversity = clamp(regimes.size / 5, 0, 1)
  const now = Date.now()
  const stalenessDays = input.replayToMs ? Math.max(0, (now - input.replayToMs) / 86400_000) : 0
  const stalenessFactor = clamp(1 - stalenessDays * 0.04, 0.4, 1)
  const denom = Math.max(15, Math.abs(input.baselinePnl))
  const divergenceRatio = Math.abs(input.hypotheticalPnl - input.baselinePnl) / denom
  const extremeDivergence = divergenceRatio > 2
  const divergencePenalty = extremeDivergence ? 0.35 : divergenceRatio > 1 ? 0.15 : 0
  const score = clamp(
    0.25 + sampleSize * 0.25 + regimeDiversity * 0.2 + stalenessFactor * 0.2 - divergencePenalty,
    0,
    1
  )
  return {
    score,
    factors: {
      sampleSize,
      regimeDiversity,
      stalenessDays,
      divergenceRatio,
      extremeDivergence,
    },
  }
}

/**
 * Isolated counterfactual replay over TradeMemory + in-memory governance forks.
 * — No live orders, no EngineGovernanceState writes, no execution authority.
 */
export async function runSandboxSimulation(input: ShadowExecutionSessionInput) {
  const systemic = String((input.worldModifiers?.systemicRiskAssumption ?? input.systemicRiskAssumption) || "NORMAL").toUpperCase()
  const regimeStressMode = input.worldModifiers?.regimeStressMode
  const hypoCompressionWorldMult = input.worldModifiers?.hypotheticalCompressionStressMultiplier ?? 1
  const symbol = input.symbol.toUpperCase()
  const limit = Math.max(1, Math.min(500, input.tradeLimit ?? 200))
  const q = input.quietSandboxLogs === true

  if (!q) {
    console.log(
      `[sandbox-run] userId=${input.userId} symbol=${symbol} proposalId=${input.proposalId ?? "-"} profileId=${input.sandboxProfileId ?? "-"}`
    )
  }

  const liveGovRow = (await getGovernanceState()) as unknown as Record<string, unknown>
  const baselineGov = pickAllowedGovernance(liveGovRow)
  const layeredGovernancePatch: SandboxGovernanceOverrides = {}
  const mergeUserPatch = (p: SandboxGovernanceOverrides | null | undefined) => {
    if (!p || !Object.keys(p).length) return
    assertSandboxPatchSafe(p)
    Object.assign(layeredGovernancePatch, p)
  }
  mergeUserPatch(input.governancePatch ?? undefined)
  let confidencePolicy: ConfidencePolicy | null = input.confidencePolicy ? { ...input.confidencePolicy } : null
  let adaptationSummary: Record<string, unknown> | null = null

  if (input.sandboxProfileId) {
    mergeUserPatch(await loadSandboxProfile(input.userId, input.sandboxProfileId))
  }

  if (input.proposalId) {
    const proposal = await loadProposalRow(input.userId, input.proposalId)
    const mapped = mapProposalToSandbox(proposal)
    adaptationSummary = mapped.summary
    mergeUserPatch(mapped.governancePatch ?? undefined)
    confidencePolicy = { ...(mapped.confidencePolicy ?? {}), ...(confidencePolicy ?? {}) }
    if (!Object.keys(confidencePolicy).length) confidencePolicy = null
  }

  const governancePatch = Object.keys(layeredGovernancePatch).length ? layeredGovernancePatch : null
  assertSandboxPatchSafe(governancePatch)
  const hypotheticalGovMerge = mergeSandboxGovernance(baselineGov, governancePatch)

  const sids = await sessionIdsForUserSymbol(input.userId, symbol, input.replayFrom, input.replayTo)
  if (!q) console.log(`[shadow-execution] sessionCount=${sids.length} systemicAssumption=${systemic}`)

  let trades: TradeMemoryRow[] = []
  if (sids.length === 0) {
    console.warn(`[sandbox-run] no TradeSession ids for user/symbol — empty replay`)
  } else {
    trades = await queryTradeMemory({
      sessionIds: sids,
      symbol,
      from: input.replayFrom,
      to: input.replayTo,
      limit,
    })
  }

  const chronological = [...trades].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  const minConf = confidencePolicy?.minCalibratedToExecute ?? 0
  const scale = confidencePolicy?.scale ?? 1

  const baselineIncluded = chronological.map(() => true)
  const hypoIncluded = chronological.map(() => true)
  const compressionFactors: number[] = []

  /** Cumulative notionals vs hypothetical symbol cap proxy */
  let runningNotional = 0
  const maxSym = hypotheticalGovMerge.maxSymbolExposureUsd ?? baselineGov.maxSymbolExposureUsd ?? 0

  for (let i = 0; i < chronological.length; i++) {
    const row = chronological[i]
    const effC = effectiveConfidence(row, scale)
    if (minConf > 0 && effC < minConf) {
      hypoIncluded[i] = false
    }
    const effRegime = mapRegimeForWorldStress(row.marketRegime, regimeStressMode)
    const baseC = governanceCompressionScore(baselineGov, effRegime, systemic)
    let hypoC = governanceCompressionScore(hypotheticalGovMerge, effRegime, systemic) * hypoCompressionWorldMult
    hypoC = clamp(hypoC, 0.12, 1.35)
    const factor = clamp(hypoC / Math.max(0.01, baseC), 0.5, 1.5)
    compressionFactors.push(factor)

    const notional = Math.max(0, (row.entryPrice ?? 0) * (row.quantity ?? 0))
    if (maxSym > 0 && hypoIncluded[i]) {
      if (runningNotional + notional > maxSym) hypoIncluded[i] = false
      else runningNotional += notional
    }
  }

  const baselineStats = summarizeTrades(chronological, baselineIncluded)
  const hypotheticalStats = summarizeTrades(chronological, hypoIncluded)

  /** Hypothetical PnL with compression proxy on included trades */
  let hypotheticalPnlScaled = 0
  for (let i = 0; i < chronological.length; i++) {
    if (!hypoIncluded[i]) continue
    hypotheticalPnlScaled += tradePnlUsd(chronological[i]) * (compressionFactors[i] ?? 1)
  }
  const hypotheticalStatsScaled = {
    ...hypotheticalStats,
    totalPnlUsd: hypotheticalPnlScaled,
  }

  const replayToMs = chronological.length ? new Date(chronological[chronological.length - 1].createdAt).getTime() : null
  const reliability = computeReliability({
    trades: chronological,
    baselinePnl: baselineStats.totalPnlUsd,
    hypotheticalPnl: hypotheticalStatsScaled.totalPnlUsd,
    replayToMs,
  })

  const byRegime: Record<string, { count: number; avgBaselineCompression: number; avgHypoCompression: number }> = {}
  for (let i = 0; i < chronological.length; i++) {
    const effR = normalizeRegime(mapRegimeForWorldStress(chronological[i].marketRegime, regimeStressMode))
    if (!byRegime[effR]) byRegime[effR] = { count: 0, avgBaselineCompression: 0, avgHypoCompression: 0 }
    byRegime[effR].count += 1
    const b = governanceCompressionScore(baselineGov, effR, systemic)
    let hRaw = governanceCompressionScore(hypotheticalGovMerge, effR, systemic) * hypoCompressionWorldMult
    hRaw = clamp(hRaw, 0.12, 1.35)
    byRegime[effR].avgBaselineCompression += b
    byRegime[effR].avgHypoCompression += hRaw
  }
  for (const k of Object.keys(byRegime)) {
    const c = byRegime[k].count || 1
    byRegime[k].avgBaselineCompression /= c
    byRegime[k].avgHypoCompression /= c
  }

  if (!q) {
    console.log(
      `[counterfactual-analysis] baselinePnl=${baselineStats.totalPnlUsd.toFixed(4)} hypoPnl=${hypotheticalStatsScaled.totalPnlUsd.toFixed(4)} hypoTrades=${hypotheticalStats.tradeCount}/${chronological.length}`
    )
    console.log(
      `[simulation-drift] reliabilityScore=${reliability.score.toFixed(3)} extremeDivergence=${String(reliability.factors.extremeDivergence)}`
    )
    console.log(
      `[hypothetical-governance] patch=${JSON.stringify(governancePatch ?? {})} baselineFp=${fingerprintGovernance(liveGovRow).slice(0, 120)}`
    )
    console.log(`[adaptation-simulation] proposalId=${input.proposalId ?? "-"} summary=${JSON.stringify(adaptationSummary ?? {})}`)
    console.log(
      `[simulation-reliability] sample=${chronological.length} regimes=${Object.keys(byRegime).length} stalenessDays=${reliability.factors.stalenessDays.toFixed(2)}`
    )
  }

  const shadowExecutionResult = {
    tradesAnalyzed: chronological.length,
    systemicRiskAssumption: systemic,
    worldModifiers: input.worldModifiers ?? null,
    regimeStressMode: regimeStressMode ?? "NONE",
    avgCompressionRatio:
      compressionFactors.length > 0 ? compressionFactors.reduce((a, b) => a + b, 0) / compressionFactors.length : null,
    byRegime,
    simulatedParameters: {
      governanceBaseline: baselineGov,
      governanceHypothesis: hypotheticalGovMerge,
      confidencePolicy: { minCalibratedToExecute: minConf, scale },
      note: "Compression scaling is a coarse proxy — not exchange fill replay.",
    },
  }

  const counterfactualComparison = {
    reality: baselineStats,
    hypothetical: hypotheticalStatsScaled,
    excludedHypotheticalTrades: chronological.length - hypotheticalStats.tradeCount,
    deltas: {
      pnlUsd: hypotheticalStatsScaled.totalPnlUsd - baselineStats.totalPnlUsd,
      winRate: hypotheticalStatsScaled.winRate - baselineStats.winRate,
      tradeCount: hypotheticalStats.tradeCount - baselineStats.tradeCount,
    },
  }

  const adaptationSimulationSummary = adaptationSummary
    ? {
        ...adaptationSummary,
        governancePatch: governancePatch ?? {},
        confidencePolicy: { minCalibratedToExecute: minConf, scale },
        stabilityImpactProxy: {
          tradeCountDelta: counterfactualComparison.deltas.tradeCount,
          /** Fewer trades under stricter rules often implies lower churn — not identical to drift engine */
          narrative: "Shadow outcome only — do not mutate DriftDetectionState from simulation.",
        },
      }
    : null

  const inputSnapshot = {
    symbol,
    replayFrom: input.replayFrom ?? null,
    replayTo: input.replayTo ?? null,
    systemicRiskAssumption: systemic,
    worldModifiers: input.worldModifiers ?? null,
    proposalId: input.proposalId ?? null,
    sandboxProfileId: input.sandboxProfileId ?? null,
    governancePatch: governancePatch ?? null,
    confidencePolicy: confidencePolicy ?? null,
    tradeSessionIds: sids.slice(0, 50),
    isolationGuarantee: "NO_LIVE_ORDERS_NO_GOVERNANCE_WRITE",
  }

  let runId: string | undefined
  if (input.persist !== false) {
    runId = await persistSimulationRun({
      userId: input.userId,
      symbol,
      proposalId: input.proposalId ?? null,
      sandboxProfileId: input.sandboxProfileId ?? null,
      replayFrom: input.replayFrom,
      replayTo: input.replayTo,
      baselineFingerprint: fingerprintGovernance(liveGovRow),
      inputSnapshot,
      shadowExecutionResult,
      counterfactualComparison,
      adaptationSimulationSummary,
      simulationReliability: reliability,
    })
    await logEvolutionAudit({
      userId: input.userId,
      proposalId: input.proposalId ?? undefined,
      eventType: "SANDBOX_SIMULATION_COMPLETE",
      details: {
        simulationRunId: runId,
        symbol,
        reliabilityScore: reliability.score,
      },
    })
  }

  return {
    runId,
    baselineGovernanceFingerprint: fingerprintGovernance(liveGovRow),
    inputSnapshot,
    shadowExecutionResult,
    counterfactualComparison,
    adaptationSimulationSummary,
    simulationReliability: reliability,
  }
}

export async function persistSimulationRun(row: {
  userId: string
  symbol: string
  proposalId?: string | null
  sandboxProfileId?: string | null
  replayFrom?: string
  replayTo?: string
  baselineFingerprint: string
  inputSnapshot: Record<string, unknown>
  shadowExecutionResult: Record<string, unknown>
  counterfactualComparison: Record<string, unknown>
  adaptationSimulationSummary: Record<string, unknown> | null
  simulationReliability: Record<string, unknown>
}) {
  const admin = requireAdmin()
  const id = `sim_${randomUUID()}`
  const payload = {
    id,
    userId: row.userId,
    symbol: row.symbol.toUpperCase(),
    mode: "SHADOW_REPLAY_COUNTERFACTUAL",
    replayFrom: row.replayFrom ?? null,
    replayTo: row.replayTo ?? null,
    proposalId: row.proposalId ?? null,
    sandboxProfileId: row.sandboxProfileId ?? null,
    baselineGovernanceFingerprint: row.baselineFingerprint,
    inputSnapshot: row.inputSnapshot,
    shadowExecutionResult: row.shadowExecutionResult,
    counterfactualComparison: row.counterfactualComparison,
    adaptationSimulationSummary: row.adaptationSimulationSummary,
    simulationReliability: row.simulationReliability,
  }
  const { error } = await admin.from("SimulationRun").insert(payload)
  if (error) throw new Error(`DB_WRITE_FAILED: SimulationRun insert — ${error.message}`)
  console.log(`[sandbox-run] persisted simulationRunId=${id}`)
  return id
}

export async function listSimulationRuns(userId: string, limit = 30) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("SimulationRun")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: SimulationRun — ${error.message}`)
  return data ?? []
}

export async function createSandboxGovernanceProfile(input: { userId: string; label: string; governanceOverrides: SandboxGovernanceOverrides; notes?: string }) {
  assertSandboxPatchSafe(input.governanceOverrides)
  const admin = requireAdmin()
  const id = `sgp_${randomUUID()}`
  const { error } = await admin.from("SandboxGovernanceProfile").insert({
    id,
    userId: input.userId,
    label: input.label.slice(0, 200),
    governanceOverrides: input.governanceOverrides,
    notes: input.notes?.slice(0, 2000) ?? null,
  })
  if (error) throw new Error(`DB_WRITE_FAILED: SandboxGovernanceProfile — ${error.message}`)
  console.log(`[hypothetical-governance] profile created id=${id} label=${input.label}`)
  return { id }
}

export async function listSandboxProfiles(userId: string, limit = 50) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("SandboxGovernanceProfile")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: SandboxGovernanceProfile — ${error.message}`)
  return data ?? []
}
