import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { loadAdaptationGovernanceWindow } from "@/lib/adaptation-governance-window"
import { clampSupervisoryWindowDays } from "@/lib/adaptation-governance-window"
import type { AdaptationGovernanceWindowSnapshot } from "@/lib/adaptation-governance-window"
import { evaluateMetaGovernanceForWindow } from "@/lib/meta-evolution-supervisor"
import type { MetaGovernanceAssessmentOptions } from "@/lib/meta-evolution-supervisor"
import { logEvolutionAudit } from "@/lib/evolution-governor"

/** Pluralistic cognitive council — multiple specialist lenses + debate; no mutation authority. */

function requireAdmin() {
  return createAdminClient()
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function stdev(xs: number[]) {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const v = mean(xs.map((x) => (x - m) ** 2))
  return Math.sqrt(v)
}

export type CognitiveSpecialistId =
  | "COGNITIVE_STABILITY"
  | "GOVERNANCE_SKEPTIC"
  | "SIMULATION_RELIABILITY_AUDITOR"
  | "ADAPTATION_CONSERVATIVE"
  | "SURVIVABILITY_STRESS"
  | "DRIFT_ESCALATION"
  | "CONSTITUTIONAL_GUARDIAN"

export type SpecialistStance = "SUPPORT" | "CHALLENGE" | "NEUTRAL"

export type CognitiveSpecialistAssessment = {
  specialistId: CognitiveSpecialistId
  displayLabel: string
  stance: SpecialistStance
  confidence: number
  stressScore: number
  rationale: string[]
  adversarialTargets: CognitiveSpecialistId[]
  institutionalizedDissentNote: string
}

function buildCouncil(
  data: AdaptationGovernanceWindowSnapshot,
  meta: Awaited<ReturnType<typeof evaluateMetaGovernanceForWindow>>,
): CognitiveSpecialistAssessment[] {
  const integrity = meta.constitutionalIntegrityStatus.integrityScore as number
  const metaStability = meta.metaStabilityScore
  const recur = meta.recursivePressure.indicators ?? []
  const hasSimInflation = recur.some((x) => x.key === "CONFIDENCE_INFLATION_PROXY")
  const rollbackRatio = meta.rollbackHealth.rollbackHealthRatio as number
  const rollbackCount = meta.rollbackHealth.rollbackCheckpointCount as number
  const experimentVol = meta.rollbackHealth.experimentVolume as number
  const rate = meta.adaptationDisciplineProfile.proposalRateSnapshot as { count: number; max: number }
  const meanSimRel = meta.supervisorySkepticismHealth.meanSimulationReliability as number | null

  const compFitness = data.comparatives
    .map((r) => Number((r.evolutionFitnessSnapshot as { evolutionFitnessScore?: number } | undefined)?.evolutionFitnessScore))
    .filter(Number.isFinite)
  const temporalLh = data.temporals
    .map((r) => Number((r.longHorizonFitnessSnapshot as { compositeLongHorizonFitness?: number } | undefined)?.compositeLongHorizonFitness))
    .filter(Number.isFinite)
  const survivabilitySpread = stdev([...compFitness, ...temporalLh])

  const immutableRows = meta.constitutionalIntegrityStatus.immutableZoneProposalRows as number

  const cognitiveStability: CognitiveSpecialistAssessment = {
    specialistId: "COGNITIVE_STABILITY",
    displayLabel: "Stability convergence lens",
    stressScore: clamp01((1 - metaStability) * 0.7 + recur.filter((x) => x.severity === "ALERT").length * 0.1),
    confidence: clamp01(metaStability * 0.85 + (1 - recur.filter((x) => x.severity === "ALERT").length * 0.15)),
    stance: metaStability > 0.72 && recur.every((x) => x.severity !== "ALERT") ? "SUPPORT" : "CHALLENGE",
    rationale: [
      metaStability > 0.72 ? "Meta-stability composite is in-band." : "Meta-stability is stressed — cross-check adaptation velocity.",
      recur.some((x) => x.severity === "ALERT") ? "Recursive supervisory flags include ALERT — treat unified calm as suspicious." : "No ALERT-class recursive-pressure flags.",
    ],
    adversarialTargets: [],
    institutionalizedDissentNote: "Assumes monotone stability can hide correlated optimism elsewhere.",
  }
  cognitiveStability.adversarialTargets = hasSimInflation && cognitiveStability.stance === "SUPPORT" ? ["SIMULATION_RELIABILITY_AUDITOR"] : []

  const governanceSkeptic: CognitiveSpecialistAssessment = {
    specialistId: "GOVERNANCE_SKEPTIC",
    displayLabel: "Governance pessimist",
    stressScore: clamp01((1 - integrity) * 0.9 + (immutableRows > 0 ? 0.35 : 0)),
    confidence: clamp01(0.45 + integrity * 0.4),
    stance: integrity < 0.92 || immutableRows > 0 ? "CHALLENGE" : "NEUTRAL",
    rationale: [
      `Constitutional integrity score ${integrity.toFixed(3)}.`,
      immutableRows > 0 ? `Immutable-zone proposal rows observed (n=${immutableRows}).` : "No immutable-target rows counted in window.",
    ],
    adversarialTargets:
      cognitiveStability.stance === "SUPPORT" && metaStability > 0.75 ? ["COGNITIVE_STABILITY"] : ["SIMULATION_RELIABILITY_AUDITOR"],
    institutionalizedDissentNote: "Defaults to doubting procedural green lights without adversarial corroboration.",
  }

  const simulationAuditor: CognitiveSpecialistAssessment = {
    specialistId: "SIMULATION_RELIABILITY_AUDITOR",
    displayLabel: "Simulation skeptic",
    stressScore: clamp01(
      meanSimRel != null && Number.isFinite(meanSimRel)
        ? Math.max(0, (meanSimRel - 0.82) / 0.22) + (hasSimInflation ? 0.35 : 0)
        : 0.35,
    ),
    confidence: clamp01(meanSimRel != null ? 0.5 + (1 - meanSimRel) * 0.5 : 0.55),
    stance: meanSimRel != null && meanSimRel > 0.92 && data.simulations.length >= 6 ? "CHALLENGE" : meanSimRel != null && meanSimRel < 0.78 ? "SUPPORT" : "NEUTRAL",
    rationale: [
      meanSimRel != null
        ? `Mean sandbox reliability scalar ${meanSimRel.toFixed(3)} (${data.simulations.length} runs).`
        : "Insufficient simulation reliability observations — treat narratives as incomplete.",
      hasSimInflation ? "Supervisor flagged confidence-inflation proxy." : "No explicit inflation flag from recursive supervisor.",
    ],
    adversarialTargets: metaStability > 0.8 && cognitiveStability.stance === "SUPPORT" ? ["COGNITIVE_STABILITY"] : [],
    institutionalizedDissentNote: "Assumes shadow paths can be systematically optimistic versus production.",
  }

  const nearCap = rate.max > 0 && rate.count >= rate.max - 1
  const adaptationConservative: CognitiveSpecialistAssessment = {
    specialistId: "ADAPTATION_CONSERVATIVE",
    displayLabel: "Adaptation pacing conservative",
    stressScore: clamp01(nearCap ? 0.75 : rate.count / Math.max(1, rate.max + 5)),
    confidence: clamp01(0.55 + (nearCap ? 0.25 : 0)),
    stance: nearCap ? "CHALLENGE" : "NEUTRAL",
    rationale: [
      `Proposal-rate window snapshot: ${rate.count} / ${rate.max}.`,
      nearCap ? "Rate hugging constitutional cap — monoculture velocity risk." : "Rate headroom appears non-trivial.",
    ],
    adversarialTargets: cognitiveStability.stance === "SUPPORT" ? ["COGNITIVE_STABILITY"] : [],
    institutionalizedDissentNote: "Distrusts rising adaptation tempo without widening evidence diversity.",
  }

  const survivStress: CognitiveSpecialistAssessment = {
    specialistId: "SURVIVABILITY_STRESS",
    displayLabel: "Survivability stress reviewer",
    stressScore:
      compFitness.length + temporalLh.length >= 6
        ? clamp01(Math.max(0, 0.45 - survivabilitySpread * 2.2))
        : clamp01(0.5),
    confidence: clamp01(0.4 + clamp01((compFitness.length + temporalLh.length) / 20)),
    stance: survivabilitySpread < 0.04 && compFitness.length + temporalLh.length >= 8 ? "CHALLENGE" : "NEUTRAL",
    rationale: [
      `Fitness sample spread (σ) ≈ ${survivabilitySpread.toFixed(4)} across ${compFitness.length + temporalLh.length} scored runs.`,
      survivabilitySpread < 0.06 && compFitness.length + temporalLh.length >= 6
        ? "Tight fitness cluster — possible synchronized survivability bias."
        : "Spread is non-trivial or samples are thin.",
    ],
    adversarialTargets: ["COGNITIVE_STABILITY"],
    institutionalizedDissentNote: "Treats low cross-run variance as epistemic fragility, not strength.",
  }

  const driftWatcher: CognitiveSpecialistAssessment = {
    specialistId: "DRIFT_ESCALATION",
    displayLabel: "Drift / rollback escalation",
    stressScore: clamp01(experimentVol > 0 ? 1 - Math.min(1, rollbackRatio * 1.2) : 0.2),
    confidence: clamp01(0.5 + (rollbackRatio < 0.15 && experimentVol > 15 ? 0.35 : 0)),
    stance: experimentVol >= 20 && rollbackRatio < 0.12 ? "CHALLENGE" : "NEUTRAL",
    rationale: [
      `Rollback ratio ${rollbackRatio.toFixed(3)} over ${experimentVol} experiments (${rollbackCount} checkpoints).`,
      rollbackRatio < 0.12 && experimentVol > 12 ? "Checkpoints thin versus experiment volume." : "Checkpoint cadence not extreme by heuristic.",
    ],
    adversarialTargets: simulationAuditor.stance !== "CHALLENGE" ? ["SIMULATION_RELIABILITY_AUDITOR"] : [],
    institutionalizedDissentNote: "Distrusts low rollback frequency paired with high hypothetical churn.",
  }

  const constitutionalGuardian: CognitiveSpecialistAssessment = {
    specialistId: "CONSTITUTIONAL_GUARDIAN",
    displayLabel: "Immutable-boundary guardian",
    stressScore: clamp01(immutableRows * 0.25 + (1 - integrity) * 0.6),
    confidence: clamp01(0.7 + (immutableRows > 0 ? 0.2 : 0)),
    stance: immutableRows > 0 || integrity < 0.88 ? "CHALLENGE" : "SUPPORT",
    rationale: [
      `Integrity ${integrity.toFixed(3)}; immutable-target rows ${immutableRows}.`,
      "Operates under assumption that any immutable targeting is a boundary incident until disproven.",
    ],
    adversarialTargets: ["COGNITIVE_STABILITY", "SIMULATION_RELIABILITY_AUDITOR"],
    institutionalizedDissentNote: "Explicitly distrusts optimistic specialists when constitutional signals conflict.",
  }

  return [
    cognitiveStability,
    governanceSkeptic,
    simulationAuditor,
    adaptationConservative,
    survivStress,
    driftWatcher,
    constitutionalGuardian,
  ]
}

function governanceDebateFromCouncil(assessments: CognitiveSpecialistAssessment[]) {
  const minority = assessments.filter((a) => a.stance === "CHALLENGE" || a.stressScore > 0.55)
  const rounds = [
    {
      round: 1,
      theme: "CONSTITUTIONAL_AND_ROLLBACK",
      summary: "Immutable signals vs checkpoint health vs stability optimism.",
      positions: assessments.map((a) => ({
        specialistId: a.specialistId,
        stance: a.stance,
        headline: a.rationale[0] ?? "",
      })),
    },
    {
      round: 2,
      theme: "SIMULATION_AND_SURVIVABILITY",
      summary: "Reliability inflation and fitness diversity challenge.",
      positions: assessments
        .filter((a) => ["SIMULATION_RELIABILITY_AUDITOR", "SURVIVABILITY_STRESS", "COGNITIVE_STABILITY"].includes(a.specialistId))
        .map((a) => ({
          specialistId: a.specialistId,
          stance: a.stance,
          headline: a.rationale.slice(0, 2).join(" — "),
        })),
    },
  ]
  const adversarialEdges = assessments.flatMap((a) =>
    a.adversarialTargets.map((t) => ({ from: a.specialistId, to: t, kind: "CHALLENGE" as const })),
  )
  return { rounds, minorityOpinionSpecialists: minority.map((m) => m.specialistId), adversarialEdges }
}

function scorePluralistic(
  assessments: CognitiveSpecialistAssessment[],
  debate: ReturnType<typeof governanceDebateFromCouncil>,
  meta: Awaited<ReturnType<typeof evaluateMetaGovernanceForWindow>>,
) {
  const stresses = assessments.map((a) => a.stressScore)
  const σ = stdev(stresses)
  const stances = assessments.map((a) => a.stance)
  const supportN = stances.filter((s) => s === "SUPPORT").length
  const challengeN = stances.filter((s) => s === "CHALLENGE").length
  const neutralN = stances.length - supportN - challengeN

  const diversityFromSpread = clamp01(σ * 3.2)
  const adversarialVitality = clamp01(debate.adversarialEdges.length / 12)
  const minorityRatio = debate.minorityOpinionSpecialists.length / Math.max(1, assessments.length)
  const skepticDiv = clamp01(meta.supervisorySkepticismHealth.skepticismVitalityScore as number)

  let epistemicDiversityHealth = clamp01(
    diversityFromSpread * 0.28 + adversarialVitality * 0.22 + minorityRatio * 0.22 + skepticDiv * 0.28,
  )

  let disagreementIntegrity = clamp01(0.55 + σ * 2.4 - Math.abs(supportN - challengeN) * 0.04)
  if (σ < 0.07 && challengeN <= 1) epistemicDiversityHealth *= 0.72
  if (challengeN >= assessments.length - 1) disagreementIntegrity = clamp01(disagreementIntegrity * 0.85)

  const pluralismBalance = (() => {
    const w = stresses.map((s) => s + 0.05)
    const sum = w.reduce((a, b) => a + b, 0) || 1
    const p = w.map((x) => x / sum)
    const h = -p.reduce((acc, pi) => acc + (pi > 0 ? pi * Math.log(pi) : 0), 0)
    const hmax = Math.log(assessments.length)
    return hmax > 0 ? clamp01(h / hmax) : 0.5
  })()

  const disagreementStabilityScore = clamp01(
    epistemicDiversityHealth * 0.34 + disagreementIntegrity * 0.26 + pluralismBalance * 0.24 + (1 - Math.min(1, supportN / 8)) * 0.16,
  )

  return {
    epistemicDiversityHealthScore: epistemicDiversityHealth,
    disagreementStabilityScore,
    diversityDiagnostics: {
      stressStdev: σ,
      stanceCounts: { SUPPORT: supportN, CHALLENGE: challengeN, NEUTRAL: neutralN },
      adversarialEdgeCount: debate.adversarialEdges.length,
      minorityOpinionCount: debate.minorityOpinionSpecialists.length,
    },
    cognitiveAuthorityBalance: {
      pluralismEntropyBalance: pluralismBalance,
      note: "Higher entropy of stress-weighted voice reduces single-lens dominance (descriptive only).",
    },
    disagreementIntegrityScore: disagreementIntegrity,
  }
}

export type PluralisticCouncilOptions = {
  userId: string
  cognitiveWindowDays?: number
  persist?: boolean
  /** When true, also persists MetaGovernanceSnapshot for the same window (default false). */
  persistCorrelatedMetaSnapshot?: boolean
  /** Nested institutional assessments can suppress repetitive council stdout. */
  quietCouncilConsole?: boolean
}

export async function runPluralisticCognitiveCouncil(input: PluralisticCouncilOptions) {
  const windowDays = clampSupervisoryWindowDays(input.cognitiveWindowDays ?? 28)
  const data = await loadAdaptationGovernanceWindow(input.userId, windowDays)

  const metaOpts: MetaGovernanceAssessmentOptions & { supervisoryWindowDays: number } = {
    userId: input.userId,
    supervisoryWindowDays: windowDays,
    persist: input.persistCorrelatedMetaSnapshot === true,
  }
  const meta = await evaluateMetaGovernanceForWindow(metaOpts, data)

  const specialistAssessments = buildCouncil(data, meta)
  const governanceDebate = governanceDebateFromCouncil(specialistAssessments)
  const scores = scorePluralistic(specialistAssessments, governanceDebate, meta)

  const quietCouncil = input.quietCouncilConsole === true
  if (!quietCouncil) {
    for (const s of specialistAssessments) {
      console.log(
        `[cognitive-specialist] ${s.specialistId} stance=${s.stance} stress=${s.stressScore.toFixed(3)} conf=${s.confidence.toFixed(3)}`,
      )
    }
    console.log(
      `[governance-debate] rounds=${governanceDebate.rounds.length} minority=${governanceDebate.minorityOpinionSpecialists.length} edges=${governanceDebate.adversarialEdges.length}`,
    )
    for (const e of governanceDebate.adversarialEdges) {
      console.log(`[adversarial-review] ${e.from} → ${e.to} (${e.kind})`)
    }
    console.log(
      `[epistemic-diversity] health=${scores.epistemicDiversityHealthScore.toFixed(3)} σStress=${scores.diversityDiagnostics.stressStdev.toFixed(3)}`,
    )
    if (governanceDebate.minorityOpinionSpecialists.length > 0) {
      console.log(`[minority-opinion] preserved=${governanceDebate.minorityOpinionSpecialists.join(",")}`)
    }
    console.log(`[disagreement-stability] composite=${scores.disagreementStabilityScore.toFixed(4)} integrity=${scores.disagreementIntegrityScore.toFixed(3)}`)
    console.log(
      `[cognitive-alignment] pluralismBalance=${scores.cognitiveAuthorityBalance.pluralismEntropyBalance.toFixed(3)} challenge=${scores.diversityDiagnostics.stanceCounts.CHALLENGE} support=${scores.diversityDiagnostics.stanceCounts.SUPPORT}`,
    )
  }

  let snapshotId: string | undefined
  if (input.persist !== false) {
    snapshotId = await persistPluralisticSnapshot({
      userId: input.userId,
      cognitiveWindowDays: windowDays,
      metaStabilityCorrelation: meta.metaStabilityScore,
      metaSnapshotId: meta.snapshotId,
      disagreementStabilityScore: scores.disagreementStabilityScore,
      epistemicDiversityHealthScore: scores.epistemicDiversityHealthScore,
      specialistAssessments,
      governanceDebate,
      cognitiveAuthorityBalance: scores.cognitiveAuthorityBalance,
      diversityDiagnostics: scores.diversityDiagnostics,
      disagreementIntegrityScore: scores.disagreementIntegrityScore,
      metaGovernanceSummary: {
        constitutionalIntegrityStatus: meta.constitutionalIntegrityStatus,
        recursiveIndicatorCount: meta.recursivePressure.indicators.length,
      },
    })

    await logEvolutionAudit({
      userId: input.userId,
      eventType: "PLURALISTIC_COGNITIVE_COUNCIL_COMPLETE",
      details: {
        snapshotId,
        disagreementStabilityScore: scores.disagreementStabilityScore,
        epistemicDiversityHealthScore: scores.epistemicDiversityHealthScore,
      },
    })

    await persistPluralisticEvents({
      snapshotId,
      userId: input.userId,
      council: specialistAssessments,
      scores,
    })
  }

  return {
    snapshotId,
    cognitiveWindowDays: windowDays,
    specialistAssessments,
    governanceDebate,
    ...scores,
    rawSignals: meta.rawSignals,
    metaGovernanceCorrelation: {
      metaStabilityScore: meta.metaStabilityScore,
      metaSnapshotId: meta.snapshotId,
      supervisorySkepticismVitality: meta.supervisorySkepticismHealth.skepticismVitalityScore,
      recursiveIndicatorCount: meta.recursivePressure.indicators.length,
    },
  }
}

async function persistPluralisticSnapshot(row: {
  userId: string
  cognitiveWindowDays: number
  metaStabilityCorrelation: number
  metaSnapshotId?: string
  disagreementStabilityScore: number
  epistemicDiversityHealthScore: number
  specialistAssessments: CognitiveSpecialistAssessment[]
  governanceDebate: Record<string, unknown>
  cognitiveAuthorityBalance: Record<string, unknown>
  diversityDiagnostics: Record<string, unknown>
  disagreementIntegrityScore: number
  metaGovernanceSummary: Record<string, unknown>
}) {
  const admin = requireAdmin()
  const id = `pcs_${randomUUID()}`
  const payload = {
    id,
    userId: row.userId,
    cognitiveWindowDays: row.cognitiveWindowDays,
    metaStabilityCorrelation: row.metaStabilityCorrelation,
    metaSnapshotId: row.metaSnapshotId ?? null,
    disagreementStabilityScore: row.disagreementStabilityScore,
    epistemicDiversityHealthScore: row.epistemicDiversityHealthScore,
    specialistAssessments: row.specialistAssessments,
    governanceDebate: row.governanceDebate,
    cognitiveAuthorityBalance: row.cognitiveAuthorityBalance,
    diversityDiagnostics: row.diversityDiagnostics,
    disagreementIntegrityScore: row.disagreementIntegrityScore,
    metaGovernanceSummary: row.metaGovernanceSummary,
  }
  const { error } = await admin.from("PluralisticCognitiveSnapshot").insert(payload)
  if (error) throw new Error(`DB_WRITE_FAILED: PluralisticCognitiveSnapshot — ${error.message}`)
  console.log(`[cognitive-specialist] persisted council snapshot ${id}`)
  return id
}

async function persistPluralisticEvents(input: {
  snapshotId: string
  userId: string
  council: CognitiveSpecialistAssessment[]
  scores: ReturnType<typeof scorePluralistic>
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

  if (input.scores.epistemicDiversityHealthScore < 0.38) {
    rows.push({
      id: `pce_${randomUUID()}`,
      userId: input.userId,
      snapshotId: input.snapshotId,
      severity: "WARN",
      category: "EPISTEMIC_DIVERSITY",
      eventKey: "COGNITIVE_MONOCULTURE_PRESSURE",
      details: { epistemicDiversityHealthScore: input.scores.epistemicDiversityHealthScore },
    })
  }
  if (input.scores.disagreementStabilityScore < 0.42) {
    rows.push({
      id: `pce_${randomUUID()}`,
      userId: input.userId,
      snapshotId: input.snapshotId,
      severity: "WARN",
      category: "DISAGREEMENT_STABILITY",
      eventKey: "DISAGREEMENT_COLLAPSE_RISK",
      details: { disagreementStabilityScore: input.scores.disagreementStabilityScore },
    })
  }
  for (const a of input.council) {
    if (a.stance === "CHALLENGE" && a.stressScore > 0.62) {
      rows.push({
        id: `pce_${randomUUID()}`,
        userId: input.userId,
        snapshotId: input.snapshotId,
        severity: "INFO",
        category: "ADVERSARIAL_REVIEW",
        eventKey: `SPECIALIST_CHALLENGE_${a.specialistId}`,
        details: { stressScore: a.stressScore, rationale: a.rationale },
      })
    }
  }
  if (!rows.length) return
  const { error } = await admin.from("PluralisticGovernanceEvent").insert(rows)
  if (error) throw new Error(`DB_WRITE_FAILED: PluralisticGovernanceEvent — ${error.message}`)
}

export async function listPluralisticSnapshots(userId: string, limit = 25) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("PluralisticCognitiveSnapshot")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(60, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: PluralisticCognitiveSnapshot — ${error.message}`)
  return data ?? []
}

export async function listPluralisticEvents(userId: string, limit = 50) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("PluralisticGovernanceEvent")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(120, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: PluralisticGovernanceEvent — ${error.message}`)
  return data ?? []
}
