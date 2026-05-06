import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { clampSupervisoryWindowDays } from "@/lib/adaptation-governance-window"
import { logEvolutionAudit } from "@/lib/evolution-governor"
import { runEpistemicCalibrationAssessment } from "@/lib/epistemic-calibration-assessment"

/**
 * Probabilistic causal framing over calibration + institutional outputs — advisory; not deterministic causality.
 */

function requireAdmin() {
  return createAdminClient()
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

export type CausalGovernanceOptions = {
  userId: string
  causalWindowDays?: number
  persist?: boolean
  persistCorrelatedMetaSnapshot?: boolean
}

type CounterfactualScenario = {
  id: string
  question: string
  hypothesizedIntervention: string
  /** Not a point estimate — interval mass for honest uncertainty. */
  outcomeMassLow: number
  outcomeMassHigh: number
  directionHint: "UNCLEAR" | "RISK_UP" | "RETURN_UP" | "STABILITY_UP"
  evidenceBasis: string
  uncertaintyNote: string
}

function buildCounterfactualScenarios(
  execScore: number,
  opp: { survivabilityOpportunityBalanceScore?: number; missedOpportunityProxy?: number; controlledAggression?: { justifiedExpansionScore?: number } },
  eq: { epistemicMonopolyRisk?: number; metaCognitiveEquilibriumScore?: number },
  epistemicDisc: { preservationIndex?: number },
  calConfidence: number,
): CounterfactualScenario[] {
  const o = opp.survivabilityOpportunityBalanceScore ?? 0.5
  const missed = opp.missedOpportunityProxy ?? 0.2
  const jus = opp.controlledAggression?.justifiedExpansionScore ?? 0.5
  const mono = eq.epistemicMonopolyRisk ?? 0.3
  const pres = epistemicDisc.preservationIndex ?? 0.4

  const wide = clamp01((1 - calConfidence) * 0.55 + missed * 0.15)

  return [
    {
      id: "CF_ELASTICITY_RETURNS",
      question: "If skepticism elasticity increased (guardrails unchanged), how might returns move?",
      hypothesizedIntervention: "Relax conservative skeptic margin while preserving immutable zones.",
      outcomeMassLow: clamp01(execScore - 0.35 - wide * 0.3),
      outcomeMassHigh: clamp01(execScore + 0.15 + jus * 0.12),
      directionHint: execScore < 0.42 && jus > 0.55 ? "RETURN_UP" : "UNCLEAR",
      evidenceBasis: "Opportunity/governance elasticity + execution score coupling — heuristic.",
      uncertaintyNote: "Interval widens under sparse grounding; no structural causal ID.",
    },
    {
      id: "CF_COMPRESSION_STABILITY",
      question: "If governance compression eased, would instability rise?",
      hypothesizedIntervention: "Higher simulation velocity with proportional rollback checkpoints.",
      outcomeMassLow: clamp01(0.35 - mono * 0.2),
      outcomeMassHigh: clamp01(0.72 + mono * 0.08),
      directionHint: mono > 0.5 ? "STABILITY_UP" : "UNCLEAR",
      evidenceBasis: "Anti-concentration + equilibrium proxies — not RCT.",
      uncertaintyNote: "Counterfactual is scenario stress, not forecast.",
    },
    {
      id: "CF_MINORITY_PROTECT_DRAWDOWN",
      question: "Would archiving more minority warnings materially reduce realized drawdowns?",
      hypothesizedIntervention: "Elevate dissent visibility without changing execution governors.",
      outcomeMassLow: clamp01(pres - 0.35),
      outcomeMassHigh: clamp01(pres + 0.32),
      directionHint: "UNCLEAR",
      evidenceBasis: "Minority preservation index vs RiskState aggregates — associative only.",
      uncertaintyNote: "Cannot infer counterfactual drawdown absent matched controls.",
    },
    {
      id: "CF_ROLLBACK_LOSS_TAIL",
      question: "Would more rollback checkpoints reduce loss streak severity?",
      hypothesizedIntervention: "Higher checkpoint cadence correlated with rollback-health heuristics.",
      outcomeMassLow: 0.2,
      outcomeMassHigh: clamp01(o * 0.7 + 0.25),
      directionHint: o > 0.55 ? "STABILITY_UP" : "UNCLEAR",
      evidenceBasis: "Historical institutional memory linkage — hypothetical.",
      uncertaintyNote: "Sparse trade sample widens tails.",
    },
  ]
}

export async function runCausalGovernanceAssessment(input: CausalGovernanceOptions) {
  const windowDays = clampSupervisoryWindowDays(input.causalWindowDays ?? 28)

  const cal = await runEpistemicCalibrationAssessment({
    userId: input.userId,
    calibrationWindowDays: windowDays,
    persist: false,
    persistCorrelatedMetaSnapshot: input.persistCorrelatedMetaSnapshot === true,
    quietCalibrationConsole: true,
  })

  const triad = cal.institutionalTriadCorrelation
  const opp = triad.opportunitySurvivabilityBalance
  const eq = triad.antiConcentrationEquilibrium
  const eps = triad.epistemicInstitutionalMemory as { minoritySurvivability?: { preservationIndex?: number } }

  const calConf = cal.realityAlignmentProfile.calibrationConfidence
  const execScore = cal.realityAlignmentProfile.executionQualityScore

  const mtp = cal.realityAlignmentProfile.marketTruthCorrelationProxy
  const narrativeCoherenceMass = clamp01((cal.realityAlignmentProfile.internalCoherence + mtp) / 2)

  const attUnc = clamp01(
    (1 - calConf) * 0.32 +
      Math.abs(cal.realityAlignmentProfile.cognitionExecutionGap) * 0.38 +
      (eq.epistemicMonopolyRisk ?? 0) * 0.22 +
      Number(cal.antiSelfReferentialSafeguards?.reciprocalValidationPenalty ?? 0) * 0.22,
  )

  const causalFragilityIndex = clamp01(
    attUnc * 0.45 + (cal.realityDivergence.realityDivergencePressure ?? 0) * 0.28 + (1 - (cal.epistemicCalibrationIndex ?? 0.5)) * 0.27,
  )

  const probabilisticAttributionConfidence = clamp01(mtp * calConf * (1 - causalFragilityIndex * 0.55))

  const diversity = triad.currentCouncilCorrelation?.epistemicDiversityHealthScore ?? 0.5
  const simHeavy = Number(cal.antiSelfReferentialSafeguards?.simulationHeavyExecutionLight ?? 0)
  const antiOverfittingScore = clamp01(
    1 -
      (1 - diversity) * 0.28 -
      simHeavy * 0.32 -
      (calConf < 0.45 ? 0.18 : 0),
  )

  const causalDivergencePressure = clamp01(
    narrativeCoherenceMass * (1 - execScore) * 0.55 + ((probabilisticAttributionConfidence - execScore) > 0.25 ? 0.35 : 0),
  )

  const probabilisticHumilityScore = clamp01(
    0.28 + attUnc * 0.35 + (1 - probabilisticAttributionConfidence) * 0.22 + (cal.institutionalHumilityScore ?? 0.5) * 0.15,
  )

  const counterfactualGovernance = buildCounterfactualScenarios(execScore, opp, eq, eps.minoritySurvivability ?? {}, calConf)

  const counterfactualDisagreement = clamp01(meanIntervalSpread(counterfactualGovernance))

  const causalGovernanceIndex = clamp01(
    probabilisticAttributionConfidence * 0.22 +
      antiOverfittingScore * 0.26 +
      (1 - causalDivergencePressure) * 0.22 +
      probabilisticHumilityScore * 0.18 +
      execScore * 0.12,
  )

  const probabilisticTruthState = {
    attributionUncertaintyMean: attUnc,
    probabilisticAttributionConfidence,
    causalFragilityIndex,
    doctrine: "All masses are heuristic bounds — not causal posteriors from identifiable models.",
    counterfactualDisagreement,
  }

  const marketRealityCausalAlignment = {
    calibrationGroundingTier: cal.realityGroundingScore > 0.55 ? "ALIGNED_BRANCH" : "WEAK_BRANCH",
    executionAnchoredCorrelation: clamp01(mtp * cal.realityGroundingScore),
    regimeSensitivityProxy: triad.currentCouncilCorrelation?.disagreementStabilityScore ?? 0.5,
    note: "Durability across regimes would require multi-window holdout — not asserted here.",
  }

  const antiOverfittingState = {
    antiOverfittingScore,
    drivers: [
      `simulationHeavyExecutionLight=${(cal.antiSelfReferentialSafeguards?.simulationHeavyExecutionLight ?? 0).toFixed(2)}`,
      `calibrationConfidence=${calConf.toFixed(2)}`,
    ],
  }

  console.log(
    `[causal-attribution] probMass=${probabilisticAttributionConfidence.toFixed(3)} fragility=${causalFragilityIndex.toFixed(3)} uncertainty=${attUnc.toFixed(3)}`,
  )
  console.log(`[counterfactual-governance] scenarios=${counterfactualGovernance.length} intervalSpread=${counterfactualDisagreement.toFixed(3)}`)
  console.log(`[probabilistic-truth] humility=${probabilisticHumilityScore.toFixed(3)} index=${causalGovernanceIndex.toFixed(3)}`)
  console.log(`[causal-divergence] pressure=${causalDivergencePressure.toFixed(3)}`)
  console.log(`[attribution-uncertainty] mean=${attUnc.toFixed(3)}`)
  console.log(`[anti-overfitting] score=${antiOverfittingScore.toFixed(3)}`)
  console.log(`[institutional-causality] alignment=${marketRealityCausalAlignment.executionAnchoredCorrelation.toFixed(3)}`)
  console.log(`[execution-grounding] realizedAnchor=${cal.realityGroundingScore.toFixed(3)} calibration=${cal.epistemicCalibrationIndex.toFixed(3)}`)

  let snapshotId: string | undefined
  if (input.persist !== false) {
    snapshotId = await persistCausalSnapshot({
      userId: input.userId,
      causalWindowDays: windowDays,
      counterfactualGovernanceAnalysis: counterfactualGovernance,
      probabilisticTruthState,
      attributionUncertaintyState: { attributionUncertaintyMean: attUnc, causalFragilityIndex },
      antiOverfittingState,
      marketRealityCausalAlignment,
      causalDivergenceState: { causalDivergencePressure, narrativeCoherenceMass },
      causalGovernanceIndex,
      probabilisticHumilityScore,
      epistemicCalibrationSummary: {
        epistemicCalibrationIndex: cal.epistemicCalibrationIndex,
        realityGroundingScore: cal.realityGroundingScore,
      },
    })

    await logEvolutionAudit({
      userId: input.userId,
      eventType: "CAUSAL_GOVERNANCE_ASSESSMENT_COMPLETE",
      details: { snapshotId, causalGovernanceIndex, probabilisticAttributionConfidence },
    })

    await persistCausalEvents({
      snapshotId,
      userId: input.userId,
      causalDivergencePressure,
      probabilisticAttributionConfidence,
      attUnc,
    })
  }

  return {
    snapshotId,
    causalWindowDays: windowDays,
    causalGovernanceIndex,
    probabilisticAttributionConfidence,
    attributionUncertaintyMean: attUnc,
    causalFragilityIndex,
    causalDivergencePressure,
    probabilisticHumilityScore,
    antiOverfittingScore,
    counterfactualGovernance,
    probabilisticTruthState,
    marketRealityCausalAlignment,
    antiOverfittingState,
    epistemicCalibrationCorrelation: cal,
  }
}

function meanIntervalSpread(scenarios: CounterfactualScenario[]) {
  if (!scenarios.length) return 0.5
  const spreads = scenarios.map((s) => Math.abs(s.outcomeMassHigh - s.outcomeMassLow))
  return spreads.reduce((a, b) => a + b, 0) / spreads.length
}

async function persistCausalSnapshot(row: {
  userId: string
  causalWindowDays: number
  counterfactualGovernanceAnalysis: unknown
  probabilisticTruthState: Record<string, unknown>
  attributionUncertaintyState: Record<string, unknown>
  antiOverfittingState: Record<string, unknown>
  marketRealityCausalAlignment: Record<string, unknown>
  causalDivergenceState: Record<string, unknown>
  causalGovernanceIndex: number
  probabilisticHumilityScore: number
  epistemicCalibrationSummary: Record<string, unknown>
}) {
  const admin = requireAdmin()
  const id = `cgs_${randomUUID()}`
  const payload = {
    id,
    userId: row.userId,
    causalWindowDays: row.causalWindowDays,
    counterfactualGovernanceAnalysis: row.counterfactualGovernanceAnalysis,
    probabilisticTruthState: row.probabilisticTruthState,
    attributionUncertaintyState: row.attributionUncertaintyState,
    antiOverfittingState: row.antiOverfittingState,
    marketRealityCausalAlignment: row.marketRealityCausalAlignment,
    causalDivergenceState: row.causalDivergenceState,
    causalGovernanceIndex: row.causalGovernanceIndex,
    probabilisticHumilityScore: row.probabilisticHumilityScore,
    epistemicCalibrationSummary: row.epistemicCalibrationSummary,
  }
  const { error } = await admin.from("CausalGovernanceSnapshot").insert(payload)
  if (error) throw new Error(`DB_WRITE_FAILED: CausalGovernanceSnapshot — ${error.message}`)
  console.log(`[causal-attribution] persisted causal snapshot ${id}`)
  return id
}

async function persistCausalEvents(input: {
  snapshotId: string
  userId: string
  causalDivergencePressure: number
  probabilisticAttributionConfidence: number
  attUnc: number
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

  if (input.causalDivergencePressure > 0.55) {
    rows.push({
      id: `cge_${randomUUID()}`,
      userId: input.userId,
      snapshotId: input.snapshotId,
      severity: "WARN",
      category: "CAUSAL_DIVERGENCE",
      eventKey: "NARRATIVE_EXECUTION_MISMATCH",
      details: { causalDivergencePressure: input.causalDivergencePressure },
    })
  }

  if (input.probabilisticAttributionConfidence > 0.72 && input.attUnc < 0.35) {
    rows.push({
      id: `cge_${randomUUID()}`,
      userId: input.userId,
      snapshotId: input.snapshotId,
      severity: "INFO",
      category: "OVERCONFIDENT_ATTRIBUTION",
      eventKey: "TIGHT_INTERVALS_VS_UNCERTAINTY",
      details: {
        probabilisticAttributionConfidence: input.probabilisticAttributionConfidence,
        attributionUncertaintyMean: input.attUnc,
      },
    })
  }

  if (!rows.length) return
  const { error } = await admin.from("CausalGovernanceEvent").insert(rows)
  if (error) throw new Error(`DB_WRITE_FAILED: CausalGovernanceEvent — ${error.message}`)
}

export async function listCausalGovernanceSnapshots(userId: string, limit = 25) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("CausalGovernanceSnapshot")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(60, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: CausalGovernanceSnapshot — ${error.message}`)
  return data ?? []
}

export async function listCausalGovernanceEvents(userId: string, limit = 80) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("CausalGovernanceEvent")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(160, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: CausalGovernanceEvent — ${error.message}`)
  return data ?? []
}
