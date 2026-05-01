"use client"

/**
 * SENTIMENT WEAPON
 * 
 * Not "fear and greed index". REAL sentiment analysis.
 * 
 * What we measure:
 * 1. Order Book Imbalance - Real buying/selling pressure
 * 2. Funding Rate Anomalies - When retail is crowded, smart money fades
 * 3. Exchange Flow - Large inflows/outflows reveal intent
 * 
 * The Edge:
 * - Retail sentiment is a CONTRA indicator
 * - When everyone is bullish, smart money distributes
 * - When panic hits, smart money accumulates
 */

import { type OrderBookData } from "./market-data"

// ============================================================
// Types
// ============================================================

export interface OrderBookImbalance {
  ratio: number // -1 to 1, positive = buying pressure
  bidVolume: number
  askVolume: number
  totalVolume: number
  interpretation: "EXTREME_BUYING" | "BUYING" | "NEUTRAL" | "SELLING" | "EXTREME_SELLING"
  reversalWarning: boolean // When extreme, reversal is likely
}

export interface FundingRateAnomaly {
  currentRate: number
  historicalAvg: number
  deviation: number // standard deviations from mean
  interpretation: "CROWDED_LONG" | "CROWDED_SHORT" | "NEUTRAL"
  signal: "FADE_LONG" | "FADE_SHORT" | "WAIT"
  confidence: number
}

export interface ExchangeFlowSignal {
  symbol: string
  inflow: number // BTC/USD flowing INTO exchanges
  outflow: number // BTC/USD flowing OUT of exchanges
  netFlow: number // positive = inflow (bearish), negative = outflow (bullish)
  interpretation: "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL"
  confidence: number
  timestamp: number
}

export interface SentimentReport {
  orderBookImbalance: OrderBookImbalance
  fundingRate: FundingRateAnomaly | null
  exchangeFlow: ExchangeFlowSignal | null
  compositeSignal: "BULLISH" | "BEARISH" | "NEUTRAL"
  compositeConfidence: number
  timestamp: number
}

// ============================================================
// Sentiment Weapon Engine
// ============================================================

class SentimentWeapon {
  private fundingRateHistory: number[] = []
  private exchangeFlowHistory: ExchangeFlowSignal[] = []
  private readonly MAX_HISTORY = 200
  private readonly EXTREME_IMBALANCE_THRESHOLD = 0.7
  private readonly FUNDING_DEVIATION_THRESHOLD = 2.0 // standard deviations

  // ============================================================
  // 1. Order Book Imbalance
  // ============================================================

  /**
   * Calculate order book imbalance.
   * 
   * Formula: (Bid Volume - Ask Volume) / Total Volume
   * 
   * Interpretation:
   * - > 0.7 = EXTREME buying pressure → WATCH FOR REVERSAL
   * - 0.3 to 0.7 = Buying pressure
   * - -0.3 to 0.3 = Neutral
   * - -0.7 to -0.3 = Selling pressure
   * - < -0.7 = EXTREME selling pressure → WATCH FOR REVERSAL
   * 
   * The key insight: EXTREME readings are REVERSAL signals.
   * When everyone is buying, smart money is selling to them.
   */
  calculateOrderBookImbalance(orderBook: OrderBookData): OrderBookImbalance {
    const bidVolume = orderBook.bids.reduce((sum, level) => sum + level.size, 0)
    const askVolume = orderBook.asks.reduce((sum, level) => sum + level.size, 0)
    const totalVolume = bidVolume + askVolume

    if (totalVolume === 0) {
      return {
        ratio: 0,
        bidVolume: 0,
        askVolume: 0,
        totalVolume: 0,
        interpretation: "NEUTRAL",
        reversalWarning: false
      }
    }

    const ratio = (bidVolume - askVolume) / totalVolume

    let interpretation: OrderBookImbalance["interpretation"]
    let reversalWarning = false

    if (ratio > this.EXTREME_IMBALANCE_THRESHOLD) {
      interpretation = "EXTREME_BUYING"
      reversalWarning = true // Extreme = reversal likely
    } else if (ratio > 0.3) {
      interpretation = "BUYING"
    } else if (ratio < -this.EXTREME_IMBALANCE_THRESHOLD) {
      interpretation = "EXTREME_SELLING"
      reversalWarning = true // Extreme = reversal likely
    } else if (ratio < -0.3) {
      interpretation = "SELLING"
    } else {
      interpretation = "NEUTRAL"
    }

    return {
      ratio,
      bidVolume,
      askVolume,
      totalVolume,
      interpretation,
      reversalWarning
    }
  }

  // ============================================================
  // 2. Funding Rate Anomalies
  // ============================================================

