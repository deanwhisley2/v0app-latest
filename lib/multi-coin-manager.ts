"use client"

/**
 * MULTI-COIN MANAGER
 *
 * Manages multiple TradeComparisonSystem instances — one per coin.
 * Aggregates results, confidence scores, and generates cross-coin reports.
 *
 * Usage:
 *   const manager = new MultiCoinManager()
 *   await manager.learnAllCoins(10) // 10 paper trades per coin
 *   console.log(manager.getConfidenceReport())
 *   console.log(manager.getTopCoins(3))
 */

import { TradeComparisonSystem, type TradeExecutionRecord } from "./trade-comparison-engine"

export interface CoinConfig {
  symbol: string
  baseAsset: string
  enabled: boolean
}

export interface CoinLearningResult {
  symbol: string
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  avgPnl: number
  avgLatencyMs: number
  directionMatchRate: number
  patternsIdentified: number
  patternsBlocked: number
  confidenceScore: number // 0-100
  recommendation: "STRONG BUY" | "BUY" | "NEUTRAL" | "AVOID" | "INSUFFICIENT_DATA"
  learnedPatterns: Array<{
    pattern: string
    winRate: number
    totalTrades: number
    blocked: boolean
  }>
}

export class MultiCoinManager {
  private systems: Map<string, TradeComparisonSystem> = new Map()
  private results: Map<string, CoinLearningResult> = new Map()
  private coins: CoinConfig[]

  constructor(coins?: CoinConfig[]) {
    this.coins = coins || [
      // Top 10 Majors
      { symbol: "BTCUSDT", baseAsset: "BTC", enabled: true },
      { symbol: "ETHUSDT", baseAsset: "ETH", enabled: true },
      { symbol: "SOLUSDT", baseAsset: "SOL", enabled: true },
      { symbol: "BNBUSDT", baseAsset: "BNB", enabled: true },
      { symbol: "ADAUSDT", baseAsset: "ADA", enabled: true },
      { symbol: "DOGEUSDT", baseAsset: "DOGE", enabled: true },
      { symbol: "XRPUSDT", baseAsset: "XRP", enabled: true },
      { symbol: "AVAXUSDT", baseAsset: "AVAX", enabled: true },
      { symbol: "DOTUSDT", baseAsset: "DOT", enabled: true },
      { symbol: "LINKUSDT", baseAsset: "LINK", enabled: true },
      // Hotcake / Meme Coins (high volatility, great for monitoring)
      { symbol: "PEPEUSDT", baseAsset: "PEPE", enabled: true },
      { symbol: "WIFUSDT", baseAsset: "WIF", enabled: true },
      { symbol: "BONKUSDT", baseAsset: "BONK", enabled: true },
      { symbol: "FLOKIUSDT", baseAsset: "FLOKI", enabled: true },
      { symbol: "SHIBUSDT", baseAsset: "SHIB", enabled: true },
      { symbol: "MEMEUSDT", baseAsset: "MEME", enabled: true },
      { symbol: "MYROUSDT", baseAsset: "MYRO", enabled: true },
      { symbol: "BOMEUSDT", baseAsset: "BOME", enabled: true },
      { symbol: "MEWUSDT", baseAsset: "MEW", enabled: true },
      { symbol: "POPCATUSDT", baseAsset: "POPCAT", enabled: true },
      { symbol: "MOGUSDT", baseAsset: "MOG", enabled: true },
      { symbol: "TURBOUSDT", baseAsset: "TURBO", enabled: true },
      // Removed fake coins: COQUSDT, SAMOUSDT, KISHUUSDT (not on Binance)
    ]
  }

  /**
   * Get enabled coins
   */
  getEnabledCoins(): CoinConfig[] {
    return this.coins.filter((c) => c.enabled)
  }

  /**
   * Get or create a TradeComparisonSystem for a coin
   */
  getSystem(symbol: string): TradeComparisonSystem {
    let system = this.systems.get(symbol)
    if (!system) {
      system = new TradeComparisonSystem(symbol)
      system.start()
      this.systems.set(symbol, system)
    }
    return system
  }

