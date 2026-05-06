/**
 * Risks of mistaking correlation / narrative coherence for causation in governance cognition.
 */

export type CausalIllusionRiskRow = {
  riskKey: string
  summary: string
  currentExposureInArchitecture: string
  attributionFragility: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  causalConfidenceRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
}

export const CAUSAL_ILLUSION_RISK_INVENTORY: CausalIllusionRiskRow[] = [
  {
    riskKey: "HINDSIGHT_NARRATIVE_CONSTRUCTION",
    summary: "Retrospective coherence of audits and snapshots read as proof of foresight.",
    currentExposureInArchitecture: "Epistemic calibration + institutional lineage over past windows",
    attributionFragility: "HIGH",
    causalConfidenceRisk: "HIGH",
  },
  {
    riskKey: "SPECIALIST_PRESTIGE_INFLATION",
    summary: "Repeated minority or challenge stances interpreted as causal without outcome tagging.",
    currentExposureInArchitecture: "Decay-weighted profiles without controlled experiments",
    attributionFragility: "HIGH",
    causalConfidenceRisk: "HIGH",
  },
  {
    riskKey: "SURVIVORSHIP_BIAS",
    summary: "Fitness / survivability snapshots omit worlds that would have failed under stress.",
    currentExposureInArchitecture: "ComparativeSimulationRun / temporal aggregates",
    attributionFragility: "MEDIUM",
    causalConfidenceRisk: "HIGH",
  },
  {
    riskKey: "GOVERNANCE_OVERFITTING",
    summary: "Indicators tuned to recent regimes predict poorly out-of-sample.",
    currentExposureInArchitecture: "Rolling windows without held-out validation passes",
    attributionFragility: "HIGH",
    causalConfidenceRisk: "CRITICAL",
  },
  {
    riskKey: "SPURIOUS_DISAGREEMENT_VALIDATION",
    summary: "Minority warnings coincident with drawdowns mistaken for preventive causation.",
    currentExposureInArchitecture: "Correlation-style validation in epistemic calibration heuristics",
    attributionFragility: "MEDIUM",
    causalConfidenceRisk: "MEDIUM",
  },
  {
    riskKey: "REGIME_COINCIDENCE_MISCLASSIFICATION",
    summary: "Structural labels align with luck rather than mechanism.",
    currentExposureInArchitecture: "MarketRegime / drift artefacts without causal graph",
    attributionFragility: "MEDIUM",
    causalConfidenceRisk: "MEDIUM",
  },
  {
    riskKey: "FALSE_ATTRIBUTION_LOOPS",
    summary: "Higher governance confidence embedded in feedback to the same metrics it produced.",
    currentExposureInArchitecture: "Stacked meta → pluralistic → institutional → calibration",
    attributionFragility: "HIGH",
    causalConfidenceRisk: "HIGH",
  },
  {
    riskKey: "COUNTERFACTUAL_HALLUCINATION",
    summary: "Plausible futures stated with insufficient uncertainty mass.",
    currentExposureInArchitecture: "Counterfactual rows are Bayesian-style bounds — not causal facts",
    attributionFragility: "CRITICAL",
    causalConfidenceRisk: "HIGH",
  },
]
