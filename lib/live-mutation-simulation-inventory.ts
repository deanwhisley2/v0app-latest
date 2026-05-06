/**
 * Live-risk surfaces that hypothetical mutations could someday affect — used for sandbox scoping docs and guardrails.
 * Does not authorize production mutation.
 */

export type SimulationFeasibility = "HIGH" | "MEDIUM" | "LOW" | "UNSUPPORTED_IMMUTABLE"

export type LiveRiskMutationRow = {
  subsystemKey: string
  /** Effect if mis-applied against production */
  liveBlastRadius: string
  /** Historical TradeMemory replay + governance math (no fills) */
  simulationFeasibility: SimulationFeasibility
  /** Restoring baseline after bad apply — conceptual */
  rollbackComplexity: "LOW" | "MEDIUM" | "HIGH" | "OPERATOR_REQUIRED"
  /** How safe replay-only shadow tests are vs misinterpretation risk */
  shadowTestSafetyLevel: "HIGH" | "MEDIUM" | "LOW"
  notes?: string
}

/** Full simulation-risk inventory (shadow never touches immutable zones). */
export const LIVE_RISK_MUTATION_INVENTORY: LiveRiskMutationRow[] = [
  {
    subsystemKey: "SIGNAL_WEIGHTING",
    liveBlastRadius: "Ranking / stacking of analytic inputs; distorted decisions across symbols",
    simulationFeasibility: "MEDIUM",
    rollbackComplexity: "MEDIUM",
    shadowTestSafetyLevel: "MEDIUM",
    notes: "Replay lacks full raw signal vector; proxy via confidence and outcomes only.",
  },
  {
    subsystemKey: "CONFIDENCE_CALIBRATION",
    liveBlastRadius: "Threshold / sizing trust; false certainty or missed edge",
    simulationFeasibility: "HIGH",
    rollbackComplexity: "LOW",
    shadowTestSafetyLevel: "HIGH",
    notes: "Counterfactual confidence gates on TradeMemory are supported.",
  },
  {
    subsystemKey: "GOVERNANCE_COMPRESSION",
    liveBlastRadius: "Effective limits and approval tightness; systemic risk mis-reaction",
    simulationFeasibility: "HIGH",
    rollbackComplexity: "MEDIUM",
    shadowTestSafetyLevel: "MEDIUM",
    notes: "Compression factor replay uses regime labels from memory; live feed not re-simulated bar-by-bar.",
  },
  {
    subsystemKey: "EXPOSURE_MULTIPLIERS_TUNING",
    liveBlastRadius: "Portfolio envelope; correlated cluster blow-ups",
    simulationFeasibility: "HIGH",
    rollbackComplexity: "MEDIUM",
    shadowTestSafetyLevel: "MEDIUM",
    notes: "Scaling PnL proxy via compression ratio is coarse; not a fill simulator.",
  },
  {
    subsystemKey: "REGIME_SENSITIVITY",
    liveBlastRadius: "Regime misclassification driving wrong compression",
    simulationFeasibility: "MEDIUM",
    rollbackComplexity: "MEDIUM",
    shadowTestSafetyLevel: "MEDIUM",
    notes: "Replay uses stored regime per trade, not re-inferred.",
  },
  {
    subsystemKey: "CORRELATION_SENSITIVITY",
    liveBlastRadius: "Cluster exposure math; hidden concentration",
    simulationFeasibility: "MEDIUM",
    rollbackComplexity: "HIGH",
    shadowTestSafetyLevel: "LOW",
    notes: "Shadow does not rebuild full correlation graph per bar; use governance uncertainty knob only.",
  },
  {
    subsystemKey: "EXECUTION_PACING_HINTS",
    liveBlastRadius: "Queue timing, partial fills, slippage clusters",
    simulationFeasibility: "LOW",
    rollbackComplexity: "MEDIUM",
    shadowTestSafetyLevel: "LOW",
    notes: "No microstructure replay; avoid policy conclusions from shadow alone.",
  },
  {
    subsystemKey: "COOLDOWN_TIMING_HINTS",
    liveBlastRadius: "Churn vs opportunity loss",
    simulationFeasibility: "LOW",
    rollbackComplexity: "MEDIUM",
    shadowTestSafetyLevel: "LOW",
    notes: "Requires session-level timeline model (future).",
  },
  {
    subsystemKey: "POSITION_SIZING_HINTS",
    liveBlastRadius: "Notional per trade; liquidation proximity",
    simulationFeasibility: "MEDIUM",
    rollbackComplexity: "HIGH",
    shadowTestSafetyLevel: "MEDIUM",
    notes: "Optional cumulative notional cap replay on TradeMemory approximates sizing pressure.",
  },
  {
    subsystemKey: "APPROVAL_STRICTNESS_CORE",
    liveBlastRadius: "Executive path when gates should halt",
    simulationFeasibility: "HIGH",
    rollbackComplexity: "OPERATOR_REQUIRED",
    shadowTestSafetyLevel: "HIGH",
    notes: "Confidence / exposure exclusions approximate stricter approval; mode machine not forked in shadow.",
  },
  {
    subsystemKey: "RISK_LIMIT_HARD_CAPS",
    liveBlastRadius: "Policy breach beyond operator intent",
    simulationFeasibility: "UNSUPPORTED_IMMUTABLE",
    rollbackComplexity: "OPERATOR_REQUIRED",
    shadowTestSafetyLevel: "HIGH",
    notes: "Caps are operator-bound; sandbox may model sub-cap trade caps but not legal/risk policy.",
  },
]