import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { clampSupervisoryWindowDays } from "@/lib/adaptation-governance-window"
import { logEvolutionAudit } from "@/lib/evolution-governor"
import { runInstitutionalGovernanceAssessment } from "@/lib/institutional-governance-assessment"

/**
 * Market-truth alignment over institutional cognition — advisory; does not mutate execution or governance state.
 */

function requireAdmin() {
  return createAdminClient()
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

export type EpistemicCalibrationOptions = {
  userId: string
  calibrationWindowDays?: number
  persist?: boolean
  persistCorrelatedMetaSnapshot?: boolean
  /** Nested causal assessment can suppress calibration stdout. */
  quietCalibrationConsole?: boolean
}

type ExecutionRealityBundle = {
  riskRealizedPnlSum: number
  riskTradeCount: number
  riskMaxConsecutiveLosses: number
  stabilityExecutionConsistencyMean: number | null
  analysisExecutedCount: number
  analysisWinRate: number | null
  tradeMemoryWinRate: number | null
  tradeMemoryN: number
  sampleDensity: "SPARSE" | "MODERATE" | "RICH"
}

async function loadExecutionRealityBundle(userId: string, windowDays: number): Promise<ExecutionRealityBundle> {
  const wd = clampSupervisoryWindowDays(windowDays)
  const since = new Date(Date.now() - wd * 86400_000).toISOString()
  const dayKeyMin = since.slice(0, 10)
  const admin = requireAdmin()

  const [riskRes, stabRes, analysisRes, sessRes] = await Promise.all([
    admin.from("RiskState").select("realizedPnlUsd, tradeCount, consecutiveLosses").eq("userId", userId).gte("dayKey", dayKeyMin),
    admin
      .from("StabilitySnapshot")
      .select("executionConsistencyScore, createdAt")
      .eq("userId", userId)
      .gte("createdAt", since)
      .order("createdAt", { ascending: false })
      .limit(40),
    admin
      .from("AnalysisHistory")
      .select("tradeExecuted, tradeResult")
      .eq("userId", userId)
      .gte("timestamp", since)
      .limit(800),
    admin.from("TradeSession").select("id").eq("userId", userId).gte("startTime", since).limit(400),
  ])

  for (const { label, error } of [
    { label: "RiskState", error: riskRes.error },
    { label: "StabilitySnapshot", error: stabRes.error },
    { label: "AnalysisHistory", error: analysisRes.error },
    { label: "TradeSession", error: sessRes.error },
  ]) {
    if (error) throw new Error(`DB_READ_FAILED: ${label} — ${error.message}`)
  }

  const riskRows = (riskRes.data ?? []) as Array<{ realizedPnlUsd?: number; tradeCount?: number; consecutiveLosses?: number }>
  const riskRealizedPnlSum = riskRows.reduce((a, r) => a + (Number(r.realizedPnlUsd) || 0), 0)
  const riskTradeCount = riskRows.reduce((a, r) => a + (Number(r.tradeCount) || 0), 0)
  const riskMaxConsecutiveLosses = Math.max(0, ...riskRows.map((r) => Number(r.consecutiveLosses) || 0))

  const stabRows = (stabRes.data ?? []) as Array<{ executionConsistencyScore?: number }>
  const esc = stabRows.map((r) => Number(r.executionConsistencyScore)).filter(Number.isFinite)
  const stabilityExecutionConsistencyMean = esc.length ? mean(esc) : null

  const analysisRows = (analysisRes.data ?? []) as Array<{ tradeExecuted?: boolean; tradeResult?: unknown }>
  const executed = analysisRows.filter((r) => r.tradeExecuted === true)
  const analysisExecutedCount = executed.length
  const winsFromResult = executed.filter((r) => {
    const tr = r.tradeResult as { wasWin?: boolean; pnlUsd?: number } | null | undefined
    if (tr && typeof tr.wasWin === "boolean") return tr.wasWin
    if (tr && typeof tr.pnlUsd === "number") return tr.pnlUsd > 0
    return false
  }).length
  const analysisWinRate = analysisExecutedCount > 0 ? winsFromResult / analysisExecutedCount : null

  const sessionIds = (sessRes.data ?? []).map((s) => String((s as { id: string }).id)).filter(Boolean)
  let tradeMemoryN = 0
  let tmWins = 0
  if (sessionIds.length) {
    const tmRes = await admin
      .from("TradeMemory")
      .select("wasWin, pnlUsd")
      .in("sessionId", sessionIds)
      .gte("createdAt", since)
      .limit(400)
    if (tmRes.error) throw new Error(`DB_READ_FAILED: TradeMemory — ${tmRes.error.message}`)
    const tm = (tmRes.data ?? []) as Array<{ wasWin?: boolean; pnlUsd?: number | null }>
    tradeMemoryN = tm.length
    tmWins = tm.filter((r) => r.wasWin === true || (typeof r.pnlUsd === "number" && r.pnlUsd > 0)).length
  }
  const tradeMemoryWinRate = tradeMemoryN > 0 ? tmWins / tradeMemoryN : null

  const densityScore = riskTradeCount + analysisExecutedCount + tradeMemoryN + stabRows.length
  const sampleDensity: ExecutionRealityBundle["sampleDensity"] =
    densityScore < 8 ? "SPARSE" : densityScore < 35 ? "MODERATE" : "RICH"

  return {
    riskRealizedPnlSum,
    riskTradeCount,
    riskMaxConsecutiveLosses,
    stabilityExecutionConsistencyMean,
    analysisExecutedCount,
    analysisWinRate,
    tradeMemoryWinRate,
    tradeMemoryN,
    sampleDensity,
  }
}

function executionQualityScore(exec: ExecutionRealityBundle): number {
  const winBlend =
    exec.tradeMemoryWinRate != null && exec.analysisWinRate != null
      ? (exec.tradeMemoryWinRate * 0.55 + exec.analysisWinRate * 0.45)
      : exec.tradeMemoryWinRate ?? exec.analysisWinRate ?? 0.45

  const pnlNorm = clamp01(Math.tanh(exec.riskRealizedPnlSum / 850 + 0.15))
  const lossPenalty = clamp01(exec.riskMaxConsecutiveLosses / 12)
  const stab = exec.stabilityExecutionConsistencyMean != null ? clamp01(exec.stabilityExecutionConsistencyMean) : 0.5

  const sparseDiscount = exec.sampleDensity === "SPARSE" ? 0.12 : exec.sampleDensity === "MODERATE" ? 0.05 : 0
  let q = clamp01(winBlend * 0.38 + pnlNorm * 0.28 + stab * 0.24 + (exec.riskTradeCount > 0 ? 0.1 : 0) - lossPenalty * 0.18 - sparseDiscount)
  return q
}

export async function runEpistemicCalibrationAssessment(input: EpistemicCalibrationOptions) {
  const windowDays = clampSupervisoryWindowDays(input.calibrationWindowDays ?? 28)

  const [triad, exec] = await Promise.all([
    runInstitutionalGovernanceAssessment({
      userId: input.userId,
      assessmentWindowDays: windowDays,
      persist: false,
      persistCorrelatedMetaSnapshot: input.persistCorrelatedMetaSnapshot === true,
      quietTriadConsole: true,
    }),
    loadExecutionRealityBundle(input.userId, windowDays),
  ])

  const { epistemicMemoryIndex, opportunityBalanceIndex, constitutionalEquilibriumIndex } = triad.compositeIndices
  const internalCoherence = clamp01((epistemicMemoryIndex + opportunityBalanceIndex + constitutionalEquilibriumIndex) / 3)

  const executionScore = executionQualityScore(exec)

  const gapMagnitude = Math.abs(internalCoherence - executionScore)
  const marketTruthCorrelationProxy = clamp01(1 - gapMagnitude * 1.35)

  const densityFactor = exec.sampleDensity === "SPARSE" ? 0.22 : exec.sampleDensity === "MODERATE" ? 0.42 : 0.55
  const selfReferentialRisk = clamp01(
    internalCoherence * (triad.currentCouncilCorrelation.epistemicDiversityHealthScore ?? 0.5) * densityFactor,
  )

  const simVolume =
    typeof triad.currentCouncilCorrelation.rawSignals === "object" && triad.currentCouncilCorrelation.rawSignals !== null
      ? Number((triad.currentCouncilCorrelation.rawSignals as { sampleSizes?: { simulations?: number } }).sampleSizes?.simulations ?? 0)
      : 0
  const governanceFormalismProxy = clamp01(simVolume / 120 + (triad.currentCouncilCorrelation.disagreementStabilityScore ?? 0) * 0.08)

  const realityDivergencePressure =
    internalCoherence > 0.72 && executionScore < 0.42
      ? clamp01(0.55 + gapMagnitude)
      : internalCoherence < 0.45 && executionScore > 0.65
        ? clamp01(0.35 + gapMagnitude * 0.8)
        : clamp01(gapMagnitude * 0.95)

  const institutionalHumilityScore = clamp01(0.35 + marketTruthCorrelationProxy * 0.35 + (exec.sampleDensity === "SPARSE" ? 0.22 : 0.12))

  const antiRecursiveSafeguards = {
    reciprocalValidationPenalty: selfReferentialRisk,
    governanceFormalismWithoutExecutionProxy: clamp01(governanceFormalismProxy * (executionScore < 0.5 ? 1.15 : 0.65)),
    simulationHeavyExecutionLight: clamp01(
      simVolume > 25 && exec.tradeMemoryN + exec.analysisExecutedCount < 5 ? 0.65 : simVolume > 12 ? 0.25 : 0.08,
    ),
    doctrine:
      "Internal agreement must not outrank execution-grounded scores when samples are non-sparse; sparse windows widen uncertainty.",
  }

  const realityAlignmentProfile = {
    internalCoherence,
    executionQualityScore: executionScore,
    cognitionExecutionGap: clamp01(gapMagnitude),
    marketTruthCorrelationProxy,
    calibrationConfidence: exec.sampleDensity === "SPARSE" ? 0.38 : exec.sampleDensity === "MODERATE" ? 0.62 : 0.82,
  }

  const executionGroundingState = {
    bundle: exec,
    winRateBlend:
      exec.tradeMemoryWinRate != null && exec.analysisWinRate != null
        ? exec.tradeMemoryWinRate * 0.55 + exec.analysisWinRate * 0.45
        : exec.tradeMemoryWinRate ?? exec.analysisWinRate ?? null,
    note: "Grounding uses RiskState, StabilitySnapshot, AnalysisHistory (executed), TradeMemory via sessions — not a full accounting audit.",
  }

  const epistemicCalibrationIndex = clamp01(
    marketTruthCorrelationProxy * 0.42 + institutionalHumilityScore * 0.28 + (1 - selfReferentialRisk) * 0.2 + executionScore * 0.1,
  )
  const realityGroundingScore = clamp01(executionScore * 0.55 + marketTruthCorrelationProxy * 0.45)

  const quietCal = input.quietCalibrationConsole === true
  if (!quietCal) {
    console.log(
      `[epistemic-calibration] index=${epistemicCalibrationIndex.toFixed(3)} correlationProxy=${marketTruthCorrelationProxy.toFixed(3)} confidence=${realityAlignmentProfile.calibrationConfidence.toFixed(2)}`,
    )
    console.log(`[market-truth] internal=${internalCoherence.toFixed(3)} execution=${executionScore.toFixed(3)} gap=${gapMagnitude.toFixed(3)}`)
    console.log(`[reality-alignment] divergencePressure=${realityDivergencePressure.toFixed(3)} sample=${exec.sampleDensity}`)
    console.log(`[execution-grounding] pnlSum=${exec.riskRealizedPnlSum.toFixed(2)} trades=${exec.riskTradeCount} tm=${exec.tradeMemoryN} analysisEx=${exec.analysisExecutedCount}`)
    console.log(`[self-referential-risk] composite=${selfReferentialRisk.toFixed(3)} formalism=${antiRecursiveSafeguards.governanceFormalismWithoutExecutionProxy.toFixed(3)}`)
    console.log(`[reality-divergence] pressure=${realityDivergencePressure.toFixed(3)}`)
    console.log(`[institutional-humility] score=${institutionalHumilityScore.toFixed(3)}`)
  }

  let snapshotId: string | undefined
  if (input.persist !== false) {
    snapshotId = await persistCalibrationSnapshot(
      {
        userId: input.userId,
        calibrationWindowDays: windowDays,
        institutionalIndicesSummary: triad.compositeIndices,
        executionRealitySummary: exec,
        marketTruthCorrelation: realityAlignmentProfile,
        realityDivergence: { realityDivergencePressure, flags: buildDivergenceFlags(internalCoherence, executionScore, exec) },
        antiSelfReferentialSafeguards: antiRecursiveSafeguards,
        executionGroundingState,
        epistemicCalibrationIndex,
        realityGroundingScore,
        institutionalHumilityScore,
      },
      quietCal,
    )

    await logEvolutionAudit({
      userId: input.userId,
      eventType: "EPISTEMIC_CALIBRATION_ASSESSMENT_COMPLETE",
      details: { snapshotId, epistemicCalibrationIndex, marketTruthCorrelationProxy },
    })

    await persistCalibrationEvents({
      snapshotId,
      userId: input.userId,
      realityDivergencePressure,
      selfReferentialRisk,
      exec,
    })
  }

  return {
    snapshotId,
    calibrationWindowDays: windowDays,
    epistemicCalibrationIndex,
    realityGroundingScore,
    institutionalHumilityScore,
    realityAlignmentProfile,
    executionGroundingState,
    marketTruthCorrelation: realityAlignmentProfile,
    antiSelfReferentialSafeguards: antiRecursiveSafeguards,
    realityDivergence: { realityDivergencePressure, flags: buildDivergenceFlags(internalCoherence, executionScore, exec) },
    institutionalTriadCorrelation: triad,
  }
}

function buildDivergenceFlags(
  internal: number,
  execution: number,
  exec: ExecutionRealityBundle,
): string[] {
  const f: string[] = []
  if (internal > 0.7 && execution < 0.45) f.push("HIGH_INTERNAL_LOW_EXECUTION")
  if (internal < 0.42 && execution > 0.68) f.push("LOW_INTERNAL_STRONG_EXECUTION")
  if (exec.sampleDensity === "SPARSE") f.push("SPARSE_EXECUTION_SAMPLE")
  if (exec.riskMaxConsecutiveLosses >= 6 && internal > 0.55) f.push("LOSS_STREAK_WITH_COMPLACENT_COGNITION")
  return f
}

async function persistCalibrationSnapshot(
  row: {
    userId: string
    calibrationWindowDays: number
    institutionalIndicesSummary: Record<string, unknown>
    executionRealitySummary: ExecutionRealityBundle
    marketTruthCorrelation: Record<string, unknown>
    realityDivergence: Record<string, unknown>
    antiSelfReferentialSafeguards: Record<string, unknown>
    executionGroundingState: Record<string, unknown>
    epistemicCalibrationIndex: number
    realityGroundingScore: number
    institutionalHumilityScore: number
  },
  suppressPersistLog?: boolean,
) {
  const admin = requireAdmin()
  const id = `ecs_${randomUUID()}`
  const payload = {
    id,
    userId: row.userId,
    calibrationWindowDays: row.calibrationWindowDays,
    institutionalIndicesSummary: row.institutionalIndicesSummary,
    executionRealitySummary: row.executionRealitySummary,
    marketTruthCorrelation: row.marketTruthCorrelation,
    realityDivergence: row.realityDivergence,
    antiSelfReferentialSafeguards: row.antiSelfReferentialSafeguards,
    executionGroundingState: row.executionGroundingState,
    epistemicCalibrationIndex: row.epistemicCalibrationIndex,
    realityGroundingScore: row.realityGroundingScore,
    institutionalHumilityScore: row.institutionalHumilityScore,
  }
  const { error } = await admin.from("EpistemicCalibrationSnapshot").insert(payload)
  if (error) throw new Error(`DB_WRITE_FAILED: EpistemicCalibrationSnapshot — ${error.message}`)
  if (!suppressPersistLog) console.log(`[epistemic-calibration] persisted snapshot ${id}`)
  return id
}

async function persistCalibrationEvents(input: {
  snapshotId: string
  userId: string
  realityDivergencePressure: number
  selfReferentialRisk: number
  exec: ExecutionRealityBundle
}) {
  const admin = requireAdmin()
  const rows: Array<{
    id: string
    userId: string
    snapshotId: string
    severity: string
    category: string
    eventKey: string
    details: Record<string, unknown>
  }> = []

  if (input.realityDivergencePressure > 0.58) {
    rows.push({
      id: `ece_${randomUUID()}`,
      userId: input.userId,
      snapshotId: input.snapshotId,
      severity: "WARN",
      category: "REALITY_DIVERGENCE",
      eventKey: "COGNITION_EXECUTION_MISALIGNMENT",
      details: { realityDivergencePressure: input.realityDivergencePressure },
    })
  }
  if (input.selfReferentialRisk > 0.48 && input.exec.sampleDensity !== "SPARSE") {
    rows.push({
      id: `ece_${randomUUID()}`,
      userId: input.userId,
      snapshotId: input.snapshotId,
      severity: "INFO",
      category: "SELF_REFERENTIAL",
      eventKey: "INTERNAL_RECIPROCITY_WITHOUT_MARKET",
      details: { selfReferentialRisk: input.selfReferentialRisk },
    })
  }
  if (input.exec.sampleDensity === "SPARSE") {
    rows.push({
      id: `ece_${randomUUID()}`,
      userId: input.userId,
      snapshotId: input.snapshotId,
      severity: "INFO",
      category: "CALIBRATION_UNCERTAINTY",
      eventKey: "SPARSE_EXECUTION_GROUNDING",
      details: { sampleDensity: input.exec.sampleDensity },
    })
  }
  if (!rows.length) return
  const { error } = await admin.from("EpistemicCalibrationEvent").insert(rows)
  if (error) throw new Error(`DB_WRITE_FAILED: EpistemicCalibrationEvent — ${error.message}`)
}

export async function listEpistemicCalibrationSnapshots(userId: string, limit = 25) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("EpistemicCalibrationSnapshot")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(60, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: EpistemicCalibrationSnapshot — ${error.message}`)
  return data ?? []
}

export async function listEpistemicCalibrationEvents(userId: string, limit = 80) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("EpistemicCalibrationEvent")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(160, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: EpistemicCalibrationEvent — ${error.message}`)
  return data ?? []
}
