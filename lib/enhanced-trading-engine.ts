"use client"

/**
 * ENHANCED TRADING ENGINE - The Contrarian Entry Engine
 * 
 * Core Philosophy:
 * - Go AGAINST retail psychology
 * - Enter AFTER the liquidity hunt, not before
 * - Wait for confirmation, don't front-run
 * - Be a ghost: no detectable footprint
 * 
 * Rules that go against retail:
 * - When everyone screams BUY → Wait for liquidity sweep → Short the bounce
 * - When panic selling hits → Look for stop hunts → Buy the reversal
 * - When news drops → Wait 15 minutes (let algos front-run) → Enter the real move
 */

import { type LiquidityWarfareReport } from "./liquidity-warfare"
import { type SentimentReport } from "./sentiment-weapon"
import { type OrderBookData } from "./market-data"

// ============================================================
// Types
// ============================================================

export type TradeAction = "BUY" | "SELL" | "WAIT"
export type OrderType = "MARKET" | "LIMIT" | "ICEBERG"
export type TradeReason = 
  | "LIQUIDITY_SWEEP_REVERSAL"
  | "SPOOF_FADE"
  | "STOP_HUNT_REVERSAL"
  | "FUNDING_CROWD_FADE"
  | "EXTREME_SENTIMENT_REVERSAL"
  | "DARK_POOL_ACCUMULATION"
  | "NEWS_DELAYED_ENTRY"
  | "MULTI_FACTOR_ALIGNMENT"

export interface EnhancedTradeSignal {
  action: TradeAction
  confidence: number // 0-100
  reason: TradeReason
  explanation: string
  entryPrice: number
  stopLoss: number
  takeProfit: number
  riskReward: number
  orderType: OrderType
  icebergParams?: {
    totalSize: number
    visibleSize: number
    numIcebergs: number
  }
  timing: {
    delayMs: number // Random delay for stealth
    entryWindowStart: number
    entryWindowEnd: number
  }
  factors: {
    liquidityWarfare: boolean
    sentiment: boolean
    contrarian: boolean
    stealth: boolean
  }
}

export interface TradeExecutionPlan {
  signal: EnhancedTradeSignal
  subOrders: {
    price: number
    size: number
    timestamp: number
  }[]
  totalSize: number
  averagePrice: number
  slippage: number
}

// ============================================================
// Contrarian Rules Engine
// ============================================================

class ContrarianRules {
  /**
   * Rule 1: When everyone screams BUY → Wait for liquidity sweep → Short the bounce
   * 
   * Psychology: Retail FOMO buys at the top
   * Reality: Smart money distributes to them, then sweeps stops above
   * Our move: Wait for the sweep, short the bounce back
   */
  evaluateBuyFrenzy(
    sentimentReport: SentimentReport,
    warfareReport: LiquidityWarfareReport,
    currentPrice: number
  ): EnhancedTradeSignal | null {
    // Check for extreme buying sentiment
    const extremeBuying = sentimentReport.orderBookImbalance.interpretation === "EXTREME_BUYING"
    const crowdedLong = sentimentReport.fundingRate?.interpretation === "CROWDED_LONG"
    const retailFrenzy = extremeBuying || crowdedLong

    if (!retailFrenzy) return null

    // Check for liquidity sweep above (stops being hunted)
    const sweepUp = warfareReport.liquiditySweeps.find(s => s.direction === "UP")
    const hasSweepAndReversal = sweepUp?.reversalConfirmed

    if (hasSweepAndReversal) {
      // Sweep happened, reversal confirmed = SHORT
      const confidence = Math.min(90, 
        (sweepUp!.confidence * 0.5) + 
        (sentimentReport.compositeConfidence * 0.3) + 
        20 // contrarian bonus
      )

      const stopLoss = currentPrice * 1.015 // Tight stop above sweep level
      const takeProfit = currentPrice * 0.975 // 2.5% target
      const riskReward = (currentPrice - takeProfit) / (stopLoss - currentPrice)

      return this.createSignal("SELL", confidence, "LIQUIDITY_SWEEP_REVERSAL", currentPrice, stopLoss, takeProfit, riskReward, {
        explanation: `Retail buying frenzy detected (imbalance: ${(sentimentReport.orderBookImbalance.ratio * 100).toFixed(0)}%). Price swept up through ${sweepUp!.sweepPrice}, triggering ${sweepUp!.stopLossesTriggered} stops. Reversal confirmed. Shorting the bounce.`,
        liquidityWarfare: true,
        sentiment: true,
        contrarian: true,
        stealth: true
      })
    }

    // No sweep yet, but extreme buying = prepare to short
    if (extremeBuying) {
      return this.createSignal("WAIT", 60, "EXTREME_SENTIMENT_REVERSAL", currentPrice, 0, 0, 0, {
        explanation: `Extreme buying detected but no liquidity sweep yet. Waiting for stop hunt above current price before shorting.`,
        liquidityWarfare: false,
        sentiment: true,
        contrarian: true,
        stealth: true
      })
    }

    return null
  }

