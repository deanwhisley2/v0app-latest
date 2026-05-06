import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { resolveAuthoritativeMarketState } from "@/lib/market-state-authority"
import { getResumeGate } from "@/lib/startup-recovery"

export type GovernanceApprovalStatus =
  | "APPROVED"
  | "DENIED"
  | "PAUSED"
  | "RISK_LIMIT_BLOCKED"
  | "RECOVERY_BLOCKED"
  | "GOVERNANCE_LOCKED"

type GovernanceMode = "NORMAL" | "GLOBAL_PAUSE" | "LIQUIDATION_ONLY" | "SAFE_MODE" | "EXECUTION_DISABLED" | "RECOVERY_ONLY"
type HealthState = "HEALTHY" | "DEGRADED" | "RECOVERY_MODE" | "HIGH_RISK" | "PAUSED" | "GOVERNANCE_LOCKED" | "MANUAL_INTERVENTION_REQUIRED"
type MarketRegime =
  | "TRENDING"
  | "VOLATILE"
  | "CHOPPING"
  | "PANIC"
  | "LOW_LIQUIDITY"
  | "SIDEWAYS"
  | "LIQUIDITY_STRESS"
  | "CASCADE_CONDITIONS"
  | "RECOVERY_BOUNCE"
type SystemicRiskState =
  | "NORMAL"
  | "ELEVATED_CORRELATION"
  | "MARKET_STRESS"
  | "CASCADE_RISK"
  | "EXTREME_VOLATILITY"
  | "LIQUIDITY_DANGER"

function requireAdmin() {
  return createAdminClient()
}

function dayKeyUtc() {
  return new Date().toISOString().slice(0, 10)
}

async function getOrInitGovernanceState() {
  const admin = requireAdmin()
  const scope = "GLOBAL"
  const { data, error } = await admin.from("EngineGovernanceState").select("*").eq("scope", scope).maybeSingle()
  if (error) throw new Error(`DB_READ_FAILED: EngineGovernanceState read — ${error.message}`)
  if (data) return data
  const row = {
    id: `gov_${randomUUID()}`,
    scope,
    mode: "NORMAL",
    healthState: "HEALTHY",
    maxPortfolioExposureUsd: 100,
    maxSymbolExposureUsd: 30,
    maxActiveSessions: 20,
    maxConcurrentLiquidations: 5,
    maxDailyLossUsd: 20,
    marketRegime: "TRENDING",
    systemicRiskState: "NORMAL",
    effectiveExposureMultiplier: 1,
    correlationUncertainty: 0.2,
  }
  const { error: insErr } = await admin.from("EngineGovernanceState").insert(row)
  if (insErr) throw new Error(`DB_WRITE_FAILED: EngineGovernanceState insert — ${insErr.message}`)
  return row
}

export async function getGovernanceState() {
  return getOrInitGovernanceState()
}

export async function setGovernanceState(input: {
  mode?: GovernanceMode
  healthState?: HealthState
  reason?: string | null
  maxPortfolioExposureUsd?: number
  maxSymbolExposureUsd?: number
  maxActiveSessions?: number
  maxConcurrentLiquidations?: number
  maxDailyLossUsd?: number
  marketRegime?: MarketRegime
  systemicRiskState?: SystemicRiskState
  effectiveExposureMultiplier?: number
  correlationUncertainty?: number
}) {
  const current = await getOrInitGovernanceState()
  const admin = requireAdmin()
  const patch = {
    mode: input.mode ?? current.mode,
    healthState: input.healthState ?? current.healthState,
    reason: input.reason ?? current.reason ?? null,
    maxPortfolioExposureUsd: input.maxPortfolioExposureUsd ?? current.maxPortfolioExposureUsd,
    maxSymbolExposureUsd: input.maxSymbolExposureUsd ?? current.maxSymbolExposureUsd,
    maxActiveSessions: input.maxActiveSessions ?? current.maxActiveSessions,
    maxConcurrentLiquidations: input.maxConcurrentLiquidations ?? current.maxConcurrentLiquidations,
    maxDailyLossUsd: input.maxDailyLossUsd ?? current.maxDailyLossUsd,
    marketRegime: input.marketRegime ?? current.marketRegime ?? "TRENDING",
    systemicRiskState: input.systemicRiskState ?? current.systemicRiskState ?? "NORMAL",
    effectiveExposureMultiplier: input.effectiveExposureMultiplier ?? current.effectiveExposureMultiplier ?? 1,
    correlationUncertainty: input.correlationUncertainty ?? current.correlationUncertainty ?? 0.2,
    updatedAt: new Date().toISOString(),
  }
  const { error } = await admin.from("EngineGovernanceState").update(patch).eq("scope", "GLOBAL")
  if (error) throw new Error(`DB_WRITE_FAILED: EngineGovernanceState update — ${error.message}`)
  console.log(`[emergency-state] mode=${patch.mode} health=${patch.healthState} reason=${patch.reason ?? "-"}`)
  return { ...current, ...patch }
}

