import type { JoelinCoin } from "@/lib/expert/phase2-types"

export function tradableScore(c: JoelinCoin): number {
  return c.tradableLevel * 0.6 + c.confidence * 0.4
}

/** Matches AutoTrader-style filter: directional signal, min confidence, non-low safety. */
export function pickTradableNow(coins: JoelinCoin[], limit = 10): JoelinCoin[] {
  return [...coins]
    .filter(
      (c) =>
        c.focusMember === true &&
        c.action !== "HOLD" &&
        c.confidence >= 65 &&
        c.safetyLevel !== "LOW" &&
        c.minuteTradeConfirmed === true
    )
    .sort((a, b) => tradableScore(b) - tradableScore(a))
    .slice(0, limit)
}
