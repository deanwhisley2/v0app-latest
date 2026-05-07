import type { FocusCoinInsight, JoelinCoin } from "@/lib/expert/phase2-types"
let lastFocusSymbols = new Set<string>()

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

export function buildGovernedFocus20(
  coins: JoelinCoin[],
  opts?: { activeTradeSymbols?: string[]; limit?: number }
): {
  focusDaily: FocusCoinInsight[]
  analyzedProfitableCoins: FocusCoinInsight[]
  focusSymbols: string[]
  recycledOutSymbols: string[]
} {
  const limit = Math.max(20, opts?.limit ?? 20)
  const active = new Set((opts?.activeTradeSymbols ?? []).map((s) => s.toUpperCase()))
  const now = new Date().toISOString()

  const scored = [...coins]
    .map((coin) => {
      const profitability = profitabilityScore(coin)
      const carryBonus = lastFocusSymbols.has(coin.symbol.toUpperCase()) ? 6 : 0
      const activeBonus = active.has(coin.symbol.toUpperCase()) ? 14 : 0
      const poorPenalty = profitability < 50 ? 10 : 0
      const selectionScore = profitability + carryBonus + activeBonus - poorPenalty
      const supervisionLevel: FocusCoinInsight["supervisionLevel"] = active.has(coin.symbol.toUpperCase())
        ? "CRITICAL"
        : profitability >= 75
          ? "HIGH"
          : "NORMAL"
      return {
        coin,
        profitability,
        selectionScore,
        supervisionLevel,
      }
    })
    .sort((a, b) => b.selectionScore - a.selectionScore)

  const selected = scored.slice(0, limit)
  const selectedSet = new Set(selected.map((x) => x.coin.symbol.toUpperCase()))
  const recycledOutSymbols = Array.from(lastFocusSymbols).filter((s) => !selectedSet.has(s))

  const focusDaily: FocusCoinInsight[] = selected.map((row) => ({
    symbol: row.coin.symbol,
    action: row.coin.action,
    confidence: row.coin.confidence,
    tradableLevel: row.coin.tradableLevel,
    profitabilityScore: row.profitability,
    expectedEdgeBps: expectedEdgeBps(row.coin),
    analyzedAt: now,
    supervisionLevel: row.supervisionLevel,
    recycledIn: !lastFocusSymbols.has(row.coin.symbol.toUpperCase()),
    rationale: [
      `action=${row.coin.action}`,
      `confidence=${row.coin.confidence}`,
      `tradableLevel=${row.coin.tradableLevel}`,
      `volatility=${row.coin.volatility.toFixed(2)}`,
      `safety=${row.coin.safetyLevel}`,
      `supervision=${row.supervisionLevel}`,
      `selectionScore=${row.selectionScore.toFixed(2)}`,
    ],
  }))

  lastFocusSymbols = selectedSet
  return {
    focusDaily,
    analyzedProfitableCoins: pickAnalyzedProfitableCoins(focusDaily, 10),
    focusSymbols: Array.from(selectedSet),
    recycledOutSymbols,
  }
}
