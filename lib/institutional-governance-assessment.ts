import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { clampSupervisoryWindowDays } from "@/lib/adaptation-governance-window"
import { logEvolutionAudit } from "@/lib/evolution-governor"
import {
  runPluralisticCognitiveCouncil,
  type CognitiveSpecialistAssessment,
  type CognitiveSpecialistId,
} from "@/lib/pluralistic-cognitive-governance"

/**
 * Institutional triad assessment (three connected advisory phases — observational only):
 * epistemic memory / reputation decay, opportunity–survivability balance, anti-concentration equilibrium.
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

function stdev(xs: number[]) {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

function daysSince(iso: string) {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (Date.now() - t) / 86400_000)
}

function decayWeight(ageDays: number, halfLifeDays = 60) {
  return Math.exp(-Math.log(2) * (ageDays / halfLifeDays))
}

function parseSpecialists(row: Record<string, unknown>): CognitiveSpecialistAssessment[] {
  const raw = row.specialistAssessments
  if (!Array.isArray(raw)) return []
  return raw as CognitiveSpecialistAssessment[]
}

function parseDebateMinority(row: Record<string, unknown>): string[] {
  const g = row.governanceDebate as Record<string, unknown> | undefined
  const m = g?.minorityOpinionSpecialists
  return Array.isArray(m) ? (m as string[]) : []
}

function parseMetaSummary(row: Record<string, unknown>): { recursiveIndicatorCount?: number } {
  const s = row.metaGovernanceSummary as Record<string, unknown> | undefined
  const n = s?.recursiveIndicatorCount
  return { recursiveIndicatorCount: typeof n === "number" ? n : undefined }
}

export type InstitutionalAssessmentOptions = {
  userId: string
  assessmentWindowDays?: number
  persist?: boolean
  /** Persist MetaGovernanceSnapshot when running embedded pluralistic correlation (default false). */
  persistCorrelatedMetaSnapshot?: boolean
  historySnapshotsLimit?: number
  /** Nested epistemic calibration can suppress institutional triad stdout. */
  quietTriadConsole?: boolean
}