  /**
   * Rule 2: When panic selling hits → Look for stop hunts → Buy the reversal
   * 
   * Psychology: Retail panic sells at the bottom
   * Reality: Smart money accumulates from them, then sweeps stops below
   * Our move: Wait for the sweep, buy the reversal
   */
  evaluatePanicSelling(
    sentimentReport: SentimentReport,
    warfareReport: LiquidityWarfareReport,
    currentPrice: number
  ): EnhancedTradeSignal | null {
    const extremeSelling = sentimentReport.orderBookImbalance.interpretation === "EXTREME_SELLING"
    const crowdedShort = sentimentReport.fundingRate?.interpretation === "CROWDED_SHORT"
    const panic = extremeSelling || crowdedShort

    if (!panic) return null

    // Check for liquidity sweep below (stops being hunted)
    const sweepDown = warfareReport.liquiditySweeps.find(s => s.direction === "DOWN")
    const hasSweepAndReversal = sweepDown?.reversalConfirmed

    if (hasSweepAndReversal) {
      // Sweep happened, reversal confirmed = BUY
      const confidence = Math.min(90,
        (sweepDown!.confidence * 0.5) +
        (sentimentReport.compositeConfidence * 0.3) +
        20 // contrarian bonus
      )

      const stopLoss = currentPrice * 0.985 // Tight stop below sweep level
      const takeProfit = currentPrice * 1.025 // 2.5% target
      const riskReward = (takeProfit - currentPrice) / (currentPrice - stopLoss)

      return this.createSignal("BUY", confidence, "STOP_HUNT_REVERSAL", currentPrice, stopLoss, takeProfit, riskReward, {
        explanation: `Panic selling detected (imbalance: ${(sentimentReport.orderBookImbalance.ratio * 100).toFixed(0)}%). Price swept down through ${sweepDown!.sweepPrice}, triggering ${sweepDown!.stopLossesTriggered} stops. Reversal confirmed. Buying the panic.`,
        liquidityWarfare: true,
        sentiment: true,
        contrarian: true,
        stealth: true
      })
    }

    // No sweep yet, but extreme selling = prepare to buy
    if (extremeSelling) {
      return this.createSignal("WAIT", 60, "EXTREME_SENTIMENT_REVERSAL", currentPrice, 0, 0, 0, {
        explanation: `Panic selling detected but no liquidity sweep yet. Waiting for stop hunt below current price before buying.`,
        liquidityWarfare: false,
        sentiment: true,
        contrarian: true,
        stealth: true
      })
    }

    return null
  }

