/**
 * Limitations inherent to single-path TradeMemory replay (before multi-world layering).
 */

export type SingleWorldLimitRow = {
  limitationKey: string
  summary: string
  currentExposureIfSingleWorldOnly: "LOW" | "MEDIUM" | "HIGH"
  realismRisk: "LOW" | "MEDIUM" | "HIGH"
  adaptationDangerIfReliedUponAlone: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
}

/** Inventory: why one sandbox run is insufficient for adaptation safety conclusions. */
export const SINGLE_WORLD_LIMITATION_INVENTORY: SingleWorldLimitRow[] = [
  {
    limitationKey: "REPLAY_BIAS",
    summary: "One systemic assumption embeds tacit narrative about macro state during sample.",
    currentExposureIfSingleWorldOnly: "HIGH",
    realismRisk: "HIGH",
    adaptationDangerIfReliedUponAlone: "HIGH",
  },
  {
    limitationKey: "HISTORICAL_OVERFITTING",
    summary: "Parameters can match a single sampled path without generalized robustness.",
    currentExposureIfSingleWorldOnly: "HIGH",
    realismRisk: "MEDIUM",
    adaptationDangerIfReliedUponAlone: "CRITICAL",
  },
  {
    limitationKey: "REGIME_SPECIFIC_DISTORTION",
    summary: "Recorded regimes per trade do not explore alternate regime classification errors.",
    currentExposureIfSingleWorldOnly: "MEDIUM",
    realismRisk: "MEDIUM",
    adaptationDangerIfReliedUponAlone: "HIGH",
  },
  {
    limitationKey: "OPTIMISTIC_SURVIVORSHIP",
    summary: "Completed TradeMemory rows omit trades that never executed or were killed early.",
    currentExposureIfSingleWorldOnly: "MEDIUM",
    realismRisk: "HIGH",
    adaptationDangerIfReliedUponAlone: "HIGH",
  },
  {
    limitationKey: "HIDDEN_FRAGILITY",
    summary: "Single-world gains may reverse under mild stress not represented in that run.",
    currentExposureIfSingleWorldOnly: "HIGH",
    realismRisk: "MEDIUM",
    adaptationDangerIfReliedUponAlone: "CRITICAL",
  },
  {
    limitationKey: "NO_ALTERNATE_VOLATILITY_PATHS",
    summary: "Same price path cannot branch into alternate volatility realizations.",
    currentExposureIfSingleWorldOnly: "MEDIUM",
    realismRisk: "HIGH",
    adaptationDangerIfReliedUponAlone: "MEDIUM",
  },
  {
    limitationKey: "RARE_EVENT_VARIATION_ABSENT",
    summary: "Tail liquidity / exchange incidents not enumerated in one replay.",
    currentExposureIfSingleWorldOnly: "MEDIUM",
    realismRisk: "HIGH",
    adaptationDangerIfReliedUponAlone: "HIGH",
  },
  {
    limitationKey: "LIMITED_GOVERNANCE_DIVERSITY",
    summary: "One systemic row cannot test governance saturation / mode transitions.",
    currentExposureIfSingleWorldOnly: "MEDIUM",
    realismRisk: "MEDIUM",
    adaptationDangerIfReliedUponAlone: "MEDIUM",
  },
  {
    limitationKey: "CORRELATION_PATH_STATIC",
    summary: "Cluster correlation shocks are not re-simulated per trade.",
    currentExposureIfSingleWorldOnly: "MEDIUM",
    realismRisk: "MEDIUM",
    adaptationDangerIfReliedUponAlone: "MEDIUM",
  },
  {
    limitationKey: "EXECUTION_MICROSTRUCTURE_GAP",
    summary: "Spread, latency, partial fills absent — single world still macro-proxy only.",
    currentExposureIfSingleWorldOnly: "LOW",
    realismRisk: "HIGH",
    adaptationDangerIfReliedUponAlone: "MEDIUM",
  },
]
