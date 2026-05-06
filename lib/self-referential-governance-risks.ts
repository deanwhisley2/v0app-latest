/**
 * Risks that governance / institutional cognition validates itself without market execution grounding.
 */

export type SelfReferentialGovernanceRiskRow = {
  riskKey: string
  summary: string
  currentExposureInArchitecture: string
  realityDetachmentSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  marketTruthRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
}

export const SELF_REFERENTIAL_GOVERNANCE_RISK_INVENTORY: SelfReferentialGovernanceRiskRow[] = [
  {
    riskKey: "INTERNAL_CONSENSUS_INFLATION",
    summary: "Pluralistic councils and meta scores agree without independent execution corroboration.",
    currentExposureInArchitecture: "Correlated meta + pluralistic + institutional indices from same window bundle",
    realityDetachmentSeverity: "HIGH",
    marketTruthRisk: "HIGH",
  },
  {
    riskKey: "SURVIVABILITY_AESTHETIC_BIAS",
    summary: "Fitness / survivability JSON trends reward narrative coherence over realized drawdown protection.",
    currentExposureInArchitecture: "Temporal / comparative snapshots without mandatory PnL linkage",
    realityDetachmentSeverity: "MEDIUM",
    marketTruthRisk: "HIGH",
  },
  {
    riskKey: "GOVERNANCE_FORMALISM",
    summary: "Audit events and checkpoints accumulate as proof of safety without outcome feedback.",
    currentExposureInArchitecture: "EvolutionAuditEvent density vs execution quality not previously enforced",
    realityDetachmentSeverity: "MEDIUM",
    marketTruthRisk: "MEDIUM",
  },
  {
    riskKey: "SIMULATION_ONLY_VALIDATION",
    summary: "Shadow paths dominate evidence; production fills are sparse in the same window.",
    currentExposureInArchitecture: "SimulationRun / comparative volume can dwarf realized trade memory",
    realityDetachmentSeverity: "HIGH",
    marketTruthRisk: "CRITICAL",
  },
  {
    riskKey: "REPUTATION_SELF_REINFORCEMENT",
    summary: "Institutional memory weights past councils that were never scored against ex-post PnL.",
    currentExposureInArchitecture: "InstitutionalCognitiveSnapshot without calibration (pre–epistemic-calibration phase)",
    realityDetachmentSeverity: "MEDIUM",
    marketTruthRisk: "HIGH",
  },
  {
    riskKey: "DISAGREEMENT_PRESTIGE_INFLATION",
    summary: "Minority channels celebrated as healthy while outcomes show those warnings were noise.",
    currentExposureInArchitecture: "Minority preservation index without historical outcome tagging",
    realityDetachmentSeverity: "MEDIUM",
    marketTruthRisk: "MEDIUM",
  },
  {
    riskKey: "SKEPTICISM_WITHOUT_EXECUTION_BENEFIT",
    summary: "High skepticism vitality paired with missed upside or over-compression never penalized internally.",
    currentExposureInArchitecture: "Meta skepticism vs opportunity balance heuristics only",
    realityDetachmentSeverity: "MEDIUM",
    marketTruthRisk: "HIGH",
  },
  {
    riskKey: "OPPORTUNITY_SUPPRESSION_DRIFT",
    summary: "Caution indices rise while realized performance could absorb more risk.",
    currentExposureInArchitecture: "Opportunity proxies without mandatory return attribution",
    realityDetachmentSeverity: "MEDIUM",
    marketTruthRisk: "HIGH",
  },
]