  /**
   * Rule 3: When news drops → Wait 15 minutes → Enter the real move
   * 
   * Psychology: Retail reacts instantly to news
   * Reality: Algos front-run the news, then the real move happens after
   * Our move: Wait for the initial volatility to settle, then enter
   */
  evaluateNewsEvent(
    currentPrice: number,
    priceChange5m: number,
    volumeSpike: boolean
  ): EnhancedTradeSignal | null {
    if (!volumeSpike || Math.abs(priceChange5m) < 0.5) return null

    // News detected: large move on high volume
    // Wait 15 minutes (simulated) before entering
    const direction = priceChange5m > 0 ? "SELL" : "BUY" // Fade the initial move

    const confidence = 65 // News trades are less reliable
    const stopLoss = currentPrice * (direction === "BUY" ? 0.985 : 1.015)
    const takeProfit = currentPrice * (direction === "BUY" ? 1.025 : 0.975)
    const riskReward = direction === "BUY"
      ? (takeProfit - currentPrice) / (currentPrice - stopLoss)
      : (currentPrice - takeProfit) / (stopLoss - currentPrice)

    return this.createSignal(direction as TradeAction, confidence, "NEWS_DELAYED_ENTRY", currentPrice, stopLoss, takeProfit, riskReward, {
      explanation: `News event detected: ${Math.abs(priceChange5m).toFixed(1)}% move in 5min on high volume. Waiting 15min for algos to front-run before entering. Fading the initial move.`,
      liquidityWarfare: false,
      sentiment: false,
      contrarian: true,
      stealth: true
    })
  }

  /**
   * Rule 4: Multi-factor alignment
   * When 3+ factors align, it's a high-probability trade
   */
  evaluateMultiFactor(
    warfareReport: LiquidityWarfareReport,
    sentimentReport: SentimentReport,
    currentPrice: number
  ): EnhancedTradeSignal | null {
    let bullishFactors = 0
    let bearishFactors = 0
    const reasons: string[] = []

    // Factor 1: Liquidity warfare signal
    if (warfareReport.overallSignal === "BULLISH") {
      bullishFactors++
      reasons.push("Liquidity warfare bullish")
    } else if (warfareReport.overallSignal === "BEARISH") {
      bearishFactors++
      reasons.push("Liquidity warfare bearish")
    }

    // Factor 2: Sentiment signal
    if (sentimentReport.compositeSignal === "BULLISH") {
      bullishFactors++
      reasons.push("Sentiment bullish")
    } else if (sentimentReport.compositeSignal === "BEARISH") {
      bearishFactors++
      reasons.push("Sentiment bearish")
    }

    // Factor 3: Spoofing detected
    if (warfareReport.spoofingAlerts.length > 0) {
      const spoofSide = warfareReport.spoofingAlerts[0].side
      if (spoofSide === "ASK") {
        bullishFactors++
        reasons.push("Spoofing on ask side (real buying)")
      } else {
        bearishFactors++
        reasons.push("Spoofing on bid side (real selling)")
      }
    }

    // Factor 4: Dark pool activity
    if (warfareReport.darkPoolSignals.length > 0) {
      const dpSide = warfareReport.darkPoolSignals[0].inferredSide
      if (dpSide === "BUY") {
        bullishFactors++
        reasons.push("Dark pool accumulation")
      } else {
        bearishFactors++
        reasons.push("Dark pool distribution")
      }
    }

    // Factor 5: Funding rate anomaly
    if (sentimentReport.fundingRate) {
      if (sentimentReport.fundingRate.signal === "FADE_SHORT") {
        bullishFactors++
        reasons.push("Funding crowded short")
      } else if (sentimentReport.fundingRate.signal === "FADE_LONG") {
        bearishFactors++
        reasons.push("Funding crowded long")
      }
    }

    // Need 3+ factors on one side
    if (bullishFactors >= 3) {
      const confidence = Math.min(90, 60 + bullishFactors * 8)
      const stopLoss = currentPrice * 0.985
      const takeProfit = currentPrice * 1.03
      const riskReward = (takeProfit - currentPrice) / (currentPrice - stopLoss)

      return this.createSignal("BUY", confidence, "MULTI_FACTOR_ALIGNMENT", currentPrice, stopLoss, takeProfit, riskReward, {
        explanation: `${bullishFactors} bullish factors align: ${reasons.join(", ")}. High-probability long setup.`,
        liquidityWarfare: true,
        sentiment: true,
        contrarian: true,
        stealth: true
      })
    }

    if (bearishFactors >= 3) {
      const confidence = Math.min(90, 60 + bearishFactors * 8)
      const stopLoss = currentPrice * 1.015
      const takeProfit = currentPrice * 0.97
      const riskReward = (currentPrice - takeProfit) / (stopLoss - currentPrice)

      return this.createSignal("SELL", confidence, "MULTI_FACTOR_ALIGNMENT", currentPrice, stopLoss, takeProfit, riskReward, {
        explanation: `${bearishFactors} bearish factors align: ${reasons.join(", ")}. High-probability short setup.`,
        liquidityWarfare: true,
        sentiment: true,
        contrarian: true,
        stealth: true
      })
    }

    return null
  }