export async function runInstitutionalGovernanceAssessment(input: InstitutionalAssessmentOptions) {
  const windowDays = clampSupervisoryWindowDays(input.assessmentWindowDays ?? 28)
  const histLimit = Math.min(40, Math.max(5, input.historySnapshotsLimit ?? 18))

  const council = await runPluralisticCognitiveCouncil({
    userId: input.userId,
    cognitiveWindowDays: windowDays,
    persist: false,
    persistCorrelatedMetaSnapshot: input.persistCorrelatedMetaSnapshot === true,
    quietCouncilConsole: true,
  })

  const admin = requireAdmin()
  const phRes = await admin
    .from("PluralisticCognitiveSnapshot")
    .select("*")
    .eq("userId", input.userId)
    .order("createdAt", { ascending: false })
    .limit(histLimit)
  if (phRes.error) throw new Error(`DB_READ_FAILED: PluralisticCognitiveSnapshot — ${phRes.error.message}`)

  const phRows = (phRes.data ?? []) as Record<string, unknown>[]

  const epistemic = buildEpistemicInstitutionalMemory(council, phRows)
  const opportunity = buildOpportunitySurvivabilityBalance(council)
  const equilibrium = buildAntiConcentrationEquilibrium(council, phRows)

  const epistemicMemoryIndex = clamp01(mean(epistemic.specialistHistoricalProfiles.map((p) => p.decayedAdvisoryScore)))
  const opportunityBalanceIndex = clamp01(opportunity.survivabilityOpportunityBalanceScore)
  const constitutionalEquilibriumIndex = clamp01(equilibrium.metaCognitiveEquilibriumScore)

  const quietTriad = input.quietTriadConsole === true
  if (!quietTriad) {
    console.log(`[cognitive-memory] snapshots=${phRows.length} lineageDepth=${epistemic.disagreementLineage.lineageDepth}`)
    console.log(`[epistemic-reputation] memoryIndex=${epistemicMemoryIndex.toFixed(3)} decayHalfLifeDays=${epistemic.reputationDecay.halfLifeDays}`)
    console.log(`[reputation-decay] maxRaw=${epistemic.reputationDecay.maxUndecayedContribution.toFixed(3)} humility=${epistemic.reputationDecay.adaptiveHumilityNote}`)
    console.log(`[minority-survivability] preservationIndex=${epistemic.minoritySurvivability.preservationIndex.toFixed(3)} archived=${epistemic.minoritySurvivability.archivedMinorityRefs.length}`)
    console.log(`[disagreement-lineage] snapshots=${epistemic.disagreementLineage.recentSnapshotIds.length}`)
    console.log(`[historical-validation] validatedSkepticismMass=${epistemic.disagreementOutcomeQuality.validatedSkepticismMass.toFixed(3)}`)

    console.log(`[opportunity-cost] cautionTaxProxy=${opportunity.opportunityCost.cautionTaxProxy.toFixed(3)}`)
    console.log(`[missed-opportunity] proxy=${opportunity.missedOpportunityProxy.toFixed(3)}`)
    console.log(`[strategic-aggression] justifiedExpansionScore=${opportunity.controlledAggression.justifiedExpansionScore.toFixed(3)}`)
    console.log(`[governance-elasticity] skepticismElasticity=${opportunity.skepticismElasticity.elasticityScore.toFixed(3)}`)
    console.log(`[controlled-expansion] window=${opportunity.controlledAggression.expansionWindowLabel}`)
    console.log(`[survivability-balance] composite=${opportunity.survivabilityOpportunityBalanceScore.toFixed(3)}`)

    console.log(`[cognitive-equilibrium] score=${equilibrium.metaCognitiveEquilibriumScore.toFixed(3)}`)
    console.log(`[authority-concentration] hhi=${equilibrium.cognitivePower.concentrationHhi.toFixed(3)} leader=${equilibrium.cognitivePower.dominantSpecialistId ?? "none"}`)
    console.log(`[epistemic-monopoly] risk=${equilibrium.epistemicMonopolyRisk.toFixed(3)}`)
    console.log(`[dissent-health] vitality=${equilibrium.dissentHealthScore.toFixed(3)}`)
    console.log(`[constitutional-balance] pressure=${equilibrium.constitutionalPressureScore.toFixed(3)}`)
    console.log(`[governance-fragmentation] penalty=${equilibrium.fragmentationPenalty.toFixed(3)}`)
  }

  let snapshotId: string | undefined
  if (input.persist !== false) {
    snapshotId = await persistInstitutionalSnapshot({
      userId: input.userId,
      assessmentWindowDays: windowDays,
      epistemicInstitutionalMemory: epistemic,
      opportunitySurvivabilityBalance: opportunity,
      antiConcentrationEquilibrium: equilibrium,
      epistemicMemoryIndex,
      opportunityBalanceIndex,
      constitutionalEquilibriumIndex,
      pluralisticCouncilRef: council.snapshotId ?? null,
    })

    await logEvolutionAudit({
      userId: input.userId,
      eventType: "INSTITUTIONAL_GOVERNANCE_ASSESSMENT_COMPLETE",
      details: { snapshotId, epistemicMemoryIndex, opportunityBalanceIndex, constitutionalEquilibriumIndex },
    })

    await persistInstitutionalEvents({ snapshotId, userId: input.userId, epistemic, opportunity, equilibrium })
  }

  return {
    snapshotId,
    assessmentWindowDays: windowDays,
    compositeIndices: { epistemicMemoryIndex, opportunityBalanceIndex, constitutionalEquilibriumIndex },
    epistemicInstitutionalMemory: epistemic,
    opportunitySurvivabilityBalance: opportunity,
    antiConcentrationEquilibrium: equilibrium,
    currentCouncilCorrelation: council,
  }
}

