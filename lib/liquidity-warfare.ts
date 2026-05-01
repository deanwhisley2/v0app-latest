"use client"

/**
 * LIQUIDITY WARFARE ENGINE
 * 
 * This is not a trading bot. This is a market intelligence weapon.
 * 
 * Core Philosophy:
 * - Don't predict price. Predict what LIQUIDITY PROVIDERS will do.
 * - Institutions hunt stop losses. We track where they hunt.
 * - Fake orders (spoofing) reveal intent. We detect them.
 * - Dark pool activity shows smart money. We follow it.
 * - Liquidity sweeps are THE signal. We enter on reversals.
 */

import { type OrderBookData, type OrderBookLevel } from "./market-data"

// ============================================================
// Types
// ============================================================

export interface StopCluster {
  price: number
  estimatedStops: number
  totalVolume: number
  side: "BUY" | "SELL" // BUY = stop losses above price, SELL = stop losses below
  confidence: number // 0-100
  zoneWidth: number // price range of the cluster
}

export interface SpoofingAlert {
  price: number
  size: number
  side: "BID" | "ASK"
  duration: number // how many ticks it lasted before vanishing
  confidence: number // 0-100
  detectedAt: number
}

export interface DarkPoolSignal {
  price: number
  volume: number
  inferredSide: "BUY" | "SELL"
  priceImpact: number // how much price moved relative to volume
  confidence: number
  timestamp: number
}

export interface LiquiditySweep {
  sweepPrice: number
  direction: "UP" | "DOWN"
  volume: number
  stopLossesTriggered: number
  reversalConfirmed: boolean
  entryPrice: number
  confidence: number
  timestamp: number
}

export interface LiquidityWarfareReport {
  stopClusters: StopCluster[]
  spoofingAlerts: SpoofingAlert[]
  darkPoolSignals: DarkPoolSignal[]
  liquiditySweeps: LiquiditySweep[]
  overallSignal: "BULLISH" | "BEARISH" | "NEUTRAL"
  signalStrength: number
  timestamp: number
}

// ============================================================
// Liquidity Warfare Engine
// ============================================================

class LiquidityWarfareEngine {
  private orderBookHistory: OrderBookData[] = []
  private priceHistory: number[] = []
  private volumeHistory: number[] = []
  private spoofingCandidates: Map<string, SpoofingAlert> = new Map()
  private readonly MAX_HISTORY = 500
  private readonly STOP_CLUSTER_THRESHOLD = 1000 // 1000+ stops = cluster
  private readonly SPOOF_MIN_SIZE = 10 // BTC minimum for spoof detection
  private readonly DARK_POOL_VOLUME_MULTIPLIER = 3

  // ============================================================
  // PHASE 1: Stop Cluster Hunting
  // ============================================================

  /**
   * Hunt for stop loss clusters in the order book.
   * 
   * How it works:
   * - Institutions know where retail places stops (above resistance, below support)
   * - They push price to those levels to trigger stops
   * - The resulting liquidity cascade creates the real move
   * 
   * We identify these zones by looking for:
   * 1. Unusually large order book gaps (retail stops cluster at round numbers)
   * 2. High density of small orders at specific levels
   * 3. Levels where price previously reversed sharply
   */
  huntStopClusters(currentPrice: number, orderBook: OrderBookData): StopCluster[] {
    const clusters: StopCluster[] = []

    // Analyze bid side (stops below current price - long liquidations)
    const bidClusters = this.findStopClustersOnSide(orderBook.bids, currentPrice, "SELL")
    clusters.push(...bidClusters)

    // Analyze ask side (stops above current price - short liquidations)
    const askClusters = this.findStopClustersOnSide(orderBook.asks, currentPrice, "BUY")
    clusters.push(...askClusters)

    // Add round number analysis (retail loves round numbers for stops)
    const roundNumberClusters = this.findRoundNumberClusters(currentPrice, orderBook)
    clusters.push(...roundNumberClusters)

    return clusters.sort((a, b) => b.confidence - a.confidence)
  }