  private createSignal(
    action: TradeAction,
    confidence: number,
    reason: TradeReason,
    entryPrice: number,
    stopLoss: number,
    takeProfit: number,
    riskReward: number,
    factors: { explanation: string; liquidityWarfare: boolean; sentiment: boolean; contrarian: boolean; stealth: boolean }
  ): EnhancedTradeSignal {
    // Add random timing delay for stealth (100-500ms)
    const delayMs = 100 + Math.random() * 400
    const now = Date.now()

    return {
      action,
      confidence,
      reason,
      explanation: factors.explanation,
      entryPrice,
      stopLoss,
      takeProfit,
      riskReward,
      orderType: action === "WAIT" ? "LIMIT" : "ICEBERG",
      icebergParams: action !== "WAIT" ? {
        totalSize: 1,
        visibleSize: 0.1, // Only show 10% of order
        numIcebergs: 10
      } : undefined,
      timing: {
        delayMs,
        entryWindowStart: now + delayMs,
        entryWindowEnd: now + delayMs + 5000
      },
      factors: {
        liquidityWarfare: factors.liquidityWarfare,
        sentiment: factors.sentiment,
        contrarian: factors.contrarian,
        stealth: factors.stealth
      }
    }
  }
}

// ============================================================
// Stealth Mode (Phase 4)
// ============================================================

class StealthExecutor {
  /**
   * Create iceberg order plan - break large orders into many small ones.
   * 
   * Why: Large market orders move the market against you.
   * Iceberg orders hide your true size.
   */
  createIcebergPlan(
    totalSize: number,
    currentPrice: number,
    side: "BUY" | "SELL"
  ): { subOrders: { price: number; size: number }[]; visibleSize: number } {
    const numIcebergs = Math.max(3, Math.ceil(totalSize / 0.1))
    const visibleSize = totalSize / numIcebergs
    const subOrders: { price: number; size: number }[] = []

    for (let i = 0; i < numIcebergs; i++) {
      // Randomize price slightly to avoid detection
      const priceOffset = (Math.random() - 0.5) * currentPrice * 0.0005 // 0.05% random offset
      const price = side === "BUY"
        ? currentPrice - priceOffset
        : currentPrice + priceOffset

      subOrders.push({
        price: Number(price.toFixed(2)),
        size: Number(visibleSize.toFixed(6))
      })
    }

    return { subOrders, visibleSize }
  }

  /**
   * Add random timing between sub-orders.
   * 
   * Why: Predictable intervals = detectable pattern.
   * Random intervals = ghost in the machine.
   */
  addRandomTiming(
    subOrders: { price: number; size: number }[],
    baseDelayMs: number = 200
  ): { price: number; size: number; timestamp: number }[] {
    const now = Date.now()
    let currentTime = now

    return subOrders.map(order => {
      // Random delay between 100ms and baseDelayMs * 2
      const delay = 100 + Math.random() * baseDelayMs * 2
      currentTime += delay

      return {
        ...order,
        timestamp: currentTime
      }
    })
  }