export async function listCorrelationState(baseSymbol: string) {
  return getCorrelationMap(baseSymbol)
}

export async function upsertCorrelationState(input: {
  baseSymbol: string
  relatedSymbol: string
  cluster: string
  correlation: number
  betaWeight?: number
  volatilityWeight?: number
}) {
  const admin = requireAdmin()
  const row = {
    id: `corr_${randomUUID()}`,
    baseSymbol: input.baseSymbol,
    relatedSymbol: input.relatedSymbol,
    cluster: input.cluster,
    correlation: input.correlation,
    betaWeight: input.betaWeight ?? 1,
    volatilityWeight: input.volatilityWeight ?? 1,
  }
  const { error } = await admin.from("AssetCorrelationState").upsert(row, { onConflict: "baseSymbol,relatedSymbol" })
  if (error) throw new Error(`DB_WRITE_FAILED: AssetCorrelationState upsert — ${error.message}`)
  console.log(
    `[portfolio-cluster] base=${input.baseSymbol} related=${input.relatedSymbol} cluster=${input.cluster} corr=${input.correlation}`
  )
}

async function getCorrelationMap(symbol: string) {
  const admin = requireAdmin()
  const { data, error } = await admin.from("AssetCorrelationState").select("*").eq("baseSymbol", symbol)
  if (error) throw new Error(`DB_READ_FAILED: AssetCorrelationState read — ${error.message}`)
  return data ?? []
}

async function seedDefaultCorrelationState(symbol: string) {
  const admin = requireAdmin()
  const defaults = [
    { relatedSymbol: "BTCUSDT", cluster: "MAJOR_BTC_BETA", correlation: 0.9, betaWeight: 1.15, volatilityWeight: 1.1 },
    { relatedSymbol: "ETHUSDT", cluster: "MAJOR_BTC_BETA", correlation: 0.82, betaWeight: 1.08, volatilityWeight: 1.05 },
    { relatedSymbol: "SOLUSDT", cluster: "HIGH_BETA_L1", correlation: 0.8, betaWeight: 1.22, volatilityWeight: 1.2 },
    { relatedSymbol: "BNBUSDT", cluster: "EXCHANGE_BETA", correlation: 0.7, betaWeight: 1.05, volatilityWeight: 1.0 },
    { relatedSymbol: "XRPUSDT", cluster: "ALT_BETA", correlation: 0.65, betaWeight: 1.0, volatilityWeight: 1.1 },
    { relatedSymbol: "DOGEUSDT", cluster: "MEME_VOL", correlation: 0.75, betaWeight: 1.3, volatilityWeight: 1.35 },
  ]
  const rows = defaults.map((d) => ({
    id: `corr_${randomUUID()}`,
    baseSymbol: symbol,
    relatedSymbol: d.relatedSymbol,
    cluster: d.cluster,
    correlation: d.correlation,
    betaWeight: d.betaWeight,
    volatilityWeight: d.volatilityWeight,
  }))
  const { error } = await admin.from("AssetCorrelationState").upsert(rows, { onConflict: "baseSymbol,relatedSymbol" })
  if (error) throw new Error(`DB_WRITE_FAILED: AssetCorrelationState seed — ${error.message}`)
}