  private findStopClustersOnSide(
    levels: OrderBookLevel[],
    currentPrice: number,
    side: "BUY" | "SELL"
  ): StopCluster[] {
    const clusters: StopCluster[] = []
    const windowSize = 3

    for (let i = 0; i <= levels.length - windowSize; i++) {
      const window = levels.slice(i, i + windowSize)
      const totalVolume = window.reduce((sum, l) => sum + l.size, 0)
      const avgSize = totalVolume / windowSize

      // Detect volume clusters (many small orders = retail stops)
      const smallOrderCount = window.filter(l => l.size < avgSize * 0.5).length
      const estimatedStops = Math.round(totalVolume / 0.01) // Assume avg stop = 0.01 BTC

      if (estimatedStops >= this.STOP_CLUSTER_THRESHOLD && smallOrderCount >= 2) {
        const avgPrice = window.reduce((sum, l) => sum + l.price, 0) / windowSize
        const distanceFromPrice = Math.abs(avgPrice - currentPrice) / currentPrice * 100

        // Clusters closer to current price are more likely to be hunted
        const distanceConfidence = Math.max(0, 100 - distanceFromPrice * 10)
        const volumeConfidence = Math.min(100, (estimatedStops / this.STOP_CLUSTER_THRESHOLD) * 50)

        clusters.push({
          price: avgPrice,
          estimatedStops,
          totalVolume,
          side,
          confidence: Math.min(100, distanceConfidence + volumeConfidence),
          zoneWidth: (window[window.length - 1].price - window[0].price)
        })
      }
    }

    return clusters
  }

  private findRoundNumberClusters(currentPrice: number, orderBook: OrderBookData): StopCluster[] {
    const clusters: StopCluster[] = []
    const roundNumbers = this.generateRoundNumbers(currentPrice)

    for (const roundPrice of roundNumbers) {
      // Check bids near round number
      const nearBids = orderBook.bids.filter(
        b => Math.abs(b.price - roundPrice) / roundPrice < 0.002
      )
      // Check asks near round number
      const nearAsks = orderBook.asks.filter(
        a => Math.abs(a.price - roundPrice) / roundPrice < 0.002
      )

      const totalBidVolume = nearBids.reduce((s, l) => s + l.size, 0)
      const totalAskVolume = nearAsks.reduce((s, l) => s + l.size, 0)

      if (totalBidVolume > 5) {
        clusters.push({
          price: roundPrice,
          estimatedStops: Math.round(totalBidVolume / 0.01),
          totalVolume: totalBidVolume,
          side: "SELL",
          confidence: 70,
          zoneWidth: roundPrice * 0.002
        })
      }

      if (totalAskVolume > 5) {
        clusters.push({
          price: roundPrice,
          estimatedStops: Math.round(totalAskVolume / 0.01),
          totalVolume: totalAskVolume,
          side: "BUY",
          confidence: 70,
          zoneWidth: roundPrice * 0.002
        })
      }
    }

    return clusters
  }

  private generateRoundNumbers(currentPrice: number): number[] {
    const magnitude = Math.pow(10, Math.floor(Math.log10(currentPrice)))
    const normalized = currentPrice / magnitude
    const rounds: number[] = []

    // Generate round numbers at various levels
    const multipliers = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
    for (const m of multipliers) {
      const price = Math.round(currentPrice / (magnitude * m / 10)) * (magnitude * m / 10)
      if (price > 0 && Math.abs(price - currentPrice) / currentPrice < 0.1) {
        rounds.push(price)
      }
    }

    return [...new Set(rounds)].sort((a, b) => a - b)
  }

  // ============================================================
  // PHASE 2: Spoofing Detection
  // ============================================================