function buildEpistemicInstitutionalMemory(council: Awaited<ReturnType<typeof runPluralisticCognitiveCouncil>>, phRows: Record<string, unknown>[]) {
  const currentAssessments = council.specialistAssessments
  const syntheticRows: Record<string, unknown>[] = [
    {
      id: "CURRENT",
      createdAt: new Date().toISOString(),
      specialistAssessments: currentAssessments,
      governanceDebate: council.governanceDebate,
      metaGovernanceSummary: {
        ...council.metaGovernanceCorrelation,
        recursiveIndicatorCount: council.metaGovernanceCorrelation.recursiveIndicatorCount ?? 0,
      },
    },
    ...phRows,
  ]

  const bySpec: Partial<
    Record<
      CognitiveSpecialistId,
      { challengeMass: number; supportMass: number; stressMass: number; weightSum: number; lineageIds: string[] }
    >
  > = {}

  const SPECS: CognitiveSpecialistId[] = [
    "COGNITIVE_STABILITY",
    "GOVERNANCE_SKEPTIC",
    "SIMULATION_RELIABILITY_AUDITOR",
    "ADAPTATION_CONSERVATIVE",
    "SURVIVABILITY_STRESS",
    "DRIFT_ESCALATION",
    "CONSTITUTIONAL_GUARDIAN",
  ]

  for (const id of SPECS) {
    bySpec[id] = { challengeMass: 0, supportMass: 0, stressMass: 0, weightSum: 0, lineageIds: [] }
  }

  const minorityArchive: Array<{ snapshotId: string; minority: string[]; ageDays: number; weight: number }> = []

  for (const row of syntheticRows) {
    const created = String(row.createdAt ?? "")
    const age = row.id === "CURRENT" ? 0 : daysSince(created)
    const w = decayWeight(age)
    const sid = typeof row.id === "string" ? row.id : "unknown"
    const specs = parseSpecialists(row)

    minorityArchive.push({
      snapshotId: sid,
      minority: parseDebateMinority(row),
      ageDays: age,
      weight: w,
    })

    for (const s of specs) {
      const cell = bySpec[s.specialistId]
      if (!cell) continue
      cell.weightSum += w
      if (s.stance === "CHALLENGE") cell.challengeMass += w
      if (s.stance === "SUPPORT") cell.supportMass += w
      cell.stressMass += w * s.stressScore
      if (sid !== "unknown" && sid !== "CURRENT") cell.lineageIds.push(sid)
    }
  }

  let validatedSkepticismMass = 0
  let harmfulOptimismMass = 0

  for (const row of syntheticRows.slice(1)) {
    const age = daysSince(String(row.createdAt ?? ""))
    const w = decayWeight(age)
    const specs = parseSpecialists(row)
    const { recursiveIndicatorCount = 0 } = parseMetaSummary(row)

    for (const s of specs) {
      if (s.stance === "CHALLENGE" && recursiveIndicatorCount > 0) {
        validatedSkepticismMass += w * s.stressScore * 0.25
      }
      if (s.stance === "SUPPORT" && recursiveIndicatorCount > 1 && s.specialistId === "COGNITIVE_STABILITY") {
        harmfulOptimismMass += w * 0.12
      }
    }
  }

  const specialistHistoricalProfiles = SPECS.map((id) => {
    const cell = bySpec[id]!
    const raw = cell.weightSum > 0 ? cell.challengeMass / cell.weightSum : 0
    const decayedAdvisoryScore = clamp01((cell.stressMass / Math.max(0.001, cell.weightSum)) * 0.55 + raw * 0.45)
    return {
      specialistId: id,
      survivabilityContributionProxy: clamp01(cell.challengeMass * 0.15 + decayedAdvisoryScore * 0.5),
      falsePositiveSkepticismProxy: clamp01(Math.max(0, cell.supportMass - cell.challengeMass) * 0.08 + 0.2),
      decayedAdvisoryScore,
      governanceProtectionValueProxy: clamp01(raw * 0.7 + (id === "CONSTITUTIONAL_GUARDIAN" ? 0.08 : 0)),
      lineageSnapshotIds: [...new Set(cell.lineageIds)].slice(0, 12),
      note: "Advisory only — not a permanent rank or promotion authority.",
    }
  })

  const preservationWeights = minorityArchive.filter((m) => m.minority.length > 0).map((m) => m.weight * (m.minority.length / 7))
  const preservationIndex = preservationWeights.length ? clamp01(mean(preservationWeights) * 2.2) : 0.42

  const epistemicMemoryIndexRaw = clamp01(validatedSkepticismMass * 0.5 + preservationIndex * 0.35 + (1 - harmfulOptimismMass) * 0.15)

  return {
    specialistHistoricalProfiles,
    disagreementOutcomeQuality: {
      validatedSkepticismMass: clamp01(validatedSkepticismMass),
      harmfulOptimismProxy: clamp01(harmfulOptimismMass),
      governanceInterventionNote:
        "Correlates challenges with recursive-pressure epochs in stored council rows — coarse proxy for institutional learning.",
    },
    reputationDecay: {
      halfLifeDays: 60,
      antiDominanceResetNote: "Scores use decayed sums; no fixed aristocracy — older contributions fade by design.",
      adaptiveHumilityNote: `fractionHigh=${mean(specialistHistoricalProfiles.map((p) => (p.decayedAdvisoryScore > 0.92 ? 1 : 0))).toFixed(3)}`,
      maxUndecayedContribution: Math.max(...specialistHistoricalProfiles.map((p) => p.survivabilityContributionProxy), 0),
    },
    minoritySurvivability: {
      preservationIndex,
      archivedMinorityRefs: minorityArchive.slice(0, 15),
      constitutionalDissentProtection:
        "Minority cohorts retained in JSON history with decay weights; absence of persistence does not erase advisory obligation in product policy.",
    },
    disagreementLineage: {
      recentSnapshotIds: phRows.slice(0, 10).map((r) => String(r.id ?? "")),
      lineageDepth: phRows.length,
    },
    epistemicMemoryIndexRaw,
    methodology:
      "Historical + advisory; decay-limited reputation; minority archive; no specialist self-authorizes governance mutation.",
  }
}