  /**
   * Analyze funding rate for anomalies.
   * 
   * How it works:
   * - Perpetual futures have funding rates paid between longs and shorts
   * - When funding is extremely high → retail is crowded LONG
   * - Smart money fades the crowd (shorts the crowded long)
   * - When funding is extremely negative → retail is crowded SHORT
   * - Smart money fades the crowd (buys the crowded short)
   * 
   * We track historical funding rates and flag deviations > 2 std devs.
   */
  analyzeFundingRate(currentRate: number): FundingRateAnomaly {
    this.fundingRateHistory.push(currentRate)
    if (this.fundingRateHistory.length > this.MAX_HISTORY) {
      this.fundingRateHistory.shift()
    }

    const avg = this.fundingRateHistory.reduce((s, r) => s + r, 0) / this.fundingRateHistory.length
    const variance = this.fundingRateHistory.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / this.fundingRateHistory.length
    const stdDev = Math.sqrt(variance)

    const deviation = stdDev > 0 ? (currentRate - avg) / stdDev : 0

    let interpretation: FundingRateAnomaly["interpretation"]
    let signal: FundingRateAnomaly["signal"]
    let confidence: number

    if (deviation > this.FUNDING_DEVIATION_THRESHOLD) {
      // Funding extremely high = retail crowded long
      interpretation = "CROWDED_LONG"
      signal = "FADE_LONG" // Smart money fades: short
      confidence = Math.min(95, 50 + (deviation - this.FUNDING_DEVIATION_THRESHOLD) * 15)
    } else if (deviation < -this.FUNDING_DEVIATION_THRESHOLD) {
      // Funding extremely negative = retail crowded short
      interpretation = "CROWDED_SHORT"
      signal = "FADE_SHORT" // Smart money fades: long
      confidence = Math.min(95, 50 + Math.abs(deviation + this.FUNDING_DEVIATION_THRESHOLD) * 15)
    } else {
      interpretation = "NEUTRAL"
      signal = "WAIT"
      confidence = 0
    }

    return {
      currentRate,
      historicalAvg: avg,
      deviation,
      interpretation,
      signal,
      confidence
    }
  }

  // ============================================================
  // 3. Exchange Flow Analysis
  // ============================================================

  /**
   * Analyze exchange flow for accumulation/distribution signals.
   * 
   * How it works:
   * - Large inflows to exchanges = preparation to sell (bearish)
   * - Large outflows to cold storage = long-term hold (bullish)
   * - Sudden spike in either direction = significant move incoming
   * 
   * Note: In paper trading mode, we simulate this from volume patterns.
   */
  analyzeExchangeFlow(
    symbol: string,
    volume: number,
    price: number,
    priceChange: number
  ): ExchangeFlowSignal {
    // In real mode, this would come from on-chain data
    // For now, we infer from volume and price action
    const simulatedInflow = volume * (priceChange > 0 ? 0.3 : 0.7)
    const simulatedOutflow = volume * (priceChange > 0 ? 0.7 : 0.3)

    const netFlow = simulatedInflow - simulatedOutflow

    let interpretation: ExchangeFlowSignal["interpretation"]
    let confidence: number

    if (netFlow > volume * 0.3) {
      // More flowing in = distribution (bearish)
      interpretation = "DISTRIBUTION"
      confidence = Math.min(80, (netFlow / volume) * 100)
    } else if (netFlow < -volume * 0.3) {
      // More flowing out = accumulation (bullish)
      interpretation = "ACCUMULATION"
      confidence = Math.min(80, Math.abs(netFlow / volume) * 100)
    } else {
      interpretation = "NEUTRAL"
      confidence = 0
    }

    const signal: ExchangeFlowSignal = {
      symbol,
      inflow: simulatedInflow,
      outflow: simulatedOutflow,
      netFlow,
      interpretation,
      confidence,
      timestamp: Date.now()
    }

    this.exchangeFlowHistory.push(signal)
    if (this.exchangeFlowHistory.length > this.MAX_HISTORY) {
      this.exchangeFlowHistory.shift()
    }

    return signal
  }

  // ============================================================
  // Composite Analysis
  // ============================================================