  /**
   * Detect spoofing - large orders that appear then vanish.
   * 
   * Spoofing pattern:
   * 1. Large order appears on one side (creates illusion of support/resistance)
   * 2. Price moves toward that level as traders react
   * 3. Order vanishes before it can be filled
   * 4. Price reverses sharply
   * 
   * When detected: Trade AGAINST the spoof direction.
   */
  detectSpoofing(orderBook: OrderBookData): SpoofingAlert[] {
    const alerts: SpoofingAlert[] = []
    const now = Date.now()

    // Check for large orders that are likely spoofs
    const suspiciousBids = this.findSuspiciousOrders(orderBook.bids, "BID")
    const suspiciousAsks = this.findSuspiciousOrders(orderBook.asks, "ASK")

    for (const order of [...suspiciousBids, ...suspiciousAsks]) {
      const key = `${order.side}_${order.price.toFixed(2)}`

      // Check if we've seen this order before
      const existing = this.spoofingCandidates.get(key)
      if (existing) {
        // If order is still there, it might be real - but if it vanishes next tick, it's a spoof
        existing.duration++
      } else {
        // New large order - track it
        this.spoofingCandidates.set(key, {
          price: order.price,
          size: order.size,
          side: order.side,
          duration: 1,
          confidence: 30, // Start low, increase if it vanishes
          detectedAt: now
        })
      }
    }

    // Check for orders that vanished (were in history but not in current snapshot)
    const currentKeys = new Set([
      ...orderBook.bids.map(b => `BID_${b.price.toFixed(2)}`),
      ...orderBook.asks.map(a => `ASK_${a.price.toFixed(2)}`)
    ])

    for (const [key, candidate] of this.spoofingCandidates) {
      if (!currentKeys.has(key) && candidate.duration < 5) {
        // Order vanished quickly = SPOOF
        const confidence = Math.min(95, 50 + candidate.duration * 10 + (candidate.size > 50 ? 20 : 0))
        alerts.push({
          ...candidate,
          confidence,
          detectedAt: now
        })
        this.spoofingCandidates.delete(key)
      }
    }

    // Clean up old candidates
    for (const [key, candidate] of this.spoofingCandidates) {
      if (now - candidate.detectedAt > 30000) {
        this.spoofingCandidates.delete(key)
      }
    }

    return alerts
  }

  private findSuspiciousOrders(
    levels: OrderBookLevel[],
    side: "BID" | "ASK"
  ): { price: number; size: number; side: "BID" | "ASK" }[] {
    const suspicious: { price: number; size: number; side: "BID" | "ASK" }[] = []
    const avgSize = levels.reduce((s, l) => s + l.size, 0) / Math.max(1, levels.length)

    for (const level of levels) {
      // Large order relative to average = suspicious
      if (level.size > avgSize * this.SPOOF_MIN_SIZE) {
        suspicious.push({ price: level.price, size: level.size, side })
      }
    }

    return suspicious
  }

  // ============================================================
  // PHASE 3: Dark Pool Inference
  // ============================================================

  /**
   * Infer dark pool activity from price/volume analysis.
   * 
   * When price moves significantly on LOW volume, it means:
   * - Hidden buying/selling is occurring off-exchange
   * - Smart money is accumulating/distributing without alerting the market
   * 
   * Flag these as "smart money accumulation/distribution" signals.
   */
  inferDarkPoolActivity(
    price: number,
    volume: number,
    historicalPrices: number[],
    historicalVolumes: number[]
  ): DarkPoolSignal | null {
    if (historicalPrices.length < 20 || historicalVolumes.length < 20) return null

    const recentPrices = historicalPrices.slice(-20)
    const recentVolumes = historicalVolumes.slice(-20)
    const avgVolume = recentVolumes.reduce((s, v) => s + v, 0) / recentVolumes.length
    const avgPrice = recentPrices.reduce((s, p) => s + p, 0) / recentPrices.length

    const priceChange = Math.abs(price - recentPrices[recentPrices.length - 2])
    const priceChangePercent = (priceChange / avgPrice) * 100
    const volumeRatio = volume / avgVolume

    // Low volume + significant price move = dark pool activity
    if (volumeRatio < 0.5 && priceChangePercent > 0.3) {
      const inferredSide = price > avgPrice ? "BUY" : "SELL"
      const confidence = Math.min(90, (0.5 / Math.max(0.1, volumeRatio)) * 30 + priceChangePercent * 20)

      return {
        price,
        volume,
        inferredSide,
        priceImpact: priceChangePercent,
        confidence,
        timestamp: Date.now()
      }
    }

    return null
  }

  // ============================================================
  // PHASE 4: Liquidity Sweep Detection
  // ============================================================

