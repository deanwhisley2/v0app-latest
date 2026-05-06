import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  clampSupervisoryWindowDays,
  loadAdaptationGovernanceWindow,
  type AdaptationGovernanceWindowSnapshot,
} from "@/lib/adaptation-governance-window"
import {
  IMMUTABLE_MUTATION_ZONES,
  countRecentProposals,
  logEvolutionAudit,
} from "@/lib/evolution-governor"

/** MetaEvolutionSupervisor — supervises the adaptation/simulation discipline, not market execution. */

function requireAdmin() {
  return createAdminClient()
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function clampNum(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function groupCounts<T>(items: T[], keyFn: (t: T) => string): Record<string, number> {
  const m: Record<string, number> = {}
  for (const x of items) {
    const k = keyFn(x)
    m[k] = (m[k] ?? 0) + 1
  }
  return m
}

export type MetaGovernanceAssessmentOptions = {
  userId: string
  supervisoryWindowDays?: number
  persist?: boolean
}

/** Core meta evaluation from a preloaded window bundle (used by pluralistic council without double-fetching). */
export async function evaluateMetaGovernanceForWindow(
  input: MetaGovernanceAssessmentOptions & { supervisoryWindowDays: number },
  data: AdaptationGovernanceWindowSnapshot,
) {
  const windowDays = input.supervisoryWindowDays
  console.log(`[meta-governance] userId=${input.userId} windowDays=${windowDays}`)

  const proposals = data.proposals as Array<Record<string, unknown>>
  const audits = data.audits as Array<Record<string, unknown>>
  const simulations = data.simulations as Array<{ simulationReliability?: { score?: number } | null }>
  const comparatives = data.comparatives as Array<{
    evolutionFitnessSnapshot?: Record<string, unknown> | null
    metaSimulationReliability?: Record<string, unknown> | null
  }>
  const temporals = data.temporals as Array<{
    longHorizonFitnessSnapshot?: Record<string, unknown> | null
    temporalReliability?: Record<string, unknown> | null
  }>
  const rollbacks = data.rollbacks ?? []

  const proposalsByStatus = groupCounts(proposals, (p) => String(p.status ?? "UNKNOWN"))
  const auditsByType = groupCounts(audits, (e) => String(e.eventType ?? "UNKNOWN"))

  const immutableTargetRows = proposals.filter((p) => IMMUTABLE_MUTATION_ZONES.has(String(p.subsystem ?? "").toUpperCase()))
  const immutableRejectedEval = proposals.filter((p) => String(p.evaluationVerdict ?? "") === "REJECT_IMMUTABLE_ZONE")
  const rateInfo = await countRecentProposals(input.userId)

  const simRelScores = simulations
    .map((s) => Number((s.simulationReliability as { score?: number } | undefined)?.score))
    .filter((x) => Number.isFinite(x))
  const avgSimReliability = mean(simRelScores)

  const compFitness = comparatives.map((r) =>
    Number((r.evolutionFitnessSnapshot as { evolutionFitnessScore?: number } | undefined)?.evolutionFitnessScore)
  ).filter(Number.isFinite)
  const skepticFromComp = comparatives
    .map((r) => Number((r.metaSimulationReliability as { skepticismScore?: number } | undefined)?.skepticismScore))
    .filter(Number.isFinite)

  const temporalLh = temporals.map((r) =>
    Number((r.longHorizonFitnessSnapshot as { compositeLongHorizonFitness?: number } | undefined)?.compositeLongHorizonFitness)
  ).filter(Number.isFinite)
  const temporalSkeptic = temporals.map((r) =>
    Number((r.temporalReliability as { skepticismScore?: number } | undefined)?.skepticismScore)
  ).filter(Number.isFinite)

  const experimentVolume = simulations.length + comparatives.length + temporals.length
  const rollbackCount = rollbacks.length
  const rollbackHealthRatio = experimentVolume > 0 ? rollbackCount / experimentVolume : 1

  const simVelocity = simulations.length / Math.max(1, windowDays)
  const proposalCreationsWindow = auditsByType["PROPOSAL_CREATED"] ?? 0

  const recursiveIndicators: Array<{ key: string; severity: "INFO" | "WARN" | "ALERT"; note: string }> = []

  if (simVelocity > 4) {
    recursiveIndicators.push({ key: "SIMULATION_VELOCITY_HIGH", severity: "WARN", note: "High sandbox churn vs window length." })
  }
  if (rateInfo.count >= rateInfo.max - 1 && rateInfo.count > 0) {
    recursiveIndicators.push({ key: "PROPOSAL_RATE_NEAR_CAP", severity: "WARN", note: "Active proposals hugging constitutional rate window." })
  }
  if (experimentVolume >= 25 && rollbackCount <= 2) {
    recursiveIndicators.push({ key: "ROLLBACK_UNDERUSE", severity: "ALERT", note: "Experiments outpacing checkpoints." })
  }
  if (simRelScores.length >= 6 && avgSimReliability > 0.94) {
    recursiveIndicators.push({ key: "CONFIDENCE_INFLATION_PROXY", severity: "WARN", note: "Mean simulation reliability unusually high." })
  }
  if (immutableTargetRows.length > 0) {
    recursiveIndicators.push({ key: "IMMUTABLE_TARGET_RECORDED", severity: "ALERT", note: `Proposals exist targeting immutable subsystem keys (n=${immutableTargetRows.length}).` })
  }
  const multiSimAudit = auditsByType["SANDBOX_SIMULATION_COMPLETE"] ?? 0
  const multiWorldAudit = auditsByType["MULTI_WORLD_COMPARATIVE_COMPLETE"] ?? 0
  const temporalAudit = auditsByType["TEMPORAL_EVOLUTION_COMPLETE"] ?? 0
  if (multiSimAudit + multiWorldAudit + temporalAudit > 35 && rollbackCount === 0) {
    recursiveIndicators.push({ key: "EVOLUTION_WITHOUT_ROLLBACK", severity: "ALERT", note: "Many evolution audits recorded, zero rollback checkpoints." })
  }

  for (const r of recursiveIndicators) {
    console.log(`[recursive-pressure] ${r.severity} ${r.key} — ${r.note}`)
  }

  const constitutionalIntegrity = {
    immutableZoneProposalRows: immutableTargetRows.length,
    rejectImmutableEvaluationCount: immutableRejectedEval.length,
    integrityScore: clamp01(
      1 -
        clampNum(immutableTargetRows.length * 0.18 + Math.min(3, immutableRejectedEval.length) * 0.05, 0, 0.45)
    ),
    deterministicNote: "Rows targeting IMMUTABLE subsystem keys violate intended workflow even if rejected downstream.",
    auditEvidence: {
      evaluationComplete: auditsByType["EVALUATION_COMPLETE"] ?? 0,
      stabilityRecords: auditsByType["STABILITY_APPROVAL_RECORD"] ?? 0,
    },
  }
  console.log(
    `[constitutional-integrity] score=${constitutionalIntegrity.integrityScore.toFixed(3)} immutableRows=${immutableTargetRows.length}`
  )

  const adaptationDisciplineProfile = {
    proposalsByStatus,
    auditsByType: {
      PROPOSAL_CREATED: auditsByType["PROPOSAL_CREATED"] ?? 0,
      SANDBOX_SIMULATION_COMPLETE: auditsByType["SANDBOX_SIMULATION_COMPLETE"] ?? 0,
      MULTI_WORLD_COMPARATIVE_COMPLETE: auditsByType["MULTI_WORLD_COMPARATIVE_COMPLETE"] ?? 0,
      TEMPORAL_EVOLUTION_COMPLETE: auditsByType["TEMPORAL_EVOLUTION_COMPLETE"] ?? 0,
      EVALUATION_COMPLETE: auditsByType["EVALUATION_COMPLETE"] ?? 0,
    },
    proposalRateSnapshot: rateInfo,
    proposalCreationsViaAuditWindow: proposalCreationsWindow,
    simulationRuns: simulations.length,
    comparativeRuns: comparatives.length,
    temporalRuns: temporals.length,
    disciplineFrictionProxy: clamp01(rateInfo.max > 0 ? 1 - rateInfo.count / (rateInfo.max + 3) : 0.72),
  }
  console.log(
    `[adaptation-discipline] proposals=${proposals.length} simulations=${simulations.length} comparative=${comparatives.length} temporal=${temporals.length}`
  )

  const rollbackHealth = {
    rollbackCheckpointCount: rollbackCount,
    experimentVolume,
    rollbackHealthRatio,
  }
  console.log(`[rollback-health] ratio=${rollbackHealthRatio.toFixed(4)} rollbacks=${rollbackCount} experiments=${experimentVolume}`)

  const skepticismSamples = [...simRelScores.map((x) => 1 - Math.min(1, Math.max(0, x))), ...skepticFromComp, ...temporalSkeptic].filter(Number.isFinite)
  const supervisorySkepticismHealth = {
    meanSimulationReliability: Number.isFinite(avgSimReliability) ? avgSimReliability : null,
    meanComparativeSkepticism: skepticFromComp.length ? mean(skepticFromComp) : null,
    meanTemporalSkepticism: temporalSkeptic.length ? mean(temporalSkeptic) : null,
    skepticismVitalityScore: skepticismSamples.length ? clamp01(mean(skepticismSamples)) : 0.58,
    philosophy: "Distrust monotonic confidence without diversity and rollback corroboration.",
  }
  console.log(
    `[supervisory-drift] skepticismVitality=${supervisorySkepticismHealth.skepticismVitalityScore.toFixed(3)} meanSimRel=${supervisorySkepticismHealth.meanSimulationReliability != null ? supervisorySkepticismHealth.meanSimulationReliability.toFixed(3) : "n/a"}`
  )
  if (supervisorySkepticismHealth.skepticismVitalityScore < 0.35) {
    console.warn(`[supervisory-drift] Low skeptic composite — review simulation selection bias`)
  }

  /** Segmented authority: descriptive only; reinforces no single loop self-authorizes mutation. */
  const authoritySegmentation = {
    executionIntelligence: "Live trading path: global governor, startup gate, reconciliation, locks — immutable core.",
    adaptationIntelligence: "Proposals, sandbox, comparative, temporal — hypothetical only; evaluated not auto-applied.",
    supervisoryIntelligence:
      "This meta-layer reads audit + persistence artefacts; cannot alter EngineGovernanceState or apply proposals.",
    rule: "No layer fully governs itself; promotion remains operator/product policy outside these modules.",
  }
  console.log(`[authority-segmentation] layers=EXECUTION_ADAPTATION_SUPERVISORY_READONLY`)

  const adaptationDisciplineComposite = adaptationDisciplineProfile.disciplineFrictionProxy * 0.35 + rollbackHealthRatio * 0.3 + constitutionalIntegrity.integrityScore * 0.35

  let recursivePenalty = recursiveIndicators.filter((x) => x.severity === "ALERT").length * 0.12
  recursivePenalty += recursiveIndicators.filter((x) => x.severity === "WARN").length * 0.05
  const recursiveAmplificationPressure = clamp01(recursivePenalty)

  let fitnessInflationPenalty = 0
  if (compFitness.length >= 3 && mean(compFitness) > 0.92) fitnessInflationPenalty += 0.04
  if (temporalLh.length >= 3 && mean(temporalLh) > 0.92) fitnessInflationPenalty += 0.04

  const metaStabilityScore = clamp01(
    constitutionalIntegrity.integrityScore * 0.28 +
      adaptationDisciplineComposite * 0.24 +
      (1 - recursiveAmplificationPressure) * 0.26 +
      supervisorySkepticismHealth.skepticismVitalityScore * 0.22 -
      fitnessInflationPenalty
  )

  console.log(`[meta-governance] metaStability=${metaStabilityScore.toFixed(4)} recursivePenalty=${recursiveAmplificationPressure.toFixed(3)}`)

  const rawSignals = {
    supervisoryWindowDays: windowDays,
    sinceIso: data.sinceIso,
    sampleSizes: {
      proposals: proposals.length,
      audits: audits.length,
      simulations: simulations.length,
      comparative: comparatives.length,
      temporal: temporals.length,
      rollbacks: rollbackCount,
    },
    evolutionAuditThroughput: {
      sandbox: multiSimAudit,
      multiWorld: multiWorldAudit,
      temporal: temporalAudit,
    },
  }

  let snapshotId: string | undefined
  if (input.persist !== false) {
    snapshotId = await persistMetaGovernanceSnapshot({
      userId: input.userId,
      supervisoryWindowDays: windowDays,
      metaStabilityScore,
      adaptationDisciplineProfile,
      constitutionalIntegrityStatus: constitutionalIntegrity,
      recursivePressure: { indicators: recursiveIndicators, recursiveAmplificationPressure },
      supervisorySkepticismHealth,
      authoritySegmentation,
      rollbackHealth,
      rawSignals,
    })

    await logEvolutionAudit({
      userId: input.userId,
      eventType: "META_GOVERNANCE_ASSESSMENT_COMPLETE",
      details: { snapshotId, metaStabilityScore, recursiveIndicatorCount: recursiveIndicators.length },
    })

    await persistRecursiveMetaEvents({
      snapshotId,
      userId: input.userId,
      recursiveIndicators,
    })
  }

  return {
    snapshotId,
    supervisoryWindowDays: windowDays,
    metaStabilityScore,
    constitutionalIntegrityStatus: constitutionalIntegrity,
    adaptationDisciplineProfile,
    rollbackHealth,
    recursivePressure: { indicators: recursiveIndicators, recursiveAmplificationPressure },
    supervisorySkepticismHealth,
    authoritySegmentation,
    rawSignals,
  }
}

/**
 * Assess adaptation discipline, constitutional integrity proxies, recursive pressure, and supervisory skepticism.
 * Does NOT mutate EngineGovernanceState or apply proposals.
 */
export async function runMetaGovernanceAssessment(input: MetaGovernanceAssessmentOptions) {
  const wd = clampSupervisoryWindowDays(input.supervisoryWindowDays ?? 28)
  const data = await loadAdaptationGovernanceWindow(input.userId, wd)
  return evaluateMetaGovernanceForWindow({ ...input, supervisoryWindowDays: wd }, data)
}

async function persistMetaGovernanceSnapshot(row: {
  userId: string
  supervisoryWindowDays: number
  metaStabilityScore: number
  adaptationDisciplineProfile: Record<string, unknown>
  constitutionalIntegrityStatus: Record<string, unknown>
  recursivePressure: Record<string, unknown>
  supervisorySkepticismHealth: Record<string, unknown>
  authoritySegmentation: Record<string, unknown>
  rollbackHealth: Record<string, unknown>
  rawSignals: Record<string, unknown>
}) {
  const admin = requireAdmin()
  const id = `mgs_${randomUUID()}`
  const payload = {
    id,
    userId: row.userId,
    supervisoryWindowDays: row.supervisoryWindowDays,
    metaStabilityScore: row.metaStabilityScore,
    adaptationDisciplineProfile: row.adaptationDisciplineProfile,
    constitutionalIntegrityStatus: row.constitutionalIntegrityStatus,
    recursivePressure: row.recursivePressure,
    supervisorySkepticismHealth: row.supervisorySkepticismHealth,
    authoritySegmentation: row.authoritySegmentation,
    rollbackHealth: row.rollbackHealth,
    rawSignals: row.rawSignals,
  }
  const { error } = await admin.from("MetaGovernanceSnapshot").insert(payload)
  if (error) throw new Error(`DB_WRITE_FAILED: MetaGovernanceSnapshot — ${error.message}`)
  console.log(`[meta-governance] persisted snapshot ${id}`)
  return id
}

async function persistRecursiveMetaEvents(input: {
  snapshotId: string
  userId: string
  recursiveIndicators: Array<{ key: string; severity: string; note: string }>
}) {
  const admin = requireAdmin()
  const toInsert = input.recursiveIndicators
    .filter((r) => r.severity === "WARN" || r.severity === "ALERT")
    .map((r) => ({
      id: `mge_${randomUUID()}`,
      userId: input.userId,
      snapshotId: input.snapshotId,
      severity: r.severity,
      category: "RECURSIVE_PRESSURE",
      eventKey: r.key.slice(0, 120),
      details: { note: r.note },
    }))
  if (!toInsert.length) return
  const { error } = await admin.from("MetaGovernanceEvent").insert(toInsert)
  if (error) throw new Error(`DB_WRITE_FAILED: MetaGovernanceEvent — ${error.message}`)
}

export async function listMetaGovernanceSnapshots(userId: string, limit = 25) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("MetaGovernanceSnapshot")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(60, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: MetaGovernanceSnapshot — ${error.message}`)
  return data ?? []
}

export async function listMetaGovernanceEvents(userId: string, limit = 50) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("MetaGovernanceEvent")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(120, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: MetaGovernanceEvent — ${error.message}`)
  return data ?? []
}
