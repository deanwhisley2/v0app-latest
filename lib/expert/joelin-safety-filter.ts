import type { JoelinCoin } from "@/lib/expert/phase2-types"

type SafetyInput = {
  coin: JoelinCoin
  orderBookImbalance: number
  fundingSignal: "BULLISH" | "BEARISH" | "NEUTRAL"
}

export function evaluateMinuteTradeReadiness(input: SafetyInput): {
  confirmed: boolean
  reason?: string
} {
  const { coin, orderBookImbalance, fundingSignal } = input
  if (coin.action === "HOLD") return { confirmed: false, reason: "NO_DIRECTIONAL_SIGNAL" }
  if (coin.safetyLevel === "LOW") return { confirmed: false, reason: "LOW_SAFETY_LEVEL" }
  if (coin.confidence < 72) return { confirmed: false, reason: "LOW_CONFIDENCE" }
  if (coin.tradableLevel < 68) return { confirmed: false, reason: "LOW_TRADABLE_LEVEL" }
  if (coin.volatility > 12) return { confirmed: false, reason: "VOLATILITY_TOO_HIGH" }
  if (Math.abs(orderBookImbalance) < 0.08) return { confirmed: false, reason: "WEAK_ORDERBOOK_IMBALANCE" }

  const actionAlignedWithFunding =
    (coin.action === "BUY" && fundingSignal !== "BEARISH") ||
    (coin.action === "SELL" && fundingSignal !== "BULLISH")
  if (!actionAlignedWithFunding) return { confirmed: false, reason: "FUNDING_CONFLICT" }

  return { confirmed: true }
}

export function applyMinuteTradeSafetyFilter(
  coin: JoelinCoin,
  input: { orderBookImbalance: number; fundingSignal: "BULLISH" | "BEARISH" | "NEUTRAL"; reviewInMinutes?: number }
): JoelinCoin {
  const reviewInMinutes = Math.max(1, input.reviewInMinutes ?? 5)
  const gate = evaluateMinuteTradeReadiness({
    coin,
    orderBookImbalance: input.orderBookImbalance,
    fundingSignal: input.fundingSignal,
  })
  if (gate.confirmed) {
    return {
      ...coin,
      minuteTradeConfirmed: true,
      minuteTradeBlockReason: undefined,
      minuteTradeReviewAt: new Date(Date.now() + reviewInMinutes * 60_000).toISOString(),
    }
  }
  return {
    ...coin,
    action: "HOLD",
    minuteTradeConfirmed: false,
    minuteTradeBlockReason: gate.reason ?? "UNCONFIRMED",
    minuteTradeReviewAt: new Date(Date.now() + reviewInMinutes * 60_000).toISOString(),
  }
}