  /**
   * Detect liquidity sweeps - THE most important signal.
   * 
   * A liquidity sweep happens when:
   * 1. Price spikes through a known stop cluster level
   * 2. Stops get triggered, causing a cascade
   * 3. Price immediately reverses
   * 
   * This is THE signal to enter. Institutions:
   * - Hunt the stops (trigger the cascade)
   * - Take the opposite position
   * - Ride the reversal
   * 
   * We enter AFTER the hunt, on the reversal.
   */
  detectLiquiditySweep(
    currentPrice: number,
    historicalPrices: number[],
    stopClusters: StopCluster[]
  ): LiquiditySweep | null {
    if (historicalPrices.length < 10 || stopClusters.length === 0) return null

    const recentPrices = historicalPrices.slice(-20)
    const prevPrice = recentPrices[recentPrices.length - 2] || currentPrice
    const priceChange = currentPrice - prevPrice
    const priceChangePercent = Math.abs(priceChange) / prevPrice * 100

    // Need a sharp move to indicate a sweep
    if (priceChangePercent < 0.3) return null

    // Check if price swept through a stop cluster
    for (const cluster of stopClusters) {
      const sweptThrough =
        (cluster.side === "BUY" && currentPrice >= cluster.price && prevPrice < cluster.price) ||
        (cluster.side === "SELL" && currentPrice <= cluster.price && prevPrice > cluster.price)

      if (sweptThrough) {
        // Check for reversal (price moving back after sweep)
        const direction = priceChange > 0 ? "UP" : "DOWN"
        const reversalDirection = direction === "UP" ? "DOWN" : "UP"

        // Look for reversal confirmation in the last few candles
        const reversalConfirmed = this.confirmReversal(recentPrices, direction)

        return {
          sweepPrice: cluster.price,
          direction,
          volume: cluster.totalVolume,
          stopLossesTriggered: cluster.estimatedStops,
          reversalConfirmed,
          entryPrice: currentPrice,
          confidence: reversalConfirmed
            ? Math.min(95, cluster.confidence + 20)
            : Math.min(70, cluster.confidence),
          timestamp: Date.now()
        }
      }
    }

    return null
  }

  private confirmReversal(prices: number[], sweepDirection: "UP" | "DOWN"): boolean {
    if (prices.length < 5) return false

    const last3 = prices.slice(-3)
    const first3 = prices.slice(-6, -3)

    if (sweepDirection === "UP") {
      // Swept up, now moving down = reversal
      return last3[0] > last3[1] && last3[1] > last3[2]
    } else {
      // Swept down, now moving up = reversal
      return last3[0] < last3[1] && last3[1] < last3[2]
    }
  }

  // ============================================================
  // Main Analysis
  // ============================================================