function buildOpportunitySurvivabilityBalance(council: Awaited<ReturnType<typeof runPluralisticCognitiveCouncil>>) {
  const rs = council.rawSignals as {
    sampleSizes?: { simulations?: number; comparative?: number; temporal?: number; proposals?: number }
  }
  const nSim = rs?.sampleSizes?.simulations ?? 0
  const nProp = rs?.sampleSizes?.proposals ?? 0
  const metaStable = council.metaGovernanceCorrelation.metaStabilityScore
  const skeptic = Number(council.metaGovernanceCorrelation.supervisorySkepticismVitality ?? 0.5)

  const experimentVolume = (nSim ?? 0) + (rs?.sampleSizes?.comparative ?? 0) + (rs?.sampleSizes?.temporal ?? 0)
  const cautionTaxProxy = clamp01(metaStable * 0.35 + skeptic * 0.35 + (experimentVolume < 5 ? 0.25 : 0))
  const missedOpportunityProxy = clamp01(
    experimentVolume > 15 && council.disagreementStabilityScore > 0.85 && skeptic > 0.65 ? 0.45 : experimentVolume < 3 ? 0.22 : 0.12,
  )

  const aggressionElasticity = clamp01(0.45 + (1 - skeptic) * 0.35 + Math.min(0.2, nSim / 80))
  const justifiedExpansionScore = clamp01(
    (1 - cautionTaxProxy) * 0.4 + aggressionElasticity * 0.35 + (nProp > 0 ? 0.15 : 0) + (1 - council.disagreementIntegrityScore) * 0.1,
  )

  const survivabilityOpportunityBalanceScore = clamp01(
    (1 - cautionTaxProxy) * 0.38 + (1 - missedOpportunityProxy) * 0.32 + justifiedExpansionScore * 0.2 + aggressionElasticity * 0.1,
  )

  return {
    opportunityCost: {
      cautionTaxProxy,
      experimentationVolumeProxy: experimentVolume,
      paralysisRiskProxy: clamp01(metaStable * skeptic * (experimentVolume < 8 ? 0.35 : 0.08)),
      note: "Does not observe counterfactual fills — uses governance + simulation throughput heuristics only.",
    },
    missedOpportunityProxy,
    controlledAggression: {
      justifiedExpansionScore,
      expansionWindowLabel:
        justifiedExpansionScore > 0.62 ? "BOUNDED_ELASTIC_ZONE" : justifiedExpansionScore < 0.38 ? "CAUTION_PRIORITY" : "BALANCED",
      boundedAggressionDoctrine:
        "Aggression signals are elasticity hints for human review — never autonomous execution escalation.",
    },
    skepticismElasticity: {
      elasticityScore: aggressionElasticity,
      regimeAwareNote: "Elevated when skeptic vitality is moderate and simulation corpus is rich — avoids permanent maximal doubt.",
    },
    survivabilityOpportunityBalanceScore,
  }
}