  /**
   * Combine all sentiment signals into a single report.
   * 
   * The composite signal is weighted:
   * - Order book imbalance: 40%
   * - Funding rate: 35%
   * - Exchange flow: 25%
   */
  analyze(
    orderBook: OrderBookData,
    fundingRate: number | null,
    symbol: string,
    volume: number,
    price: number,
    priceChange: number
  ): SentimentReport {
    const imbalance = this.calculateOrderBookImbalance(orderBook)
    const fundingAnomaly = fundingRate !== null ? this.analyzeFundingRate(fundingRate) : null
    const exchangeFlow = this.analyzeExchangeFlow(symbol, volume, price, priceChange)

    // Calculate composite signal
    let bullishScore = 0
    let bearishScore = 0
    let totalWeight = 0

    // Order book imbalance (40% weight)
    const obWeight = 0.4
    if (imbalance.ratio > 0.3) {
      if (imbalance.reversalWarning) {
        // Extreme buying = reversal warning = bearish
        bearishScore += obWeight * 70
      } else {
        bullishScore += obWeight * imbalance.ratio * 100
      }
    } else if (imbalance.ratio < -0.3) {
      if (imbalance.reversalWarning) {
        // Extreme selling = reversal warning = bullish
        bullishScore += obWeight * 70
      } else {
        bearishScore += obWeight * Math.abs(imbalance.ratio) * 100
      }
    }
    totalWeight += obWeight

    // Funding rate (35% weight)
    const frWeight = 0.35
    if (fundingAnomaly) {
      if (fundingAnomaly.signal === "FADE_LONG") {
        bearishScore += frWeight * fundingAnomaly.confidence
      } else if (fundingAnomaly.signal === "FADE_SHORT") {
        bullishScore += frWeight * fundingAnomaly.confidence
      }
    }
    totalWeight += frWeight

    // Exchange flow (25% weight)
    const efWeight = 0.25
    if (exchangeFlow.interpretation === "ACCUMULATION") {
      bullishScore += efWeight * exchangeFlow.confidence
    } else if (exchangeFlow.interpretation === "DISTRIBUTION") {
      bearishScore += efWeight * exchangeFlow.confidence
    }
    totalWeight += efWeight

    const netScore = totalWeight > 0 ? (bullishScore - bearishScore) / totalWeight : 0
    const compositeConfidence = Math.min(100, Math.abs(netScore))

    let compositeSignal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL"
    if (netScore > 20) compositeSignal = "BULLISH"
    else if (netScore < -20) compositeSignal = "BEARISH"

    return {
      orderBookImbalance: imbalance,
      fundingRate: fundingAnomaly,
      exchangeFlow,
      compositeSignal,
      compositeConfidence,
      timestamp: Date.now()
    }
  }

  /**
   * Get a contrarian trade signal from sentiment analysis.
   * 
   * The key insight: We trade AGAINST extreme sentiment.
   * - Extreme buying → prepare to short
   * - Extreme selling → prepare to long
   * - Funding crowded long → short
   * - Funding crowded short → long
   */
  getTradeSignal(report: SentimentReport): {
    action: "BUY" | "SELL" | "WAIT"
    confidence: number
    reason: string
  } {
    // Check for extreme order book imbalance (reversal signal)
    if (report.orderBookImbalance.reversalWarning) {
      if (report.orderBookImbalance.interpretation === "EXTREME_BUYING") {
        return {
          action: "SELL",
          confidence: 75,
          reason: `Extreme buying pressure detected (imbalance: ${(report.orderBookImbalance.ratio * 100).toFixed(0)}%). Everyone is buying = smart money is selling. Prepare for reversal.`
        }
      } else {
        return {
          action: "BUY",
          confidence: 75,
          reason: `Extreme selling pressure detected (imbalance: ${(report.orderBookImbalance.ratio * 100).toFixed(0)}%). Panic selling = smart money is accumulating. Prepare for reversal.`
        }
      }
    }

    // Check funding rate anomaly
    if (report.fundingRate && report.fundingRate.signal !== "WAIT") {
      const action = report.fundingRate.signal === "FADE_LONG" ? "SELL" : "BUY"
      return {
        action,
        confidence: report.fundingRate.confidence,
        reason: `Funding rate anomaly: ${report.fundingRate.interpretation === "CROWDED_LONG" ? "Retail is crowded long" : "Retail is crowded short"} (deviation: ${report.fundingRate.deviation.toFixed(2)}σ). Fading the crowd.`
      }
    }

    // Check exchange flow
    if (report.exchangeFlow && report.exchangeFlow.confidence > 50) {
      const action = report.exchangeFlow.interpretation === "ACCUMULATION" ? "BUY" : "SELL"
      return {
        action,
        confidence: report.exchangeFlow.confidence,
        reason: `Exchange flow shows ${report.exchangeFlow.interpretation.toLowerCase()}: ${Math.abs(report.exchangeFlow.netFlow).toFixed(2)} ${report.exchangeFlow.symbol} net flow.`
      }
    }

    return {
      action: "WAIT",
      confidence: 0,
      reason: "No extreme sentiment detected. Waiting for crowd to show its hand."
    }
  }
}

// Singleton instance
export const sentimentWeapon = new SentimentWeapon()
