/**
 * Risks where a single worldview (unified supervisory stack) dominates adaptation trust.
 */

export type CentralizedCognitionRiskRow = {
  riskKey: string
  summary: string
  currentExposureInArchitecture: string
  epistemicFragilityIfUnchecked: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  disagreementCollapseRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
}

export const CENTRALIZED_COGNITION_RISK_INVENTORY: CentralizedCognitionRiskRow[] = [
  {
    riskKey: "UNIFIED_SURVIVABILITY_BIAS",
    summary: "One fitness / survivability composite becomes the tacit oracle across comparative + temporal pipelines.",
    currentExposureInArchitecture: "Shared JSON snapshots; correlated metrics in meta supervisor",
    epistemicFragilityIfUnchecked: "HIGH",
    disagreementCollapseRisk: "HIGH",
  },
  {
    riskKey: "SYNCHRONIZED_SIMULATION_ASSUMPTIONS",
    summary: "Shadow engines inherit the same seeds, horizons, or reliability scalars — diversity is cosmetic.",
    currentExposureInArchitecture: "Common baseline governance fingerprints and suite labels",
    epistemicFragilityIfUnchecked: "MEDIUM",
    disagreementCollapseRisk: "MEDIUM",
  },
  {
    riskKey: "GOVERNANCE_MONOCULTURE",
    summary: "One approval philosophy (stability-first vs velocity-first) dominates every gate.",
    currentExposureInArchitecture: "Single EvolutionGovernor + audit vocabulary",
    epistemicFragilityIfUnchecked: "MEDIUM",
    disagreementCollapseRisk: "HIGH",
  },
  {
    riskKey: "ADAPTATION_SELECTION_CONVERGENCE",
    summary: "Proposals that look good under the same scorer crowd out exploratory alternatives.",
    currentExposureInArchitecture: "Proposal rows + evaluation verbs shared across tooling",
    epistemicFragilityIfUnchecked: "MEDIUM",
    disagreementCollapseRisk: "MEDIUM",
  },
  {
    riskKey: "RECURSIVE_CONFIRMATION_LOOPS_CROSS_LAYER",
    summary: "Meta-assessment confirms simulation confirms temporal confirms meta —without independent dissent.",
    currentExposureInArchitecture: "Correlated artefacts in overlapping windows",
    epistemicFragilityIfUnchecked: "HIGH",
    disagreementCollapseRisk: "HIGH",
  },
  {
    riskKey: "SINGLE_SKEPTICISM_PHILOSOPHY",
    summary: "One skepticism vitality scalar narrates truth for adaptation safety.",
    currentExposureInArchitecture: "MetaGovernanceAssessment skepticismVitality composite",
    epistemicFragilityIfUnchecked: "HIGH",
    disagreementCollapseRisk: "HIGH",
  },
  {
    riskKey: "HOMOGENEOUS_REGIME_INTERPRETATION",
    summary: "Regime snapshots drive many branches with one interpretation template.",
    currentExposureInArchitecture: "Governance/regime artefacts consumed by adaptive paths",
    epistemicFragilityIfUnchecked: "MEDIUM",
    disagreementCollapseRisk: "MEDIUM",
  },
  {
    riskKey: "CENTRALIZED_APPROVAL_WORLDVIEW",
    summary: "Human operators or one dashboard narrative become the uncontested storyline for 'safe'.",
    currentExposureInArchitecture: "Expert UI/API surfaces prioritized metrics",
    epistemicFragilityIfUnchecked: "HIGH",
    disagreementCollapseRisk: "CRITICAL",
  },
]