function buildAntiConcentrationEquilibrium(
  council: Awaited<ReturnType<typeof runPluralisticCognitiveCouncil>>,
  phRows: Record<string, unknown>[],
) {
  const stresses = council.specialistAssessments.map((s) => s.stressScore)
  const masses = stresses.map((s) => s + 0.08)
  const sum = masses.reduce((a, b) => a + b, 0) || 1
  const shares = masses.map((m) => m / sum)
  const hhi = shares.reduce((acc, sh) => acc + sh * sh, 0)
  const dominantIdx = masses.indexOf(Math.max(...masses))
  const dominantSpecialistId = council.specialistAssessments[dominantIdx]?.specialistId

  let coalitionRepeatProxy = 0
  const lastFive = phRows.slice(0, 5)
  if (lastFive.length >= 2) {
    const leaders = lastFive.map((row) => {
      const specs = parseSpecialists(row)
      let maxId: CognitiveSpecialistId | undefined
      let maxS = -1
      for (const s of specs) {
        if (s.stressScore > maxS) {
          maxS = s.stressScore
          maxId = s.specialistId
        }
      }
      return maxId
    })
    const counts: Record<string, number> = {}
    for (const k of leaders) {
      if (!k) continue
      counts[k] = (counts[k] ?? 0) + 1
    }
    coalitionRepeatProxy = clamp01((Math.max(0, ...Object.values(counts)) / lastFive.length) * 1.4)
  }

  const epistemicMonopolyRisk = clamp01(hhi * 0.85 + coalitionRepeatProxy * 0.25)
  const dissentHealthScore = clamp01(council.epistemicDiversityHealthScore * 0.45 + council.diversityDiagnostics.stressStdev * 1.8 * 0.35 + council.diversityDiagnostics.stanceCounts.CHALLENGE / 7)
  const consensusPressure = clamp01(council.diversityDiagnostics.stanceCounts.SUPPORT / 7)
  const fragmentationPenalty = clamp01(
    council.diversityDiagnostics.stanceCounts.CHALLENGE >= 6 ? 0.12 : council.disagreementStabilityScore < 0.4 ? 0.22 : 0.06,
  )
  const constitutionalPressureScore = clamp01(epistemicMonopolyRisk * 0.45 + consensusPressure * 0.22 + (1 - dissentHealthScore) * 0.33)

  const metaCognitiveEquilibriumScore = clamp01(
    (1 - epistemicMonopolyRisk) * 0.36 + dissentHealthScore * 0.28 + (1 - fragmentationPenalty) * 0.2 + council.cognitiveAuthorityBalance.pluralismEntropyBalance * 0.16 - consensusPressure * 0.06,
  )

  return {
    cognitivePower: {
      concentrationHhi: hhi,
      dominantSpecialistId,
      specialistShares: council.specialistAssessments.map((s, i) => ({ specialistId: s.specialistId, influenceShare: shares[i] ?? 0 })),
      coalitionRepeatProxy,
    },
    equilibriumDiagnostics: {
      optimismBiasProxy: consensusPressure,
      skepticismOverloadProxy: clamp01(
        (1 - council.metaGovernanceCorrelation.supervisorySkepticismVitality) * 0.08 + (council.disagreementStabilityScore < 0.45 ? 0.32 : 0),
      ),
      monocultureRiskProxy: coalitionRepeatProxy,
    },
    epistemicMonopolyRisk,
    dissentHealthScore,
    constitutionalPressureScore,
    fragmentationPenalty,
    metaCognitiveEquilibriumScore,
    antiMonopolyDoctrine: [
      "Influence caps modeled via HHI + rotating stress leadership — advisory.",
      "When consensusPressure rises, monopoly risk flagged — does not revoke specialists.",
    ],
  }
}