  /**
   * Run full liquidity warfare analysis.
   * Combines all signals into a single actionable report.
   */
  analyze(
    currentPrice: number,
    orderBook: OrderBookData,
    historicalPrices: number[],
    historicalVolumes: number[]
  ): LiquidityWarfareReport {
    // Update history
    this.priceHistory = [...this.priceHistory, currentPrice].slice(-this.MAX_HISTORY)
    this.volumeHistory = [...this.volumeHistory, historicalVolumes[historicalVolumes.length - 1] || 0].slice(-this.MAX_HISTORY)
    this.orderBookHistory = [...this.orderBookHistory, orderBook].slice(-100)

    // Run all detectors
    const stopClusters = this.huntStopClusters(currentPrice, orderBook)
    const spoofingAlerts = this.detectSpoofing(orderBook)
    const darkPoolSignal = this.inferDarkPoolActivity(
      currentPrice,
      historicalVolumes[historicalVolumes.length - 1] || 0,
      historicalPrices,
      historicalVolumes
    )
    const liquiditySweep = this.detectLiquiditySweep(currentPrice, historicalPrices, stopClusters)

    // Combine signals
    const darkPoolSignals = darkPoolSignal ? [darkPoolSignal] : []

    // Determine overall signal
    let bullishScore = 0
    let bearishScore = 0

    // Stop clusters near price = potential sweep target
    const nearClusters = stopClusters.filter(c => c.confidence > 60)
    for (const cluster of nearClusters) {
      if (cluster.side === "BUY") bearishScore += cluster.confidence * 0.3 // Stops above = bearish pressure
      if (cluster.side === "SELL") bullishScore += cluster.confidence * 0.3 // Stops below = bullish pressure
    }

    // Spoofing: trade against it
    for (const spoof of spoofingAlerts) {
      if (spoof.side === "BID") bearishScore += spoof.confidence * 0.5 // Fake bid = real selling
      if (spoof.side === "ASK") bullishScore += spoof.confidence * 0.5 // Fake ask = real buying
    }

    // Dark pool: follow smart money
    for (const dp of darkPoolSignals) {
      if (dp.inferredSide === "BUY") bullishScore += dp.confidence * 0.4
      if (dp.inferredSide === "SELL") bearishScore += dp.confidence * 0.4
    }

    // Liquidity sweep: THE signal
    if (liquiditySweep) {
      if (liquiditySweep.reversalConfirmed) {
        if (liquiditySweep.direction === "UP") bearishScore += 80 // Swept up, reversal down = short
        if (liquiditySweep.direction === "DOWN") bullishScore += 80 // Swept down, reversal up = long
      }
    }

    const totalScore = bullishScore - bearishScore
    const signalStrength = Math.min(100, Math.abs(totalScore))

    let overallSignal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL"
    if (totalScore > 30) overallSignal = "BULLISH"
    else if (totalScore < -30) overallSignal = "BEARISH"

    return {
      stopClusters: stopClusters.slice(0, 10),
      spoofingAlerts: spoofingAlerts.slice(0, 5),
      darkPoolSignals: darkPoolSignals.slice(0, 3),
      liquiditySweeps: liquiditySweep ? [liquiditySweep] : [],
      overallSignal,
      signalStrength,
      timestamp: Date.now()
    }
  }

  /**
   * Get the most actionable trade signal from liquidity warfare analysis.
   */
  getTradeSignal(report: LiquidityWarfareReport): {
    action: "BUY" | "SELL" | "WAIT"
    confidence: number
    reason: string
    entryPrice?: number
  } {
    // Priority 1: Liquidity sweep with reversal confirmed = STRONGEST signal
    const confirmedSweep = report.liquiditySweeps.find(s => s.reversalConfirmed)
    if (confirmedSweep) {
      const action = confirmedSweep.direction === "UP" ? "SELL" : "BUY"
      return {
        action,
        confidence: confirmedSweep.confidence,
        reason: `Liquidity sweep detected! Price swept ${confirmedSweep.direction === "UP" ? "up through" : "down through"} ${confirmedSweep.sweepPrice}, triggering ~${confirmedSweep.stopLossesTriggered} stops. Reversal confirmed. Entering ${action} position.`,
        entryPrice: confirmedSweep.entryPrice
      }
    }

    // Priority 2: Spoofing detected = trade against it
    const highConfSpoof = report.spoofingAlerts.find(s => s.confidence > 70)
    if (highConfSpoof) {
      const action = highConfSpoof.side === "BID" ? "SELL" : "BUY"
      return {
        action,
        confidence: highConfSpoof.confidence,
        reason: `Spoofing detected! Fake ${highConfSpoof.side === "BID" ? "bid" : "ask"} wall at ${highConfSpoof.price} (${highConfSpoof.size} BTC). Trading against the spoof.`
      }
    }

    // Priority 3: Overall signal
    if (report.overallSignal !== "NEUTRAL" && report.signalStrength > 50) {
      return {
        action: report.overallSignal === "BULLISH" ? "BUY" : "SELL",
        confidence: report.signalStrength,
        reason: `Multiple factors align: ${report.stopClusters.length} stop clusters, ${report.spoofingAlerts.length} spoofing alerts, ${report.darkPoolSignals.length} dark pool signals. Overall ${report.overallSignal.toLowerCase()} bias.`
      }
    }

    return {
      action: "WAIT",
      confidence: 0,
      reason: "No high-confidence setup detected. Waiting for liquidity sweep or spoofing pattern."
    }
  }
}

// Singleton instance
export const liquidityWarfare = new LiquidityWarfareEngine()