  /**
   * Spoof defense: If spoofing detected, wait for real move.
   * 
   * Why: Spoofing creates fake moves. Wait 5 seconds for the real direction.
   */
  spoofDefense(warfareReport: LiquidityWarfareReport): { shouldWait: boolean; waitMs: number } {
    if (warfareReport.spoofingAlerts.length > 0) {
      const highConfSpoof = warfareReport.spoofingAlerts.some(s => s.confidence > 60)
      if (highConfSpoof) {
        return { shouldWait: true, waitMs: 5000 }
      }
    }
    return { shouldWait: false, waitMs: 0 }
  }
}

// ============================================================
// Enhanced Trading Engine (Combined)
// ============================================================

class EnhancedTradingEngine {
  private contrarianRules: ContrarianRules
  private stealthExecutor: StealthExecutor
  private lastTradeTime: number = 0
  private readonly MIN_TRADE_INTERVAL = 60000 // 1 minute between trades

  constructor() {
    this.contrarianRules = new ContrarianRules()
    this.stealthExecutor = new StealthExecutor()
  }

  /**
   * Analyze all signals and generate an enhanced trade signal.
   * 
   * This is the main entry point that combines:
   * 1. Liquidity warfare analysis (stop clusters, spoofing, sweeps)
   * 2. Sentiment analysis (order book imbalance, funding, exchange flow)
   * 3. Contrarian rules (fade retail, wait for sweeps, delay on news)
   * 4. Stealth mode (iceberg orders, random timing, spoof defense)
   */
  analyze(
    currentPrice: number,
    warfareReport: LiquidityWarfareReport,
    sentimentReport: SentimentReport,
    priceChange5m: number,
    volumeSpike: boolean
  ): EnhancedTradeSignal {
    // Check spoof defense first
    const spoofCheck = this.stealthExecutor.spoofDefense(warfareReport)
    if (spoofCheck.shouldWait) {
      return {
        action: "WAIT",
        confidence: 0,
        reason: "SPOOF_FADE",
        explanation: `Spoofing detected. Waiting ${spoofCheck.waitMs / 1000}s for real move to develop.`,
        entryPrice: currentPrice,
        stopLoss: 0,
        takeProfit: 0,
        riskReward: 0,
        orderType: "LIMIT",
        timing: {
          delayMs: spoofCheck.waitMs,
          entryWindowStart: Date.now() + spoofCheck.waitMs,
          entryWindowEnd: Date.now() + spoofCheck.waitMs + 5000
        },
        factors: { liquidityWarfare: true, sentiment: false, contrarian: false, stealth: true }
      }
    }

    // Priority 1: Liquidity sweep reversal (strongest signal)
    const sweepSignal = this.evaluateSweepSignal(warfareReport, currentPrice)
    if (sweepSignal && sweepSignal.action !== "WAIT") {
      return this.applyStealth(sweepSignal)
    }

    // Priority 2: Contrarian rules
    const buyFrenzySignal = this.contrarianRules.evaluateBuyFrenzy(sentimentReport, warfareReport, currentPrice)
    if (buyFrenzySignal && buyFrenzySignal.action !== "WAIT") {
      return this.applyStealth(buyFrenzySignal)
    }

    const panicSignal = this.contrarianRules.evaluatePanicSelling(sentimentReport, warfareReport, currentPrice)
    if (panicSignal && panicSignal.action !== "WAIT") {
      return this.applyStealth(panicSignal)
    }

    // Priority 3: News event
    const newsSignal = this.contrarianRules.evaluateNewsEvent(currentPrice, priceChange5m, volumeSpike)
    if (newsSignal && newsSignal.action !== "WAIT") {
      return this.applyStealth(newsSignal)
    }

    // Priority 4: Multi-factor alignment
    const multiFactorSignal = this.contrarianRules.evaluateMultiFactor(warfareReport, sentimentReport, currentPrice)
    if (multiFactorSignal && multiFactorSignal.action !== "WAIT") {
      return this.applyStealth(multiFactorSignal)
    }

    // No signal
    return {
      action: "WAIT",
      confidence: 0,
      reason: "MULTI_FACTOR_ALIGNMENT",
      explanation: "No high-confidence setup detected. Waiting for 3+ factors to align.",
      entryPrice: currentPrice,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      orderType: "LIMIT",
      timing: {
        delayMs: 0,
        entryWindowStart: Date.now(),
        entryWindowEnd: Date.now() + 30000
      },
      factors: { liquidityWarfare: false, sentiment: false, contrarian: false, stealth: false }
    }
  }