async function computeExposureSnapshot(userId: string, symbol: string) {
  const admin = requireAdmin()
  const { data: daemonRows, error: daemonErr } = await admin
    .from("DaemonSymbolState")
    .select("*")
    .eq("userId", userId)
    .eq("positionStatus", "LONG")
  if (daemonErr) throw new Error(`DB_READ_FAILED: DaemonSymbolState exposure read — ${daemonErr.message}`)
  const portfolioExposureUsd = (daemonRows ?? []).reduce((s, r) => s + Number(r.openEntryCost ?? 0), 0)
  const symbolExposureUsd = (daemonRows ?? [])
    .filter((r) => String(r.symbol) === symbol)
    .reduce((s, r) => s + Number(r.openEntryCost ?? 0), 0)

  const { count: activeSessions, error: sessionErr } = await admin
    .from("TradeSession")
    .select("*", { count: "exact", head: true })
    .eq("userId", userId)
    .in("status", ["PENDING", "ACTIVE", "RECONCILING", "RECOVERY_REQUIRED"])
  if (sessionErr) throw new Error(`DB_READ_FAILED: TradeSession active count — ${sessionErr.message}`)

  const { count: activeLiquidations, error: liqErr } = await admin
    .from("ExecutionState")
    .select("*", { count: "exact", head: true })
    .eq("userId", userId)
    .eq("status", "STOP_BUYS")
  if (liqErr) throw new Error(`DB_READ_FAILED: ExecutionState liquidation count — ${liqErr.message}`)

  const { data: riskRows, error: riskErr } = await admin
    .from("RiskState")
    .select("*")
    .eq("userId", userId)
    .eq("dayKey", dayKeyUtc())
  if (riskErr) throw new Error(`DB_READ_FAILED: RiskState read — ${riskErr.message}`)
  const realizedPnlUsd = (riskRows ?? []).reduce((s, r) => s + Number(r.realizedPnlUsd ?? 0), 0)
  let correlationMap = await getCorrelationMap(symbol)
  if (correlationMap.length === 0) {
    await seedDefaultCorrelationState(symbol)
    correlationMap = await getCorrelationMap(symbol)
  }
  const bySymbol = new Map<string, number>()
  for (const r of daemonRows ?? []) {
    bySymbol.set(String(r.symbol), (bySymbol.get(String(r.symbol)) ?? 0) + Number(r.openEntryCost ?? 0))
  }
  let correlatedExposureUsd = 0
  const clusterExposure: Record<string, number> = {}
  for (const rel of correlationMap) {
    const relExposure = bySymbol.get(String(rel.relatedSymbol)) ?? 0
    const corr = Math.max(0, Math.min(1, Number(rel.correlation ?? 0)))
    const weight = Math.max(0.1, Number(rel.betaWeight ?? 1) * Number(rel.volatilityWeight ?? 1))
    const contribution = relExposure * corr * weight
    correlatedExposureUsd += contribution
    const cluster = String(rel.cluster || "UNCLASSIFIED")
    clusterExposure[cluster] = (clusterExposure[cluster] ?? 0) + contribution
  }
  const dominantCluster = Object.entries(clusterExposure).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "NONE"
  const dominantClusterExposureUsd = clusterExposure[dominantCluster] ?? 0

  return {
    portfolioExposureUsd,
    symbolExposureUsd,
    activeSessions: Number(activeSessions ?? 0),
    activeLiquidations: Number(activeLiquidations ?? 0),
    realizedPnlUsd,
    correlatedExposureUsd,
    clusterExposure,
    dominantCluster,
    dominantClusterExposureUsd,
  }
}