  /**
   * Run paper trades for a single coin to learn its behavior
   */
  async learnCoin(symbol: string, numTrades: number = 10): Promise<CoinLearningResult> {
    const system = this.getSystem(symbol)

    // Generate initial signals
    const basePrice = this.getBasePrice(symbol)
    for (let i = 0; i < 5; i++) {
      const price = basePrice * (1 + (Math.random() - 0.5) * 0.02)
      const signal = system.signalCapture.generateSimulatedSignal(price)
      system.signalCapture.recordSignal(signal)
    }

    const trades: TradeExecutionRecord[] = []
    const actions: Array<"buy" | "sell"> = ["buy", "sell"]
    const signals: Array<"bullish" | "bearish" | "neutral"> = ["bullish", "bearish", "neutral"]

    for (let i = 0; i < numTrades; i++) {
      const price = basePrice * (1 + (Math.random() - 0.5) * 0.03)
      const action = actions[Math.floor(Math.random() * actions.length)]
      const signal = signals[Math.floor(Math.random() * signals.length)]
      const rsi = 20 + Math.random() * 60
      const latencyMs = Math.floor(Math.random() * 400) + 50
      const quantity = 0.01 + Math.random() * 0.1

      // Execute with safety checks
      const result = system.executeTradeWithSafety(
        symbol,
        action,
        quantity,
        price,
        { rsi, signal, latency_ms: latencyMs }
      )

      if (result.executed && result.trade) {
        trades.push(result.trade)

        // Simulate outcome (realistic: ~60% chance of profit)
        const isProfitable = Math.random() < 0.6
        const priceMove = price * (isProfitable ? 0.002 : -0.002) * (1 + Math.random() * 0.5)
        const price1min = price + priceMove
        const price5min = price + priceMove * (1 + (Math.random() - 0.5) * 0.5)

        system.evaluateTrade(result.trade.trade_id, price1min, price5min)
        system.analyzeTradeResult(result.trade.trade_id)
      }
    }

    // Collect learning data
    const learningStats = system.strategyLearner.getLearningStats()
    const patterns = system.strategyLearner.getPatterns()
    const tradeLog = system.executionEngine.getTradeLog()
    const outcomeLog = system.executionEngine.getOutcomeLog()

    // Calculate metrics
    const matchedOutcomes = outcomeLog.filter((o) =>
      tradeLog.some((t) => t.trade_id === o.trade_id)
    )

    const wins = matchedOutcomes.filter((o) => o.was_correct).length
    const losses = matchedOutcomes.filter((o) => !o.was_correct).length
    const totalEvaluated = matchedOutcomes.length
    const winRate = totalEvaluated > 0 ? (wins / totalEvaluated) * 100 : 0

    const avgPnl = totalEvaluated > 0
      ? matchedOutcomes.reduce((sum, o) => sum + o.pnl_5min, 0) / totalEvaluated
      : 0

    const avgLatency = tradeLog.length > 0
      ? tradeLog.reduce((sum, t) => sum + t.latency_ms, 0) / tradeLog.length
      : 0

    const directionMatches = tradeLog.filter((t) => t.direction_match).length
    const directionMatchRate = tradeLog.length > 0
      ? (directionMatches / tradeLog.length) * 100
      : 0

    // Calculate confidence score (0-100)
    const confidenceScore = this.calculateConfidenceScore({
      totalTrades: totalEvaluated,
      winRate,
      avgPnl,
      avgLatency,
      directionMatchRate,
      patternsBlocked: learningStats.patternsBlocked,
    })

    // Generate recommendation
    const recommendation = this.getRecommendation(confidenceScore, totalEvaluated)

    const result: CoinLearningResult = {
      symbol,
      totalTrades: totalEvaluated,
      wins,
      losses,
      winRate: Math.round(winRate * 10) / 10,
      avgPnl: Math.round(avgPnl * 100) / 100,
      avgLatencyMs: Math.round(avgLatency),
      directionMatchRate: Math.round(directionMatchRate * 10) / 10,
      patternsIdentified: learningStats.patternsIdentified,
      patternsBlocked: learningStats.patternsBlocked,
      confidenceScore,
      recommendation,
      learnedPatterns: patterns.map((p) => ({
        pattern: p.pattern,
        winRate: Math.round(p.winRate * 1000) / 10,
        totalTrades: p.totalTrades,
        blocked: p.blocked,
      })),
    }

    this.results.set(symbol, result)
    return result
  }

  /**
   * Run paper trades for ALL enabled coins
   */
  async learnAllCoins(tradesPerCoin: number = 10): Promise<CoinLearningResult[]> {
    console.log(`\n🧠 MULTI-COIN LEARNING ENGINE`)
    console.log(`=============================`)
    console.log(`Running ${tradesPerCoin} paper trades per coin...\n`)

    const enabledCoins = this.getEnabledCoins()
    const results: CoinLearningResult[] = []

    for (const coin of enabledCoins) {
      console.log(`📊 Learning ${coin.symbol}...`)
      const result = await this.learnCoin(coin.symbol, tradesPerCoin)
      results.push(result)

      const emoji = result.recommendation === "STRONG BUY" ? "🟢" :
        result.recommendation === "BUY" ? "🔵" :
        result.recommendation === "NEUTRAL" ? "🟡" :
        result.recommendation === "AVOID" ? "🔴" : "⚪"

      console.log(`  ${emoji} ${coin.symbol}: ${result.winRate}% win rate (${result.totalTrades} trades) → ${result.recommendation}`)
      console.log(`     Confidence: ${result.confidenceScore}/100 | Avg PnL: $${result.avgPnl} | Latency: ${result.avgLatencyMs}ms`)
      if (result.patternsBlocked > 0) {
        console.log(`     🚫 ${result.patternsBlocked} losing patterns blocked`)
      }
      console.log("")
    }

    return results
  }

