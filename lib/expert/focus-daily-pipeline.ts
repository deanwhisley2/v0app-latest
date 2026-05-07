import type { FocusCoinInsight, JoelinCoin } from "@/lib/expert/phase2-types"

function expectedEdgeBps(coin: JoelinCoin): number {
  const confidenceBoost = Math.max(0, coin.confidence - 55) * 3
  const tradableBoost = Math.max(0, coin.tradableLevel - 50) * 2
  const volatilityPenalty = Math.max(0, coin.volatility - 8) * 4
  const directionalBoost = coin.action === "HOLD" ? -20 : 25
  return Math.round(Math.max(5, confidenceBoost + tradableBoost + directionalBoost - volatilityPenalty))
}

function profitabilityScore(coin: JoelinCoin): number {
  const edge = expectedEdgeBps(coin)
  const riskPenalty = coin.safetyLevel === "LOW" ? 22 : coin.safetyLevel === "MEDIUM" ? 8 : 0
  const holdPenalty = coin.action === "HOLD" ? 18 : 0
  return Math.round(Math.max(0, Math.min(100, edge * 0.32 + coin.confidence * 0.42 + coin.tradableLevel * 0.26 - riskPenalty - holdPenalty)))
}

export function buildFocusDailyInsights(coins: JoelinCoin[], limit = 20): FocusCoinInsight[] {
  const analyzedAt = new Date().toISOString()
  return [...coins]
    .map((coin) => {
      const profitability = profitabilityScore(coin)
      const edge = expectedEdgeBps(coin)
      const rationale = [
        `action=${coin.action}`,
        `confidence=${coin.confidence}`,
        `tradableLevel=${coin.tradableLevel}`,
        `volatility=${coin.volatility.toFixed(2)}`,
        `safety=${coin.safetyLevel}`,
      ]
      return {
        symbol: coin.symbol,
        action: coin.action,
        confidence: coin.confidence,
        tradableLevel: coin.tradableLevel,
        profitabilityScore: profitability,
        expectedEdgeBps: edge,
        analyzedAt,
        rationale,
      } satisfies FocusCoinInsight
    })
    .sort((a, b) => b.profitabilityScore - a.profitabilityScore)
    .slice(0, limit)
}

export function pickAnalyzedProfitableCoins(insights: FocusCoinInsight[], limit = 10): FocusCoinInsight[] {
  return insights
    .filter((row) => row.action !== "HOLD" && row.confidence >= 68 && row.profitabilityScore >= 60)
    .sort((a, b) => b.profitabilityScore - a.profitabilityScore)
    .slice(0, limit)
}