async function getStabilityPressurePenalty(userId: string) {
  const admin = requireAdmin()
  const { data } = await admin.from("DriftDetectionState").select("*").eq("userId", userId).maybeSingle()
  const pressure = Number(data?.stabilityPressure ?? 0)
  const driftLevel = String(data?.driftLevel ?? "STABLE")
  const penalty = Math.max(0, Math.min(0.25, pressure * 0.28))
  if (penalty > 0.08) {
    console.warn(
      `[drift-detected] governance-tighten userId=${userId} driftLevel=${driftLevel} pressure=${pressure.toFixed(3)} penalty=${penalty.toFixed(3)}`
    )
  }
  return { penalty, driftLevel, stabilityPressure: pressure }
}

/** Bounded hot-path hook: low epistemic calibration index slightly tightens exposure compression (no full assessment). */
async function getEpistemicCalibrationTightening(userId: string): Promise<number> {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("EpistemicCalibrationSnapshot")
    .select("epistemicCalibrationIndex")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return 0
  const idx = Number(data.epistemicCalibrationIndex)
  if (!Number.isFinite(idx) || idx >= 0.5) return 0
  const t = Math.min(0.08, (0.5 - idx) * 0.22)
  if (t > 0.02) {
    console.log(`[epistemic-governance-hook] calibrationIndex=${idx.toFixed(3)} exposureTightening=${t.toFixed(3)}`)
  }
  return t
}