  private evaluateSweepSignal(
    warfareReport: LiquidityWarfareReport,
    currentPrice: number
  ): EnhancedTradeSignal | null {
    const confirmedSweep = warfareReport.liquiditySweeps.find(s => s.reversalConfirmed)
    if (!confirmedSweep) return null

    const action = confirmedSweep.direction === "UP" ? "SELL" : "BUY"
    const stopLoss = action === "BUY"
      ? currentPrice * 0.985
      : currentPrice * 1.015
    const takeProfit = action === "BUY"
      ? currentPrice * 1.03
      : currentPrice * 0.97
    const riskReward = action === "BUY"
      ? (takeProfit - currentPrice) / (currentPrice - stopLoss)
      : (currentPrice - takeProfit) / (stopLoss - currentPrice)

    return {
      action,
      confidence: confirmedSweep.confidence,
      reason: "LIQUIDITY_SWEEP_REVERSAL",
      explanation: `Liquidity sweep confirmed! Price swept ${confirmedSweep.direction} through ${confirmedSweep.sweepPrice}, triggering ${confirmedSweep.stopLossesTriggered} stops. Reversal confirmed. Entering ${action} position.`,
      entryPrice: currentPrice,
      stopLoss,
      takeProfit,
      riskReward,
      orderType: "ICEBERG",
      icebergParams: {
        totalSize: 1,
        visibleSize: 0.1,
        numIcebergs: 10
      },
      timing: {
        delayMs: 100 + Math.random() * 400,
        entryWindowStart: Date.now(),
        entryWindowEnd: Date.now() + 5000
      },
      factors: { liquidityWarfare: true, sentiment: false, contrarian: true, stealth: true }
    }
  }

  private applyStealth(signal: EnhancedTradeSignal): EnhancedTradeSignal {
    if (signal.action === "WAIT") return signal

    // Add stealth parameters
    const icebergPlan = this.stealthExecutor.createIcebergPlan(
      signal.icebergParams?.totalSize || 1,
      signal.entryPrice,
      signal.action
    )

    const timedOrders = this.stealthExecutor.addRandomTiming(icebergPlan.subOrders)

    return {
      ...signal,
      orderType: "ICEBERG",
      icebergParams: {
        totalSize: signal.icebergParams?.totalSize || 1,
        visibleSize: icebergPlan.visibleSize,
        numIcebergs: icebergPlan.subOrders.length
      },
      timing: {
        delayMs: 100 + Math.random() * 400,
        entryWindowStart: timedOrders[0]?.timestamp || Date.now(),
        entryWindowEnd: timedOrders[timedOrders.length - 1]?.timestamp || Date.now() + 5000
      }
    }
  }

  /**
   * Check if we can trade (respect minimum interval).
   */
  canTrade(): boolean {
    const now = Date.now()
    if (now - this.lastTradeTime < this.MIN_TRADE_INTERVAL) {
      return false
    }
    this.lastTradeTime = now
    return true
  }
}

// Singleton instance
export const enhancedTradingEngine = new EnhancedTradingEngine()
