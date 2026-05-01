"use client"

/**
 * ADAPTATION ENGINE - The Self-Learning Loop
 * 
 * Every trade records:
 * - What was the setup?
 * - Did liquidity providers manipulate the level?
 * - What was the crowd sentiment?
 * - Did retail get trapped?
 * 
 * After 100 trades, the system identifies:
 * - "When X and Y happen, Z works 70% of the time"
 * - "In low volatility, pattern A fails, use pattern B"
 * 
 * The system gets smarter with every trade.
 * It adapts to changing market conditions.
 * It learns which patterns work and which don't.
 */

import { type EnhancedTradeSignal, type TradeAction, type TradeReason } from "./enhanced-trading-engine"
import { type LiquidityWarfareReport } from "./liquidity-warfare"
import { type SentimentReport } from "./sentiment-weapon"

// ============================================================
// Types
// ============================================================

export interface TradeRecord {
  id: string
  timestamp: number
  setup: TradeReason
  action: "BUY" | "SELL"
  entryPrice: number
  exitPrice: number
  pnl: number
  pnlPercent: number
  duration: number // ms
  factors: {
    liquidityWarfare: boolean
    sentiment: boolean
    contrarian: boolean
    stealth: boolean
  }
  marketConditions: {
    volatility: "LOW" | "MEDIUM" | "HIGH"
    trend: "BULLISH" | "BEARISH" | "SIDEWAYS"
    volumeProfile: "LOW" | "NORMAL" | "HIGH"
  }
  sentimentAtEntry: {
    orderBookImbalance: number
    fundingRateDeviation: number | null
    exchangeFlowInterpretation: string
  }
  warfareAtEntry: {
    stopClustersNearby: number
    spoofingDetected: boolean
    liquiditySweepDetected: boolean
    darkPoolActivity: boolean
  }
  success: boolean
}

export interface PatternInsight {
  pattern: string
  conditions: string[]
  winRate: number
  sampleSize: number
  avgPnl: number
  avgRiskReward: number
  confidence: "HIGH" | "MEDIUM" | "LOW"
  lastObserved: number
}

export interface MarketRegime {
  volatility: "LOW" | "MEDIUM" | "HIGH"
  trend: "BULLISH" | "BEARISH" | "SIDEWAYS"
  volume: "LOW" | "NORMAL" | "HIGH"
  bestPatterns: PatternInsight[]
  worstPatterns: PatternInsight[]
}

export interface AdaptationReport {
  totalTrades: number
  recentTrades: TradeRecord[]
  patternInsights: PatternInsight[]
  currentRegime: MarketRegime
  recommendedAdjustments: string[]
  performance: {
    winRate: number
    avgWin: number
    avgLoss: number
    profitFactor: number
    sharpeRatio: number
    maxDrawdown: number
    totalPnl: number
  }
}

// ============================================================
// Adaptation Engine
// ============================================================

class AdaptationEngine {
  private tradeHistory: TradeRecord[] = []
  private patternCache: Map<string, PatternInsight> = new Map()
  private readonly MIN_TRADES_FOR_INSIGHT = 10
  private readonly MIN_TRADES_FOR_HIGH_CONFIDENCE = 30
  private readonly MAX_HISTORY = 1000

  // ============================================================
  // Record a Trade
  // ============================================================

  /**
   * Record every trade with full context.
   * This is the raw data the self-learning loop uses.
   */
  recordTrade(
    signal: EnhancedTradeSignal,
    exitPrice: number,
    warfareReport: LiquidityWarfareReport,
    sentimentReport: SentimentReport,
    marketConditions: TradeRecord["marketConditions"]
  ): TradeRecord {
    const entryPrice = signal.entryPrice
    const pnl = signal.action === "BUY"
      ? exitPrice - entryPrice
      : entryPrice - exitPrice
    const pnlPercent = (pnl / entryPrice) * 100
    const duration = Date.now() - signal.timing.entryWindowStart

    // Only record actual trades (BUY or SELL), not WAIT signals
    const tradeAction: "BUY" | "SELL" = signal.action === "BUY" ? "BUY" : "SELL"

    const trade: TradeRecord = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      setup: signal.reason,
      action: tradeAction,
      entryPrice,
      exitPrice,
      pnl,
      pnlPercent,
      duration,
      factors: signal.factors,
      marketConditions,
      sentimentAtEntry: {
        orderBookImbalance: sentimentReport.orderBookImbalance.ratio,
        fundingRateDeviation: sentimentReport.fundingRate?.deviation ?? null,
        exchangeFlowInterpretation: sentimentReport.exchangeFlow?.interpretation ?? "NEUTRAL"
      },
      warfareAtEntry: {
        stopClustersNearby: warfareReport.stopClusters.length,
        spoofingDetected: warfareReport.spoofingAlerts.length > 0,
        liquiditySweepDetected: warfareReport.liquiditySweeps.length > 0,
        darkPoolActivity: warfareReport.darkPoolSignals.length > 0
      },
      success: pnl > 0
    }

