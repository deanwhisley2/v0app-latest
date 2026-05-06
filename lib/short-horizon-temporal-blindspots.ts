/**
 * Risks visible only when widening the temporal aperture beyond typical short replay windows.
 */

export type TemporalBlindSpotRow = {
  limitationKey: string
  summary: string
  currentExposureIfShortHorizonOnly: "LOW" | "MEDIUM" | "HIGH"
  temporalRiskSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  longCycleDanger: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
}

export const SHORT_HORIZON_TEMPORAL_BLINDSPOT_INVENTORY: TemporalBlindSpotRow[] = [
  {
    limitationKey: "RECENT_MARKET_BIAS",
    summary: "Late-window samples overweight current macro/order-flow regime versus prior cycles.",
    currentExposureIfShortHorizonOnly: "HIGH",
    temporalRiskSeverity: "HIGH",
    longCycleDanger: "HIGH",
  },
  {
    limitationKey: "STRUCTURAL_CYCLE_BLINDNESS",
    summary: "Bull/bear liquidity supercycles are invisible inside narrow slices.",
    currentExposureIfShortHorizonOnly: "HIGH",
    temporalRiskSeverity: "CRITICAL",
    longCycleDanger: "CRITICAL",
  },
  {
    limitationKey: "TEMPORARY_REGIME_OVERFITTING",
    summary: "Adaptation aligns to a fleeting volatility cluster that mean-reverts over quarters.",
    currentExposureIfShortHorizonOnly: "MEDIUM",
    temporalRiskSeverity: "HIGH",
    longCycleDanger: "HIGH",
  },
  {
    limitationKey: "HIDDEN_LONG_CYCLE_FRAGILITY",
    summary: "Marginally positive short tests hide deterioration under slow governance drift.",
    currentExposureIfShortHorizonOnly: "HIGH",
    temporalRiskSeverity: "HIGH",
    longCycleDanger: "CRITICAL",
  },
  {
    limitationKey: "DELAYED_INSTABILITY_EMERGENCE",
    summary: "Fatigue/adaptation decay surfaces only after sustained exposure horizons.",
    currentExposureIfShortHorizonOnly: "MEDIUM",
    temporalRiskSeverity: "HIGH",
    longCycleDanger: "HIGH",
  },
  {
    limitationKey: "SURVIVABILITY_ILLUSION",
    summary: "Local robustness misses tail sequences that appear once per multi-quarter cycle.",
    currentExposureIfShortHorizonOnly: "MEDIUM",
    temporalRiskSeverity: "HIGH",
    longCycleDanger: "HIGH",
  },
  {
    limitationKey: "ADAPTATION_DECAY_OVER_TIME",
    summary: "Edge from recalibrated confidence/compression attenuates as conditions rotate.",
    currentExposureIfShortHorizonOnly: "MEDIUM",
    temporalRiskSeverity: "MEDIUM",
    longCycleDanger: "HIGH",
  },
  {
    limitationKey: "SLOW_GOVERNANCE_DEGRADATION",
    summary: "Cumulative micro-stress accumulates faster than sandbox windows capture individually.",
    currentExposureIfShortHorizonOnly: "LOW",
    temporalRiskSeverity: "MEDIUM",
    longCycleDanger: "HIGH",
  },
  {
    limitationKey: "CORRELATION_SUPERPHASE_MYopia",
    summary: "Cluster correlation shifts on multi-month horizons distort single-window risk optics.",
    currentExposureIfShortHorizonOnly: "MEDIUM",
    temporalRiskSeverity: "HIGH",
    longCycleDanger: "HIGH",
  },
]