async function getPerformancePenalty(userId: string) {
  const admin = requireAdmin()
  const [conf, exec] = await Promise.all([
    admin
      .from("ConfidenceAuditSnapshot")
      .select("*")
      .eq("userId", userId)
      .order("createdAt", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("ExecutionQualitySnapshot")
      .select("*")
      .eq("userId", userId)
      .order("createdAt", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const reliabilityError = Number(conf.data?.reliabilityError ?? 0.18)
  const stressPenalty = Number(exec.data?.stressPenalty ?? 0.15)
  const penalty = Math.max(0, Math.min(0.35, reliabilityError * 0.5 + stressPenalty * 0.5))
  if (penalty > 0.18) {
    console.warn(
      `[performance-drift] userId=${userId} reliabilityError=${reliabilityError.toFixed(4)} stressPenalty=${stressPenalty.toFixed(3)} penalty=${penalty.toFixed(3)}`
    )
  }
  return { penalty, reliabilityError, stressPenalty }
}

async function logGovernanceApproval(input: {
  workerId: string
  lane: string
  userId: string
  symbol: string
  action: "BUY" | "SELL"
  status: GovernanceApprovalStatus
  reason?: string
  governanceMode: GovernanceMode
  healthState: HealthState
  exposureSnapshot: Record<string, unknown>
  details?: Record<string, unknown>
}) {
  const admin = requireAdmin()
  const { error } = await admin.from("GovernanceApprovalLog").insert({
    workerId: input.workerId,
    lane: input.lane,
    userId: input.userId,
    symbol: input.symbol,
    action: input.action,
    status: input.status,
    reason: input.reason ?? null,
    governanceMode: input.governanceMode,
    healthState: input.healthState,
    exposureSnapshot: input.exposureSnapshot,
    details: input.details ?? null,
  })
  if (error) throw new Error(`DB_WRITE_FAILED: GovernanceApprovalLog insert — ${error.message}`)
  const tag = input.status === "APPROVED" ? "governance-approval" : "governance-denied"
  console.log(
    `[${tag}] workerId=${input.workerId} lane=${input.lane} symbol=${input.symbol} action=${input.action} status=${input.status} reason=${input.reason ?? "-"}`
  )
}

export async function requestGovernanceApproval(input: {
  workerId: string
  lane: string
  userId: string
  symbol: string
  action: "BUY" | "SELL"
  requestedQuoteUsd?: number
}) {
  const gate = await getResumeGate()
  const state = await getOrInitGovernanceState()
  const mode = (state.mode as GovernanceMode) ?? "NORMAL"
  const healthState = (state.healthState as HealthState) ?? "HEALTHY"
  const live = await resolveAuthoritativeMarketState({
    consumer: "governance-approval",
    scope: "GLOBAL",
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    minRefreshMs: 45_000,
  })
  const regimeCompression: Record<MarketRegime, number> = {
    TRENDING: 1,
    CHOPPING: 0.9,
    VOLATILE: 0.75,
    PANIC: 0.55,
    LOW_LIQUIDITY: 0.6,
    SIDEWAYS: 0.95,
    LIQUIDITY_STRESS: 0.5,
    CASCADE_CONDITIONS: 0.52,
    RECOVERY_BOUNCE: 0.85,
  }
  const systemicCompression: Record<SystemicRiskState, number> = {
    NORMAL: 1,
    ELEVATED_CORRELATION: 0.85,
    MARKET_STRESS: 0.7,
    CASCADE_RISK: 0.55,
    EXTREME_VOLATILITY: 0.5,
    LIQUIDITY_DANGER: 0.45,
  }
  let marketRegime = ((live.marketRegime as MarketRegime) || (state.marketRegime as MarketRegime) || "TRENDING") as MarketRegime
  if (!(marketRegime in regimeCompression)) {
    console.warn(`[market-regime-governance] unmapped regime=${live.marketRegime} degraded=${live.degraded} usingEngineState`)
    marketRegime = ((state.marketRegime as MarketRegime) || "CHOPPING") as MarketRegime
  }
  let systemicRiskState = ((live.systemicRiskState as SystemicRiskState) ||
    (state.systemicRiskState as SystemicRiskState) ||
    "NORMAL") as SystemicRiskState
  if (!(systemicRiskState in systemicCompression)) {
    systemicRiskState = ((state.systemicRiskState as SystemicRiskState) || "NORMAL") as SystemicRiskState
  }
  const liveCorrelationScore = Number(live.correlationScore ?? 0)
  const liveVolatilityScore = Number(live.volatilityScore ?? 0)
  const liveLiquidityStressScore = Number(live.liquidityStressScore ?? 0)
  const exposure = await computeExposureSnapshot(input.userId, input.symbol)
  const perf = await getPerformancePenalty(input.userId)
  const stability = await getStabilityPressurePenalty(input.userId)
  const epistemicTightening = await getEpistemicCalibrationTightening(input.userId)
  const liveCompressionPenalty = 1 - Math.min(0.35, liveVolatilityScore * 0.2 + liveLiquidityStressScore * 0.15 + liveCorrelationScore * 0.15)
  const compressionFactor =
    Math.max(0.35, Math.min(1, regimeCompression[marketRegime] * systemicCompression[systemicRiskState] * Number(state.effectiveExposureMultiplier ?? 1))) *
    (1 - Math.min(0.4, Math.max(0, Number(state.correlationUncertainty ?? 0.2) * 0.5))) *
    Math.max(0.5, liveCompressionPenalty) *
    (1 - perf.penalty) *
    (1 - stability.penalty) *
    Math.max(0.92, 1 - epistemicTightening)
  const compressedPortfolioLimit = Number(state.maxPortfolioExposureUsd) * compressionFactor
  const compressedSymbolLimit = Number(state.maxSymbolExposureUsd) * compressionFactor
  const effectivePortfolioExposure =
    exposure.portfolioExposureUsd + exposure.correlatedExposureUsd * Math.max(0.25, Number(state.correlationUncertainty ?? 0.2))
  const requested = input.action === "BUY" ? Number(input.requestedQuoteUsd ?? 0) : 0
  const projectedEffectiveExposure = effectivePortfolioExposure + requested
  const projectedPortfolio = exposure.portfolioExposureUsd + requested
  const projectedSymbol = exposure.symbolExposureUsd + requested
  const clusterConcentrationRatio = effectivePortfolioExposure > 0 ? exposure.dominantClusterExposureUsd / effectivePortfolioExposure : 0

  let status: GovernanceApprovalStatus = "APPROVED"
  let reason: string | undefined
  if (gate.status !== "SAFE_TO_RESUME") {
    status = "RECOVERY_BLOCKED"
    reason = `startup gate=${gate.status}`
  } else if (mode === "EXECUTION_DISABLED" || mode === "GLOBAL_PAUSE") {
    status = "PAUSED"
    reason = `governance mode=${mode}`
  } else if (mode === "GOVERNANCE_LOCKED") {
    status = "GOVERNANCE_LOCKED"
    reason = "governance locked"
  } else if (mode === "RECOVERY_ONLY") {
    status = "RECOVERY_BLOCKED"
    reason = "recovery-only mode"
  } else if (mode === "LIQUIDATION_ONLY" && input.action === "BUY") {
    status = "DENIED"
    reason = "liquidation-only mode blocks BUY"
  } else if (
    input.action === "BUY" &&
    (projectedEffectiveExposure > compressedPortfolioLimit ||
      projectedSymbol > compressedSymbolLimit ||
      exposure.activeSessions >= Number(state.maxActiveSessions) ||
      exposure.activeLiquidations >= Number(state.maxConcurrentLiquidations) ||
      exposure.realizedPnlUsd <= -Math.abs(Number(state.maxDailyLossUsd)) ||
      clusterConcentrationRatio > 0.72)
  ) {
    status = "RISK_LIMIT_BLOCKED"
    reason = "portfolio/correlation risk limits exceeded"
  } else if (input.action === "BUY" && (systemicRiskState === "CASCADE_RISK" || systemicRiskState === "LIQUIDITY_DANGER")) {
    status = "RISK_LIMIT_BLOCKED"
    reason = `cascade-protection active (${systemicRiskState})`
  } else if (
    input.action === "BUY" &&
    (stability.driftLevel === "CRITICAL_INSTABILITY" ||
      (stability.driftLevel === "SEVERE_DRIFT" && stability.stabilityPressure >= 0.72))
  ) {
    status = "RISK_LIMIT_BLOCKED"
    reason = `stability-gate drift=${stability.driftLevel}`
    console.warn(`[stability-pressure] blocking BUY symbol=${input.symbol} drift=${stability.driftLevel}`)
  }

  const snapshot = {
    ...exposure,
    projectedPortfolioExposureUsd: projectedPortfolio,
    projectedSymbolExposureUsd: projectedSymbol,
    effectivePortfolioExposureUsd: effectivePortfolioExposure,
    projectedEffectiveExposureUsd: projectedEffectiveExposure,
    marketRegime,
    systemicRiskState,
    compressionFactor,
    liveVolatilityScore,
    liveLiquidityStressScore,
    liveCorrelationScore,
    performancePenalty: perf.penalty,
    confidenceReliabilityError: perf.reliabilityError,
    executionStressPenalty: perf.stressPenalty,
    stabilityPenalty: stability.penalty,
    driftLevel: stability.driftLevel,
    stabilityPressure: stability.stabilityPressure,
    epistemicCalibrationTightening: epistemicTightening,
    authoritativeMarketDegraded: live.degraded,
    compressedPortfolioLimitUsd: compressedPortfolioLimit,
    compressedSymbolLimitUsd: compressedSymbolLimit,
    clusterConcentrationRatio,
  }
  console.log(
    `[correlation-risk] symbol=${input.symbol} effectiveExposure=${effectivePortfolioExposure.toFixed(2)} correlated=${exposure.correlatedExposureUsd.toFixed(2)} dominantCluster=${exposure.dominantCluster}`
  )
  console.log(
    `[market-regime-governance] regime=${marketRegime} systemic=${systemicRiskState} compression=${compressionFactor.toFixed(3)} liveDegraded=${live.degraded} epistemicTightening=${epistemicTightening.toFixed(3)}`
  )
  if (status === "RISK_LIMIT_BLOCKED" && reason?.includes("cascade-protection")) {
    console.warn(`[cascade-protection] symbol=${input.symbol} reason=${reason}`)
  }
  await logGovernanceApproval({
    workerId: input.workerId,
    lane: input.lane,
    userId: input.userId,
    symbol: input.symbol,
    action: input.action,
    status,
    reason,
    governanceMode: mode,
    healthState,
    exposureSnapshot: snapshot,
  })
  return { status, approved: status === "APPROVED", reason, governanceMode: mode, healthState, exposureSnapshot: snapshot }
}