    this.tradeHistory.push(trade)
    if (this.tradeHistory.length > this.MAX_HISTORY) {
      this.tradeHistory.shift()
    }

    // Update pattern insights
    this.updatePatternInsights(trade)

    return trade
  }

  // ============================================================
  // Pattern Recognition
  // ============================================================

  /**
   * Identify patterns from trade history.
   * 
   * Examples:
   * - "When liquidity sweep + funding crowded long → short works 70%"
   * - "In low volatility, stop cluster detection fails, use order book imbalance"
   * - "When spoofing + dark pool accumulation align → high probability long"
   */
  private updatePatternInsights(trade: TradeRecord): void {
    const patterns = this.generatePatterns(trade)

    for (const pattern of patterns) {
      const existing = this.patternCache.get(pattern)
      if (!existing) {
        this.patternCache.set(pattern, {
          pattern,
          conditions: pattern.split(" + "),
          winRate: trade.success ? 1 : 0,
          sampleSize: 1,
          avgPnl: trade.pnlPercent,
          avgRiskReward: Math.abs(trade.pnlPercent / 1), // simplified
          confidence: "LOW",
          lastObserved: Date.now()
        })
      } else {
        const totalWins = existing.winRate * existing.sampleSize + (trade.success ? 1 : 0)
        existing.sampleSize++
        existing.winRate = totalWins / existing.sampleSize
        existing.avgPnl = (existing.avgPnl * (existing.sampleSize - 1) + trade.pnlPercent) / existing.sampleSize
        existing.lastObserved = Date.now()

        // Update confidence based on sample size
        if (existing.sampleSize >= this.MIN_TRADES_FOR_HIGH_CONFIDENCE) {
          existing.confidence = "HIGH"
        } else if (existing.sampleSize >= this.MIN_TRADES_FOR_INSIGHT) {
          existing.confidence = "MEDIUM"
        }
      }
    }
  }

  private generatePatterns(trade: TradeRecord): string[] {
    const patterns: string[] = []

    // Single factor patterns
    patterns.push(`setup:${trade.setup}`)
    patterns.push(`volatility:${trade.marketConditions.volatility}`)
    patterns.push(`trend:${trade.marketConditions.trend}`)

    // Two-factor patterns
    if (trade.warfareAtEntry.liquiditySweepDetected && trade.sentimentAtEntry.fundingRateDeviation !== null) {
      patterns.push(`sweep + funding:${Math.abs(trade.sentimentAtEntry.fundingRateDeviation) > 2 ? "extreme" : "normal"}`)
    }
    if (trade.warfareAtEntry.spoofingDetected && trade.warfareAtEntry.darkPoolActivity) {
      patterns.push("spoof + darkpool")
    }
    if (trade.warfareAtEntry.stopClustersNearby > 3 && trade.sentimentAtEntry.orderBookImbalance > 0.5) {
      patterns.push("clusters + imbalance")
    }

    // Market condition patterns
    patterns.push(`${trade.marketConditions.volatility}_${trade.setup}`)
    patterns.push(`${trade.marketConditions.trend}_${trade.setup}`)

    return patterns
  }

  // ============================================================
  // Market Regime Detection
  // ============================================================

  /**
   * Detect current market regime from recent trades and conditions.
   * 
   * The system adapts its strategy based on:
   * - Volatility (low/med/high)
   * - Trend (bullish/bearish/sideways)
   * - Volume (low/normal/high)
   */
  detectMarketRegime(): MarketRegime {
    const recent = this.tradeHistory.slice(-50)
    if (recent.length < 5) {
      return {
        volatility: "MEDIUM",
        trend: "SIDEWAYS",
        volume: "NORMAL",
        bestPatterns: [],
        worstPatterns: []
      }
    }

    // Calculate volatility from recent PnL swings
    const pnlChanges = recent.map(t => Math.abs(t.pnlPercent))
    const avgVolatility = pnlChanges.reduce((s, v) => s + v, 0) / pnlChanges.length

    let volatility: "LOW" | "MEDIUM" | "HIGH"
    if (avgVolatility < 0.5) volatility = "LOW"
    else if (avgVolatility < 1.5) volatility = "MEDIUM"
    else volatility = "HIGH"

    // Determine trend from recent trade direction success
    const recentBuys = recent.filter(t => t.action === "BUY")
    const recentSells = recent.filter(t => t.action === "SELL")
    const buyWinRate = recentBuys.length > 0 ? recentBuys.filter(t => t.success).length / recentBuys.length : 0.5
    const sellWinRate = recentSells.length > 0 ? recentSells.filter(t => t.success).length / recentSells.length : 0.5

    let trend: "BULLISH" | "BEARISH" | "SIDEWAYS"
    if (buyWinRate > 0.6 && sellWinRate < 0.4) trend = "BULLISH"
    else if (sellWinRate > 0.6 && buyWinRate < 0.4) trend = "BEARISH"
    else trend = "SIDEWAYS"

    // Volume assessment
    const avgDuration = recent.reduce((s, t) => s + t.duration, 0) / recent.length
    let volume: "LOW" | "NORMAL" | "HIGH"
    if (avgDuration > 300000) volume = "LOW" // > 5min avg trade duration
    else if (avgDuration > 60000) volume = "NORMAL"
    else volume = "HIGH"

    // Find best and worst patterns for this regime
    const allPatterns = Array.from(this.patternCache.values())
    const regimePatterns = allPatterns.filter(p =>
      p.conditions.some(c => c.includes(volatility) || c.includes(trend))
    )

    const bestPatterns = regimePatterns
      .filter(p => p.sampleSize >= this.MIN_TRADES_FOR_INSIGHT)
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 5)

    const worstPatterns = regimePatterns
      .filter(p => p.sampleSize >= this.MIN_TRADES_FOR_INSIGHT)
      .sort((a, b) => a.winRate - b.winRate)
      .slice(0, 5)

    return {
      volatility,
      trend,
      volume,
      bestPatterns,
      worstPatterns
    }
  }

  // ============================================================
  // Performance Metrics
  // ============================================================

  /**
   * Calculate the only metric that matters:
   * Risk-Weighted Return per Unit of Liquidity Taken
   * 
   * Also tracks standard metrics for validation:
   * - Win rate (bullshit, but tracked)
   * - Average win vs average loss (2:1 minimum target)
   * - Drawdown (under 10% target)
   * - Sharpe ratio (> 2.0 target)
   */
  calculatePerformance(): AdaptationReport["performance"] {
    if (this.tradeHistory.length === 0) {
      return {
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        totalPnl: 0
      }
    }

    const wins = this.tradeHistory.filter(t => t.success)
    const losses = this.tradeHistory.filter(t => !t.success)

    const winRate = this.tradeHistory.length > 0
      ? wins.length / this.tradeHistory.length
      : 0

    const avgWin = wins.length > 0
      ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length
      : 0

    const avgLoss = losses.length > 0
      ? losses.reduce((s, t) => s + Math.abs(t.pnlPercent), 0) / losses.length
      : 0

    const profitFactor = avgLoss > 0
      ? (avgWin * wins.length) / (avgLoss * losses.length)
      : wins.length > 0 ? Infinity : 0

    // Calculate Sharpe ratio
    const returns = this.tradeHistory.map(t => t.pnlPercent)
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length
    const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length
    const stdDev = Math.sqrt(variance)
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0 // Annualized

    // Calculate max drawdown
    let peak = 0
    let maxDrawdown = 0
    let runningPnl = 0

    for (const trade of this.tradeHistory) {
      runningPnl += trade.pnlPercent
      if (runningPnl > peak) peak = runningPnl
      const drawdown = peak - runningPnl
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }

    const totalPnl = this.tradeHistory.reduce((s, t) => s + t.pnlPercent, 0)

    return {
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      totalPnl
    }
  }

  // ============================================================
  // Generate Recommendations
  // ============================================================

  /**
   * Generate actionable recommendations based on learned patterns.
   * 
   * Examples:
   * - "In low volatility, stop cluster detection has 30% win rate. Use order book imbalance instead."
   * - "Liquidity sweep + funding crowded long = 70% win rate. Prioritize this setup."
   * - "Spoofing detection alone has 45% win rate. Only use when combined with dark pool signals."
   */
  generateRecommendations(regime: MarketRegime): string[] {
    const recommendations: string[] = []

    // Best patterns to use
    if (regime.bestPatterns.length > 0) {
      const topPattern = regime.bestPatterns[0]
      if (topPattern.winRate > 0.6) {
        recommendations.push(
          `HIGH CONVICTION: Pattern "${topPattern.pattern}" has ${(topPattern.winRate * 100).toFixed(0)}% win rate (${topPattern.sampleSize} samples). Prioritize this setup.`
        )
      }
    }

    // Patterns to avoid
    if (regime.worstPatterns.length > 0) {
      const worstPattern = regime.worstPatterns[0]
      if (worstPattern.winRate < 0.4) {
        recommendations.push(
          `AVOID: Pattern "${worstPattern.pattern}" has only ${(worstPattern.winRate * 100).toFixed(0)}% win rate. Skip this setup.`
        )
      }
    }

    // Regime-specific adjustments
    if (regime.volatility === "LOW") {
      recommendations.push("Low volatility detected. Tighten stop losses to 1%. Prioritize order book imbalance signals over sweep detection.")
    } else if (regime.volatility === "HIGH") {
      recommendations.push("High volatility detected. Widen stop losses to 2%. Liquidity sweeps are more reliable in this regime.")
    }

    if (regime.trend === "BULLISH") {
      recommendations.push("Bullish trend detected. Favor long setups. Short only on confirmed liquidity sweeps with reversal.")
    } else if (regime.trend === "BEARISH") {
      recommendations.push("Bearish trend detected. Favor short setups. Long only on panic selling + stop hunt.")
    }

    // Sample size warnings
    const lowSamplePatterns = Array.from(this.patternCache.values())
      .filter(p => p.sampleSize < this.MIN_TRADES_FOR_INSIGHT && p.winRate > 0.7)

    if (lowSamplePatterns.length > 0) {
      recommendations.push(
        `CAUTION: ${lowSamplePatterns.length} pattern(s) show high win rate but low sample size. Need more data to confirm.`
      )
    }

    // Performance warnings
    const perf = this.calculatePerformance()
    if (perf.maxDrawdown > 10) {
      recommendations.push(`WARNING: Drawdown at ${perf.maxDrawdown.toFixed(1)}%. Reduce position size until drawdown recovers below 10%.`)
    }
    if (perf.profitFactor < 1.5) {
      recommendations.push(`Profit factor is ${perf.profitFactor.toFixed(2)}. Target is 2.0+. Consider tightening stop losses or widening take profits.`)
    }

    return recommendations
  }

  // ============================================================
  // Full Analysis
  // ============================================================

  /**
   * Run full adaptation analysis.
   * Returns insights, performance metrics, and recommendations.
   */
  analyze(): AdaptationReport {
    const regime = this.detectMarketRegime()
    const performance = this.calculatePerformance()
    const recommendations = this.generateRecommendations(regime)

    // Get all pattern insights sorted by win rate
    const patternInsights = Array.from(this.patternCache.values())
      .filter(p => p.sampleSize >= this.MIN_TRADES_FOR_INSIGHT)
      .sort((a, b) => b.winRate - a.winRate)

    return {
      totalTrades: this.tradeHistory.length,
      recentTrades: this.tradeHistory.slice(-20).reverse(),
      patternInsights,
      currentRegime: regime,
      recommendedAdjustments: recommendations,
      performance
    }
  }

  /**
   * Get the best pattern for current market conditions.
   * Used by the trading engine to prioritize setups.
   */
  getBestPatternForCurrentRegime(): PatternInsight | null {
    const regime = this.detectMarketRegime()
    if (regime.bestPatterns.length > 0) {
      return regime.bestPatterns[0]
    }
    return null
  }

  /**
   * Check if a specific setup has been profitable recently.
   */
  isSetupProfitable(setup: TradeReason): boolean {
    const recentTrades = this.tradeHistory
      .filter(t => t.setup === setup)
      .slice(-20)

    if (recentTrades.length < 3) return true // Not enough data, assume profitable

    const wins = recentTrades.filter(t => t.success).length
    return wins / recentTrades.length > 0.5
  }

  /**
   * Get the optimal position size based on recent performance.
   * 
   * Kelly Criterion simplified:
   * - High confidence patterns: 2% risk
   * - Medium confidence patterns: 1% risk
   * - Low confidence patterns: 0.5% risk
   * - Drawdown > 10%: 0.25% risk
   */
  getOptimalRisk(): number {
    const perf = this.calculatePerformance()
    const regime = this.detectMarketRegime()

    // Base risk
    let risk = 0.01 // 1% default

    // Adjust for drawdown
    if (perf.maxDrawdown > 10) {
      risk = 0.0025 // 0.25% during drawdown
    } else if (perf.maxDrawdown > 5) {
      risk = 0.005 // 0.5% during recovery
    }

    // Adjust for volatility
    if (regime.volatility === "HIGH") {
      risk *= 0.5 // Halve risk in high volatility
    }

    // Adjust for trend alignment
    if (regime.trend !== "SIDEWAYS") {
      risk *= 1.2 // 20% more risk in trending markets
    }

    return Math.min(0.02, Math.max(0.0025, risk)) // Clamp between 0.25% and 2%
  }
}

// Singleton instance
export const adaptationEngine = new AdaptationEngine()