async function persistInstitutionalSnapshot(row: {
  userId: string
  assessmentWindowDays: number
  epistemicInstitutionalMemory: Record<string, unknown>
  opportunitySurvivabilityBalance: Record<string, unknown>
  antiConcentrationEquilibrium: Record<string, unknown>
  epistemicMemoryIndex: number
  opportunityBalanceIndex: number
  constitutionalEquilibriumIndex: number
  pluralisticCouncilRef: string | null
}) {
  const admin = requireAdmin()
  const id = `igs_${randomUUID()}`
  const payload = {
    id,
    userId: row.userId,
    assessmentWindowDays: row.assessmentWindowDays,
    epistemicInstitutionalMemory: row.epistemicInstitutionalMemory,
    opportunitySurvivabilityBalance: row.opportunitySurvivabilityBalance,
    antiConcentrationEquilibrium: row.antiConcentrationEquilibrium,
    epistemicMemoryIndex: row.epistemicMemoryIndex,
    opportunityBalanceIndex: row.opportunityBalanceIndex,
    constitutionalEquilibriumIndex: row.constitutionalEquilibriumIndex,
    pluralisticCouncilRef: row.pluralisticCouncilRef,
  }
  const { error } = await admin.from("InstitutionalCognitiveSnapshot").insert(payload)
  if (error) throw new Error(`DB_WRITE_FAILED: InstitutionalCognitiveSnapshot — ${error.message}`)
  console.log(`[cognitive-memory] persisted institutional snapshot ${id}`)
  return id
}

async function persistInstitutionalEvents(input: {
  snapshotId: string
  userId: string
  epistemic: ReturnType<typeof buildEpistemicInstitutionalMemory>
  opportunity: ReturnType<typeof buildOpportunitySurvivabilityBalance>
  equilibrium: ReturnType<typeof buildAntiConcentrationEquilibrium>
}) {
  const admin = requireAdmin()
  const rows: Array<{
    id: string
    userId: string
    snapshotId: string
    phase: string
    severity: string
    category: string
    eventKey: string
    details: Record<string, unknown>
  }> = []

  if (input.epistemic.minoritySurvivability.preservationIndex < 0.28) {
    rows.push({
      id: `ige_${randomUUID()}`,
      userId: input.userId,
      snapshotId: input.snapshotId,
      phase: "EPISTEMIC",
      severity: "WARN",
      category: "MINORITY_SURVIVABILITY",
      eventKey: "LOW_MINORITY_ARCHIVE_SIGNAL",
      details: { preservationIndex: input.epistemic.minoritySurvivability.preservationIndex },
    })
  }

  if (input.opportunity.missedOpportunityProxy > 0.38) {
    rows.push({
      id: `ige_${randomUUID()}`,
      userId: input.userId,
      snapshotId: input.snapshotId,
      phase: "OPPORTUNITY",
      severity: "INFO",
      category: "OPPORTUNITY_COST",
      eventKey: "CAUTION_TAIL_RISK",
      details: { missedOpportunityProxy: input.opportunity.missedOpportunityProxy },
    })
  }

  if (input.equilibrium.epistemicMonopolyRisk > 0.52) {
    rows.push({
      id: `ige_${randomUUID()}`,
      userId: input.userId,
      snapshotId: input.snapshotId,
      phase: "EQUILIBRIUM",
      severity: "WARN",
      category: "ANTI_CONCENTRATION",
      eventKey: "COGNITIVE_INFLUENCE_CONCENTRATION",
      details: { hhi: input.equilibrium.cognitivePower.concentrationHhi, leader: input.equilibrium.cognitivePower.dominantSpecialistId },
    })
  }

  if (!rows.length) return
  const { error } = await admin.from("InstitutionalGovernanceEvent").insert(rows)
  if (error) throw new Error(`DB_WRITE_FAILED: InstitutionalGovernanceEvent — ${error.message}`)
}

export async function listInstitutionalSnapshots(userId: string, limit = 25) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("InstitutionalCognitiveSnapshot")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(60, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: InstitutionalCognitiveSnapshot — ${error.message}`)
  return data ?? []
}

export async function listInstitutionalEvents(userId: string, limit = 80) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("InstitutionalGovernanceEvent")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(Math.min(160, Math.max(1, limit)))
  if (error) throw new Error(`DB_READ_FAILED: InstitutionalGovernanceEvent — ${error.message}`)
  return data ?? []
}