  /**
   * Calculate confidence score (0-100) based on multiple factors
   */
  private calculateConfidenceScore(params: {
    totalTrades: number
    winRate: number
    avgPnl: number
    avgLatency: number
    directionMatchRate: number
    patternsBlocked: number
  }): number {
    let score = 0

    // Win rate contribution (max 40 points)
    if (params.totalTrades >= 5) {
      score += Math.min(40, (params.winRate / 100) * 40)
    } else {
      // Penalty for insufficient data
      score += (params.totalTrades / 10) * 20
    }

    // Direction match rate (max 20 points)
    score += Math.min(20, (params.directionMatchRate / 100) * 20)

    // Latency score (max 15 points)
    if (params.avgLatency < 100) score += 15
    else if (params.avgLatency < 200) score += 12
    else if (params.avgLatency < 300) score += 8
    else if (params.avgLatency < 500) score += 4
    else score += 1

    // Pattern learning (max 15 points)
    if (params.patternsBlocked > 0) {
      score += Math.min(15, params.patternsBlocked * 5)
    }

    // PnL consistency (max 10 points)
    if (params.avgPnl > 0) {
      score += Math.min(10, (params.avgPnl / 100) * 10)
    }

    return Math.round(Math.max(0, Math.min(100, score)))
  }

  /**
   * Generate recommendation based on confidence score
   */
  private getRecommendation(score: number, totalTrades: number): CoinLearningResult["recommendation"] {
    if (totalTrades < 3) return "INSUFFICIENT_DATA"
    if (score >= 80) return "STRONG BUY"
    if (score >= 60) return "BUY"
    if (score >= 40) return "NEUTRAL"
    return "AVOID"
  }

  /**
   * Get base price for a coin (simulated realistic prices)
   */
  private getBasePrice(symbol: string): number {
    const prices: Record<string, number> = {
      BTCUSDT: 67500,
      ETHUSDT: 3450,
      SOLUSDT: 145,
      BNBUSDT: 580,
      ADAUSDT: 0.45,
      DOGEUSDT: 0.12,
      XRPUSDT: 0.55,
      AVAXUSDT: 35,
      DOTUSDT: 7.20,
      LINKUSDT: 14.50,
    }
    return prices[symbol] || 100
  }

  /**
   * Get learning result for a specific coin
   */
  getResult(symbol: string): CoinLearningResult | undefined {
    return this.results.get(symbol)
  }

  /**
   * Get all learning results
   */
  getAllResults(): CoinLearningResult[] {
    return Array.from(this.results.values())
  }

  /**
   * Get top N coins by confidence score
   */
  getTopCoins(n: number = 3): CoinLearningResult[] {
    return this.getAllResults()
      .filter((r) => r.totalTrades >= 3)
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, n)
  }

  /**
   * Get coins to avoid (lowest confidence)
   */
  getWorstCoins(n: number = 3): CoinLearningResult[] {
    return this.getAllResults()
      .filter((r) => r.totalTrades >= 3)
      .sort((a, b) => a.confidenceScore - b.confidenceScore)
      .slice(0, n)
  }

  /**
   * Generate a formatted confidence report
   */
  getConfidenceReport(): string {
    const results = this.getAllResults()
    if (results.length === 0) return "No learning data available yet."

    const top3 = this.getTopCoins(3)
    const worst3 = this.getWorstCoins(3)

    const lines: string[] = [
      "📊 MULTI-COIN CONFIDENCE REPORT",
      "================================",
      "",
      "── All Coins ──",
    ]

    // Sort by confidence descending
    const sorted = [...results].sort((a, b) => b.confidenceScore - a.confidenceScore)

    for (const r of sorted) {
      const emoji = r.recommendation === "STRONG BUY" ? "🟢" :
        r.recommendation === "BUY" ? "🔵" :
        r.recommendation === "NEUTRAL" ? "🟡" :
        r.recommendation === "AVOID" ? "🔴" : "⚪"

      lines.push(`  ${emoji} ${r.symbol}: ${r.winRate}% win rate | Score: ${r.confidenceScore}/100 | ${r.recommendation}`)
    }

    lines.push("", "── Top 3 Recommendations ──")
    for (const r of top3) {
      lines.push(`  🟢 ${r.symbol}: ${r.confidenceScore}/100 confidence (${r.winRate}% win rate, ${r.totalTrades} trades)`)
    }

    lines.push("", "── Coins to Avoid ──")
    for (const r of worst3) {
      lines.push(`  🔴 ${r.symbol}: ${r.confidenceScore}/100 confidence (${r.winRate}% win rate, ${r.totalTrades} trades)`)
    }

    lines.push("", "── Blocked Patterns ──")
    let hasBlocked = false
    for (const r of sorted) {
      if (r.patternsBlocked > 0) {
        hasBlocked = true
        lines.push(`  🚫 ${r.symbol}: ${r.patternsBlocked} patterns blocked`)
        for (const p of r.learnedPatterns) {
          if (p.blocked) {
            lines.push(`     • ${p.pattern} (${p.winRate}% win rate)`)
          }
        }
      }
    }
    if (!hasBlocked) {
      lines.push("  No patterns blocked yet (need more trades)")
    }

    return lines.join("\n")
  }

  /**
   * Stop all systems
   */
  stopAll(): void {
    for (const [symbol, system] of this.systems) {
      system.stop()
      console.log(`[MultiCoin] Stopped ${symbol}`)
    }
    this.systems.clear()
  }
}
