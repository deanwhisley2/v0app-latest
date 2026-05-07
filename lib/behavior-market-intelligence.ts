import type { FinalAnalysisResult } from "@/lib/analysis/time-bound-analysis"

export type TempoClass =
  | "FAST_TEMPO"
  | "MEDIUM_TEMPO"
  | "SLOW_TEMPO"
  | "ERRATIC_TEMPO"
  | "MANIPULATIVE_TEMPO"
  | "COMPRESSED_BREAKOUT"
  | "VOLATILITY_EXPANSION"

export type EntryTimingClass = "EARLY" | "OPTIMAL" | "LATE" | "CHASE_ENTRY" | "EXHAUSTED_MOVE"

export type BehaviorIntelligence = {
  tempoClass: TempoClass
  entryTiming: EntryTimingClass
  behaviorClarity: number
  observationWindowSec: number
  signalFreshnessSec: number
  stopLossBps: number
  takeProfitBps: number
}

export type SignalRhythmState = "STRENGTHENING" | "WEAKENING" | "HESITATING" | "EXHAUSTING"

export type SignalRhythmLifecycle = {
  state: SignalRhythmState
  score: number
  freshnessDecay: number
}

const DEFAULT_FOCUS_UNIVERSE = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "MATICUSDT",
  "LTCUSDT",
  "TRXUSDT",
  "BCHUSDT",
  "ATOMUSDT",
  "NEARUSDT",
  "ARBUSDT",
  "OPUSDT",
  "SUIUSDT",
  "APTUSDT",
  "INJUSDT",
  "RNDRUSDT",
] as const

export function buildFocusUniverse(rawSymbols?: string[], includeGold = false): string[] {
  const clean = (rawSymbols ?? [])
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .map((s) => (s.endsWith("USDT") ? s : `${s}USDT`))

  const merged = new Set<string>(["BTCUSDT", "ETHUSDT", ...clean, ...DEFAULT_FOCUS_UNIVERSE])
  if (includeGold) merged.add("XAUUSDT")
  return Array.from(merged).slice(0, Math.max(20, merged.size))
}

export function deriveBehaviorIntelligence(
  result: FinalAnalysisResult,
  opts: { observationWindowSec: number; signalFreshnessSec: number }
): BehaviorIntelligence {
  const imbalance = Math.abs(result.fastPaths.orderBookImbalance)
  const funding = Math.abs(result.fastPaths.fundingRate)
  const volatilityProxy = imbalance * 100 + funding * 20
  const confidence = result.fusedDecision.confidence

  let tempoClass: TempoClass = "MEDIUM_TEMPO"
  if (volatilityProxy > 45) tempoClass = "VOLATILITY_EXPANSION"
  else if (imbalance > 0.32) tempoClass = "FAST_TEMPO"
  else if (imbalance < 0.08) tempoClass = "SLOW_TEMPO"

  if (volatilityProxy > 65 && confidence < 70) tempoClass = "ERRATIC_TEMPO"
  if (volatilityProxy > 70 && result.fastPaths.liquidityWarfare.sweepDetected === "NONE") {
    tempoClass = "MANIPULATIVE_TEMPO"
  }
  if (imbalance > 0.2 && confidence >= 75 && volatilityProxy < 40) tempoClass = "COMPRESSED_BREAKOUT"

  let entryTiming: EntryTimingClass = "OPTIMAL"
  if (opts.signalFreshnessSec > 120) entryTiming = "LATE"
  if (opts.signalFreshnessSec > 180) entryTiming = "CHASE_ENTRY"
  if (confidence < 60) entryTiming = "EXHAUSTED_MOVE"
  if (opts.signalFreshnessSec < 20 && confidence >= 75) entryTiming = "EARLY"

  const clarityBase = Math.max(0, Math.min(100, confidence - Math.abs(50 - confidence) * 0.2))
  const behaviorClarity = Math.round(Math.max(35, clarityBase - volatilityProxy * 0.15))

  const stopLossBps = tempoClass === "FAST_TEMPO" ? 80 : tempoClass === "SLOW_TEMPO" ? 180 : 120
  const takeProfitBps = tempoClass === "FAST_TEMPO" ? 140 : tempoClass === "SLOW_TEMPO" ? 260 : 190

  return {
    tempoClass,
    entryTiming,
    behaviorClarity,
    observationWindowSec: opts.observationWindowSec,
    signalFreshnessSec: opts.signalFreshnessSec,
    stopLossBps,
    takeProfitBps,
  }
}

export function behaviorIntelligenceToReasons(summary: BehaviorIntelligence): string[] {
  return [
    `BEHAVIOR_WINDOW_SEC:${summary.observationWindowSec}`,
    `TEMPO_CLASS:${summary.tempoClass}`,
    `ENTRY_TIMING:${summary.entryTiming}`,
    `BEHAVIOR_CLARITY:${summary.behaviorClarity}`,
    `SIGNAL_FRESHNESS_SEC:${summary.signalFreshnessSec}`,
    `ADAPTIVE_SL_BPS:${summary.stopLossBps}`,
    `ADAPTIVE_TP_BPS:${summary.takeProfitBps}`,
    "BEHAVIOR_OBSERVATION_BEFORE_ENTRY",
  ]
}

export function deriveSignalRhythmLifecycle(result: FinalAnalysisResult): SignalRhythmLifecycle {
  const confidence = result.fusedDecision.confidence
  const imbalance = Math.abs(result.fastPaths.orderBookImbalance)
  const funding = Math.abs(result.fastPaths.fundingRate)
  const pressure = imbalance * 100 + funding * 15

  let state: SignalRhythmState = "HESITATING"
  let score = Math.round(Math.max(35, Math.min(95, confidence + pressure * 0.4 - 12)))

  if (confidence >= 75 && pressure >= 20) state = "STRENGTHENING"
  else if (confidence >= 65 && pressure < 15) state = "WEAKENING"
  else if (confidence < 60) state = "EXHAUSTING"

  if (result.fusedDecision.action === "HOLD") {
    state = "HESITATING"
    score = Math.min(score, 55)
  }

  const freshnessDecay = Math.round(Math.max(5, Math.min(95, 100 - score)))
  return { state, score, freshnessDecay }
}

export function signalRhythmToReasons(rhythm: SignalRhythmLifecycle): string[] {
  return [
    `SIGNAL_RHYTHM_STATE:${rhythm.state}`,
    `SIGNAL_RHYTHM_SCORE:${rhythm.score}`,
    `SIGNAL_FRESHNESS_DECAY:${rhythm.freshnessDecay}`,
  ]
}
