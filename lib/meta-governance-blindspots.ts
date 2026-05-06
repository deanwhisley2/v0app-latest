/**
 * Risks that the adaptation / simulation stack itself drifts, self-reinforces, or erodes constitutional discipline.
 */

export type MetaGovernanceBlindSpotRow = {
  riskKey: string
  summary: string
  currentProtectionsInCodebase: string
  recursiveRiskSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  constitutionalDangerIfUnsupervised: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
}

export const META_GOVERNANCE_BLINDSPOT_INVENTORY: MetaGovernanceBlindSpotRow[] = [
  {
    riskKey: "PROPOSAL_APPROVAL_INFLATION",
    summary: "More proposals pass gates or cluster near rate limits without external audit.",
    currentProtectionsInCodebase: "Rate limits; evaluation-only verdicts; no auto-apply",
    recursiveRiskSeverity: "MEDIUM",
    constitutionalDangerIfUnsupervised: "HIGH",
  },
  {
    riskKey: "SIMULATION_OVERCONFIDENCE",
    summary: "Repeated sandbox success inflates trust in coarse proxies.",
    currentProtectionsInCodebase: "simulationReliability, metaSimulationReliability, temporalReliability flags",
    recursiveRiskSeverity: "HIGH",
    constitutionalDangerIfUnsupervised: "HIGH",
  },
  {
    riskKey: "ADAPTATION_FREQUENCY_ESCALATION",
    summary: "Operators or tools spawn simulations/proposals faster than review capacity.",
    currentProtectionsInCodebase: "Proposal window caps; MetaGovernanceSupervisor velocity heuristics",
    recursiveRiskSeverity: "MEDIUM",
    constitutionalDangerIfUnsupervised: "MEDIUM",
  },
  {
    riskKey: "ROLLBACK_UNDERUTILIZATION",
    summary: "Few checkpoints vs many experiments — recovery surface shrinks.",
    currentProtectionsInCodebase: "Checkpoint API; rollback-health ratio in meta assessment",
    recursiveRiskSeverity: "MEDIUM",
    constitutionalDangerIfUnsupervised: "HIGH",
  },
  {
    riskKey: "SURVIVABILITY_SCORE_DRIFT",
    summary: "Fitness composites trend up without diversification of scenarios/eras.",
    currentProtectionsInCodebase: "Multi-world spread checks; temporal fatigue metrics; supervisory skepticism",
    recursiveRiskSeverity: "HIGH",
    constitutionalDangerIfUnsupervised: "HIGH",
  },
  {
    riskKey: "GOVERNANCE_SOFTENING",
    summary: "Human or tooling habits route around friction (modes, gates) while adaptation accelerates.",
    currentProtectionsInCodebase: "Immutable zones; startup gate; EvolutionGovernor; meta integrity scan",
    recursiveRiskSeverity: "HIGH",
    constitutionalDangerIfUnsupervised: "CRITICAL",
  },
  {
    riskKey: "CONSTITUTIONAL_BOUNDARY_EROSION",
    summary: "New code paths widen eligible zones without review.",
    currentProtectionsInCodebase: "IMMUTABLE_MUTATION_ZONES registry + evaluation rejects + supervisor counts",
    recursiveRiskSeverity: "CRITICAL",
    constitutionalDangerIfUnsupervised: "CRITICAL",
  },
  {
    riskKey: "ADAPTATION_SELECTION_BIAS",
    summary: "Only favorable eras/worlds are exercised; pessimistic suites omitted.",
    currentProtectionsInCodebase: "Default diversified suites; operator-guide discipline; supervisory flags",
    recursiveRiskSeverity: "MEDIUM",
    constitutionalDangerIfUnsupervised: "HIGH",
  },
  {
    riskKey: "RECURSIVE_CONFIRMATION_LOOPS",
    summary: "High-level metrics confirm each other (sim ↑, temporal ↑) without independent ground truth.",
    currentProtectionsInCodebase: "Skepticism health; divergence flags; immutable audit separation",
    recursiveRiskSeverity: "HIGH",
    constitutionalDangerIfUnsupervised: "CRITICAL",
  },
]
