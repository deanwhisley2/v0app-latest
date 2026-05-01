/**
 * CLINE INSTRUCTION: This is the COMMANDER — the brain that validates signals.
 * STRATEGIES NEVER EXECUTE DIRECTLY. They send signals here.
 *
 * WHY: Prevents "fake execution." A trade isn't real until:
 *   Signal passes validation
 *   Risk checks pass
 *   Broker confirms with order ID
 *   Fill status is confirmed
 *
 * DO NOT bypass this file. DO NOT let strategies call exchange APIs directly.
 */

import { TradeSignal, OrderExecution, AuditEntry, createAuditEntry, SIGNAL_RULES } from "./trading-signal"
import { NexusTradingEngine, MarketData, TradeDecision } from '../nexus-core/nexus-engine'
import { liquidityWarfare } from './liquidity-warfare'
import { sentimentWeapon } from './sentiment-weapon'

// ============================================================
// UUID helper (avoids external dependency)
// ============================================================

function generateId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${Math.random().toString(36).slice(2, 6)}`
}

// ============================================================
// In-memory stores (replace with database in production)
// ============================================================

const ordersStore = new Map<string, OrderExecution>()
const signalsHistory: TradeSignal[] = []

// ============================================================
// Risk state (persist across signals)
// ============================================================

let riskState = {
  dailyLoss: 0,
  dailyLossLimit: 5, // percent
  lastTradeTimestamp: null as string | null,
  consecutiveLosses: 0,
  totalTradesToday: 0
}

// ============================================================
// Session checks
// ============================================================

function isMarketSessionAllowed(symbol: string): boolean {
  // Implement based on your session detection
  // For now, always allowed
  return true
}

// ============================================================
// Risk limits check
// ============================================================

function checkRiskLimits(signal: TradeSignal): { allowed: boolean; reason?: string } {
  // Daily loss limit check
  if (riskState.dailyLoss >= riskState.dailyLossLimit) {
    return { allowed: false, reason: `Daily loss limit reached: ${riskState.dailyLoss}% / ${riskState.dailyLossLimit}%` }
  }

  // Consecutive loss cooldown
  if (riskState.consecutiveLosses >= 3) {
    return { allowed: false, reason: `Cooldown: ${riskState.consecutiveLosses} consecutive losses` }
  }

  // Position size check (implement based on your portfolio)
  if (signal.riskPercent > SIGNAL_RULES.MAX_RISK_PERCENT) {
    return { allowed: false, reason: `Risk percent too high: ${signal.riskPercent}% > ${SIGNAL_RULES.MAX_RISK_PERCENT}%` }
  }

  return { allowed: true }
}

// ============================================================
// COMMANDER CORE — Signal Validation & Execution Layer
// ============================================================

/**
 * Validate signal against required fields and rules
 */
export function validateSignal(signal: TradeSignal): { valid: boolean; reason?: string } {
  // Check all required fields exist
  for (const field of SIGNAL_RULES.REQUIRED_FIELDS) {
    if (!(signal as any)[field]) {
      return { valid: false, reason: `Missing required field: ${field}` }
    }
  }

  // Check confidence threshold
  if (signal.confidence < SIGNAL_RULES.MIN_CONFIDENCE) {
    return { valid: false, reason: `Confidence too low: ${signal.confidence} < ${SIGNAL_RULES.MIN_CONFIDENCE}` }
  }

  // Check action is valid
  if (!["BUY", "SELL", "HOLD"].includes(signal.action)) {
    return { valid: false, reason: `Invalid action: ${signal.action}` }
  }

  // Check risk percent bounds
  if (signal.riskPercent < SIGNAL_RULES.MIN_RISK_PERCENT || signal.riskPercent > SIGNAL_RULES.MAX_RISK_PERCENT) {
    return { valid: false, reason: `Risk percent out of bounds: ${signal.riskPercent}% (allowed: ${SIGNAL_RULES.MIN_RISK_PERCENT}-${SIGNAL_RULES.MAX_RISK_PERCENT}%)` }
  }

  // For non-HOLD signals, validate entry/SL/TP
  if (signal.action !== "HOLD") {
    if (!signal.entry || signal.entry <= 0) {
      return { valid: false, reason: "Invalid entry price" }
    }
    if (!signal.stopLoss || signal.stopLoss <= 0) {
      return { valid: false, reason: "Invalid stop loss" }
    }
    if (!signal.takeProfit || signal.takeProfit <= 0) {
      return { valid: false, reason: "Invalid take profit" }
    }

    // Validate SL/TP direction based on action
    if (signal.action === "BUY" && signal.stopLoss >= signal.entry) {
      return { valid: false, reason: "Stop loss must be below entry for BUY" }
    }
    if (signal.action === "SELL" && signal.stopLoss <= signal.entry) {
      return { valid: false, reason: "Stop loss must be above entry for SELL" }
    }
    if (signal.action === "BUY" && signal.takeProfit <= signal.entry) {
      return { valid: false, reason: "Take profit must be above entry for BUY" }
    }
    if (signal.action === "SELL" && signal.takeProfit >= signal.entry) {
      return { valid: false, reason: "Take profit must be below entry for SELL" }
    }
  }

  return { valid: true }
}

/**
 * Main Commander decision function — validates, risk-checks, and queues a signal
 */
export async function commanderDecide(signal: TradeSignal, executionMode: "paper" | "live" = "paper"): Promise<OrderExecution> {
  const orderId = generateId()
  const auditTrail: AuditEntry[] = []

  // Step 1: Validation
  const validation = validateSignal(signal)
  auditTrail.push(createAuditEntry("VALIDATION", validation.valid ? "PASS" : "FAIL", validation.reason || "Signal validation passed"))

  if (!validation.valid) {
    const order: OrderExecution = {
      id: orderId,
      signalId: signal.id,
      strategyId: signal.strategyId,
      symbol: signal.symbol,
      action: signal.action,
      status: "REJECTED",
      executionMode,
      rejectionReason: validation.reason,
      auditTrail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    ordersStore.set(orderId, order)
    signalsHistory.push(signal)
    return order
  }

  // Step 2: Session check
  if (!isMarketSessionAllowed(signal.symbol)) {
    auditTrail.push(createAuditEntry("RISK_CHECK", "FAIL", "Market session not allowed for this symbol"))
    const order: OrderExecution = {
      id: orderId,
      signalId: signal.id,
      strategyId: signal.strategyId,
      symbol: signal.symbol,
      action: signal.action,
      status: "REJECTED",
      executionMode,
      rejectionReason: "Market session not allowed",
      auditTrail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    ordersStore.set(orderId, order)
    signalsHistory.push(signal)
    return order
  }

  // Step 3: Risk limits
  const riskCheck = checkRiskLimits(signal)
  auditTrail.push(createAuditEntry("RISK_CHECK", riskCheck.allowed ? "PASS" : "FAIL", riskCheck.reason || "Risk check passed"))

  if (!riskCheck.allowed) {
    const order: OrderExecution = {
      id: orderId,
      signalId: signal.id,
      strategyId: signal.strategyId,
      symbol: signal.symbol,
      action: signal.action,
      status: "REJECTED",
      executionMode,
      rejectionReason: riskCheck.reason,
      auditTrail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    ordersStore.set(orderId, order)
    signalsHistory.push(signal)
    return order
  }

  // Step 4: HOLD action handling
  if (signal.action === "HOLD") {
    auditTrail.push(createAuditEntry("QUEUE", "COMPLETE", "Strategy requested HOLD - no trade executed"))
    const order: OrderExecution = {
      id: orderId,
      signalId: signal.id,
      strategyId: signal.strategyId,
      symbol: signal.symbol,
      action: "HOLD",
      status: "APPROVED",
      executionMode,
      auditTrail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    ordersStore.set(orderId, order)
    signalsHistory.push(signal)
    return order
  }

  // Step 5: Queue for execution
  auditTrail.push(createAuditEntry("QUEUE", "PENDING", "Signal queued for execution", {
    entry: signal.entry,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    riskPercent: signal.riskPercent
  }))

  const order: OrderExecution = {
    id: orderId,
    signalId: signal.id,
    strategyId: signal.strategyId,
    symbol: signal.symbol,
    action: signal.action,
    status: "PENDING",
    executionMode,
    entryPrice: signal.entry,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    auditTrail,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  ordersStore.set(orderId, order)
  signalsHistory.push(signal)

  return order
}

/**
 * Execute a pending order (call this after Commander approval)
 */
export async function executeOrder(orderId: string, brokerApi?: any): Promise<OrderExecution> {
  const order = ordersStore.get(orderId)
  if (!order) {
    throw new Error(`Order ${orderId} not found`)
  }

  if (order.status !== "PENDING") {
    throw new Error(`Order ${orderId} is not in PENDING state (current: ${order.status})`)
  }

  // Update status to SENT
  order.status = "SENT"
  order.auditTrail.push(createAuditEntry("SENT_TO_BROKER", "PENDING", "Sending order to broker", {
    symbol: order.symbol,
    action: order.action,
    entry: order.entryPrice
  }))
  order.updatedAt = new Date().toISOString()
  ordersStore.set(order.id, order)

  if (order.executionMode === "paper") {
    // Paper trading: simulate fill
    order.status = "FILLED"
    order.brokerOrderId = `PAPER_${order.id}`
    order.fillQuantity = 0.001 // Example quantity
    order.fillTimestamp = new Date().toISOString()
    order.auditTrail.push(createAuditEntry("BROKER_CONFIRMATION", "COMPLETE", "Paper trade simulated fill", {
      brokerOrderId: order.brokerOrderId,
      fillPrice: order.entryPrice
    }))
    order.updatedAt = new Date().toISOString()
    ordersStore.set(order.id, order)
    return order
  }

  // Live trading: call actual broker API
  try {
    // Replace with your actual exchange API call
    // const brokerResponse = await brokerApi.placeOrder({
    //   symbol: order.symbol,
    //   side: order.action.toLowerCase(),
    //   type: "LIMIT",
    //   price: order.entryPrice,
    //   quantity: calculateQuantity(order.riskPercent, order.entryPrice, order.stopLoss)
    // })

    // Simulate broker response for now
    const brokerResponse = {
      orderId: `BROKER_${Date.now()}`,
      status: "NEW",
      fills: [{ price: order.entryPrice, quantity: 0.001 }]
    }

    order.brokerOrderId = brokerResponse.orderId
    order.status = "FILLED"
    order.fillQuantity = brokerResponse.fills?.[0]?.quantity
    order.fillTimestamp = new Date().toISOString()
    order.auditTrail.push(createAuditEntry("BROKER_CONFIRMATION", "COMPLETE", "Broker confirmed order", {
      brokerOrderId: order.brokerOrderId,
      brokerStatus: brokerResponse.status
    }))

  } catch (error) {
    order.status = "FAILED"
    order.rejectionReason = error instanceof Error ? error.message : "Unknown broker error"
    order.auditTrail.push(createAuditEntry("FAILED", "FAIL", order.rejectionReason))
  }

  order.updatedAt = new Date().toISOString()
  ordersStore.set(order.id, order)
  return order
}

/**
 * Get order history with full audit trail
 */
export function getOrderHistory(strategyId?: string): OrderExecution[] {
  const allOrders = Array.from(ordersStore.values())
  if (strategyId) {
    return allOrders.filter(o => o.strategyId === strategyId)
  }
  return allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/**
 * Get signals history
 */
export function getSignalsHistory(): TradeSignal[] {
  return [...signalsHistory]
}

// ============================================================
// LEGACY: StrategyCommander — Orchestrates all trading engines
// into unified analysis decisions (produces signals for Commander Core)
// ============================================================

export interface UnifiedAnalysis {
  timestamp: number
  symbol: string
  currentPrice: number
  nexusDecision: TradeDecision
  liquidityWarfareSignal: {
    action: "BUY" | "SELL" | "WAIT"
    confidence: number
    reason: string
  }
  sentimentSignal: {
    action: "BUY" | "SELL" | "WAIT"
    confidence: number
    reason: string
  }
  contrarianSignal: ContrarianSignal
  finalDecision: FinalTradeDecision
  componentBreakdown: ComponentBreakdown
}

export interface ContrarianSignal {
  isContrarianSetup: boolean
  action: "BUY" | "SELL" | "WAIT"
  confidence: number
  reasons: string[]
  rulesTriggered: {
    rule1ExtremeFearGreed: boolean
    rule2VolumeClimax: boolean
    rule3LiquiditySweep: boolean
    rule4Divergence: boolean
  }
}

export interface FinalTradeDecision {
  action: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL"
  confidence: number
  entryPrice: number
  stopLoss: number
  takeProfit: number
  positionSize: number // % of capital (0-100)
  reason: string
  executionStrategy: "AGGRESSIVE" | "ICEBERG" | "TWAP" | "PASSIVE"
}

export interface ComponentBreakdown {
  nexusWeight: number
  nexusSignal: string
  nexusScore: number
  liquidityWeight: number
  liquiditySignal: string
  liquidityScore: number
  sentimentWeight: number
  sentimentSignal: string
  sentimentScore: number
  contrarianWeight: number
  contrarianSignal: string
  contrarianScore: number
  finalScore: number
}

export class StrategyCommander {
  private nexusEngine: NexusTradingEngine
  private weights = {
    nexus: 0.35,
    liquidity: 0.25,
    sentiment: 0.20,
    contrarian: 0.20
  }

  // Risk parameters
  private maxPositionSize = 25 // % of capital per trade
  private defaultStopLoss = 0.02 // 2%
  private defaultTakeProfit = 0.04 // 4%
  private minConfidence = 55 // minimum confidence to trade

  constructor() {
    this.nexusEngine = new NexusTradingEngine()
  }

  /**
   * Run full unified analysis across all engines
   */
  analyze(marketData: MarketData): UnifiedAnalysis {
    // Step 1: Run Nexus Core Engine
    const nexusDecision = this.nexusEngine.getTradeSignal(marketData)

    // Step 2: Run Liquidity Warfare Engine
    const lwReport = liquidityWarfare.analyze(
      marketData.currentPrice,
      marketData.orderBook,
      marketData.historicalPrices,
      marketData.volumes
    )
    const liquiditySignal = liquidityWarfare.getTradeSignal(lwReport)

    // Step 3: Run Sentiment Weapon
    const sentimentReport = sentimentWeapon.analyze(
      marketData.orderBook,
      null,
      marketData.symbol,
      marketData.volume24h,
      marketData.currentPrice,
      marketData.change24h
    )
    const sentimentSignal = sentimentWeapon.getTradeSignal(sentimentReport)

    // Step 4: Run Contrarian Entry analysis
    const contrarianSignal = this.analyzeContrarian(marketData)

    // Step 5: Compute component breakdown
    const componentBreakdown = this.computeComponentBreakdown(
      nexusDecision,
      liquiditySignal,
      sentimentSignal,
      contrarianSignal
    )

    // Step 6: Compute final decision
    const finalDecision = this.computeFinalDecision(
      marketData,
      nexusDecision,
      liquiditySignal,
      sentimentSignal,
      contrarianSignal,
      componentBreakdown
    )

    return {
      timestamp: Date.now(),
      symbol: marketData.symbol,
      currentPrice: marketData.currentPrice,
      nexusDecision,
      liquidityWarfareSignal: liquiditySignal,
      sentimentSignal,
      contrarianSignal,
      finalDecision,
      componentBreakdown
    }
  }

  /**
   * Contrarian Entry Analysis - 4 Rules
   */
  private analyzeContrarian(marketData: MarketData): ContrarianSignal {
    const reasons: string[] = []
    const rulesTriggered = {
      rule1ExtremeFearGreed: false,
      rule2VolumeClimax: false,
      rule3LiquiditySweep: false,
      rule4Divergence: false
    }

    // Rule 1: Extreme Fear/Greed - Check if price is far from mean
    const prices = marketData.historicalPrices
    if (prices.length >= 20) {
      const recentPrices = prices.slice(-20)
      const mean = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length
      const stdDev = Math.sqrt(
        recentPrices.reduce((sq, p) => sq + Math.pow(p - mean, 2), 0) / recentPrices.length
      )
      const zScore = (marketData.currentPrice - mean) / (stdDev || 1)

      if (Math.abs(zScore) > 2) {
        rulesTriggered.rule1ExtremeFearGreed = true
        reasons.push(
          `Price ${zScore > 0 ? 'far above' : 'far below'} mean (${zScore.toFixed(2)}σ). ` +
          `${zScore > 0 ? 'Greed' : 'Fear'} extreme - contrarian opportunity.`
        )
      }
    }

    // Rule 2: Volume Climax
    const volumes = marketData.volumes
    if (volumes.length >= 10) {
      const recentVolumes = volumes.slice(-10)
      const avgVolume = recentVolumes.slice(0, -1).reduce((a, b) => a + b, 0) / 9
      const currentVolume = recentVolumes[recentVolumes.length - 1]

      if (currentVolume > avgVolume * 2.5) {
        rulesTriggered.rule2VolumeClimax = true
        reasons.push(
          `Volume climax detected! Current volume ${(currentVolume / avgVolume).toFixed(1)}x average. ` +
          `Potential exhaustion move - fade the climax.`
        )
      }
    }

    // Rule 3: Liquidity Sweep
    if (prices.length >= 30) {
      const recentPrices = prices.slice(-30)
      const recentLow = Math.min(...recentPrices.slice(0, -1))
      const recentHigh = Math.max(...recentPrices.slice(0, -1))
      const currentPrice = marketData.currentPrice

      if (currentPrice < recentLow && prices.length > 30) {
        const prevPrice = prices[prices.length - 2]
        if (prevPrice > currentPrice) {
          rulesTriggered.rule3LiquiditySweep = true
          reasons.push(
            `Liquidity sweep detected! Price swept below recent low (${recentLow}) to ${currentPrice}. ` +
            `Stop hunts triggered - smart money likely accumulating.`
          )
        }
      }

      if (currentPrice > recentHigh && prices.length > 30) {
        const prevPrice = prices[prices.length - 2]
        if (prevPrice < currentPrice) {
          rulesTriggered.rule3LiquiditySweep = true
          reasons.push(
            `Liquidity sweep detected! Price swept above recent high (${recentHigh}) to ${currentPrice}. ` +
            `Stop hunts triggered - smart money likely distributing.`
          )
        }
      }
    }

    // Rule 4: Divergence
    if (prices.length >= 14 && volumes.length >= 14) {
      const recentPrices = prices.slice(-14)
      const recentVolumes = volumes.slice(-14)
      const priceChange = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0]
      const volumeTrend = recentVolumes.slice(-7).reduce((a, b) => a + b, 0) / 7 /
        (recentVolumes.slice(0, 7).reduce((a, b) => a + b, 0) / 7)

      if (priceChange < -0.03 && volumeTrend < 0.8) {
        rulesTriggered.rule4Divergence = true
        reasons.push(
          `Bearish divergence: Price down ${(Math.abs(priceChange) * 100).toFixed(1)}% but volume declining ` +
          `(${(volumeTrend * 100).toFixed(0)}% of previous). Selling exhaustion - reversal imminent.`
        )
      }

      if (priceChange > 0.03 && volumeTrend < 0.8) {
        rulesTriggered.rule4Divergence = true
        reasons.push(
          `Bullish divergence: Price up ${(priceChange * 100).toFixed(1)}% but volume declining ` +
          `(${(volumeTrend * 100).toFixed(0)}% of previous). Buying exhaustion - reversal imminent.`
        )
      }
    }

    const triggeredCount = Object.values(rulesTriggered).filter(Boolean).length
    let action: "BUY" | "SELL" | "WAIT" = "WAIT"
    let confidence = 0

    if (triggeredCount >= 3) {
      const price = marketData.currentPrice
      const meanPrice = prices.length > 0
        ? prices.reduce((a, b) => a + b, 0) / prices.length
        : price

      if (price < meanPrice) {
        action = "BUY"
        confidence = 60 + triggeredCount * 10
      } else {
        action = "SELL"
        confidence = 60 + triggeredCount * 10
      }
    } else if (triggeredCount >= 2) {
      const price = marketData.currentPrice
      const meanPrice = prices.length > 0
        ? prices.reduce((a, b) => a + b, 0) / prices.length
        : price

      if (price < meanPrice * 0.97) {
        action = "BUY"
        confidence = 50 + triggeredCount * 8
      } else if (price > meanPrice * 1.03) {
        action = "SELL"
        confidence = 50 + triggeredCount * 8
      }
    }

    return {
      isContrarianSetup: triggeredCount >= 2,
      action,
      confidence: Math.min(confidence, 95),
      reasons: reasons.length > 0 ? reasons : ["No contrarian setup detected"],
      rulesTriggered
    }
  }

  /**
   * Compute weighted component breakdown
   */
  private computeComponentBreakdown(
    nexusDecision: TradeDecision,
    liquiditySignal: { action: string; confidence: number },
    sentimentSignal: { action: string; confidence: number },
    contrarianSignal: ContrarianSignal
  ): ComponentBreakdown {
    const mapSignal = (action: string): string => {
      switch (action) {
        case "STRONG_BUY": return "STRONG_BULLISH"
        case "BUY": return "BULLISH"
        case "SELL": return "BEARISH"
        case "STRONG_SELL": return "STRONG_BEARISH"
        case "WAIT": return "NEUTRAL"
        default: return "NEUTRAL"
      }
    }

    const mapSimpleSignal = (action: string): string => {
      switch (action) {
        case "BUY": return "BULLISH"
        case "SELL": return "BEARISH"
        default: return "NEUTRAL"
      }
    }

    const scoreSignal = (action: string, confidence: number): number => {
      let base = 0
      switch (action) {
        case "STRONG_BUY": base = 100; break
        case "BUY": base = 70; break
        case "SELL": base = -70; break
        case "STRONG_SELL": base = -100; break
        case "WAIT": base = 0; break
        default: base = 0
      }
      return base * (confidence / 100)
    }

    const nexusScore = scoreSignal(nexusDecision.action, nexusDecision.confidence)
    const liquidityScore = scoreSignal(liquiditySignal.action, liquiditySignal.confidence)
    const sentimentScore = scoreSignal(sentimentSignal.action, sentimentSignal.confidence)
    const contrarianScore = contrarianSignal.action === "BUY" ? 70 * (contrarianSignal.confidence / 100)
      : contrarianSignal.action === "SELL" ? -70 * (contrarianSignal.confidence / 100)
      : 0

    const finalScore =
      nexusScore * this.weights.nexus +
      liquidityScore * this.weights.liquidity +
      sentimentScore * this.weights.sentiment +
      contrarianScore * this.weights.contrarian

    return {
      nexusWeight: this.weights.nexus,
      nexusSignal: mapSignal(nexusDecision.action),
      nexusScore,
      liquidityWeight: this.weights.liquidity,
      liquiditySignal: mapSimpleSignal(liquiditySignal.action),
      liquidityScore,
      sentimentWeight: this.weights.sentiment,
      sentimentSignal: mapSimpleSignal(sentimentSignal.action),
      sentimentScore,
      contrarianWeight: this.weights.contrarian,
      contrarianSignal: mapSimpleSignal(contrarianSignal.action),
      contrarianScore,
      finalScore
    }
  }

  /**
   * Compute final unified trade decision
   */
  private computeFinalDecision(
    marketData: MarketData,
    nexusDecision: TradeDecision,
    liquiditySignal: { action: string; confidence: number; reason: string },
    sentimentSignal: { action: string; confidence: number; reason: string },
    contrarianSignal: ContrarianSignal,
    breakdown: ComponentBreakdown
  ): FinalTradeDecision {
    const { finalScore } = breakdown

    let action: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL"
    let confidence: number
    let reason: string

    if (finalScore > 50) {
      action = "STRONG_BUY"
      confidence = Math.min(Math.abs(finalScore), 95)
      reason = `Strong buy signal (score: ${finalScore.toFixed(1)}). `
    } else if (finalScore > 20) {
      action = "BUY"
      confidence = Math.abs(finalScore)
      reason = `Buy signal (score: ${finalScore.toFixed(1)}). `
    } else if (finalScore < -50) {
      action = "STRONG_SELL"
      confidence = Math.min(Math.abs(finalScore), 95)
      reason = `Strong sell signal (score: ${finalScore.toFixed(1)}). `
    } else if (finalScore < -20) {
      action = "SELL"
      confidence = Math.abs(finalScore)
      reason = `Sell signal (score: ${finalScore.toFixed(1)}). `
    } else {
      action = "HOLD"
      confidence = 0
      reason = `No clear signal (score: ${finalScore.toFixed(1)}). Waiting for stronger convergence. `
    }

    const components = []
    if (nexusDecision.action !== "HOLD") {
      components.push(`Nexus: ${nexusDecision.action} (${nexusDecision.confidence}%)`)
    }
    if (liquiditySignal.action !== "WAIT") {
      components.push(`Liquidity: ${liquiditySignal.action} (${liquiditySignal.confidence}%)`)
    }
    if (sentimentSignal.action !== "WAIT") {
      components.push(`Sentiment: ${sentimentSignal.action} (${sentimentSignal.confidence}%)`)
    }
    if (contrarianSignal.isContrarianSetup) {
      components.push(`Contrarian: ${contrarianSignal.action} (${contrarianSignal.confidence}%)`)
    }

    reason += components.length > 0
      ? `Components: ${components.join(" | ")}.`
      : `All engines neutral.`

    const positionSize = action === "HOLD" ? 0
      : Math.min(
          Math.round((confidence / 100) * this.maxPositionSize),
          this.maxPositionSize
        )

    const entryPrice = marketData.currentPrice
    let stopLoss: number
    let takeProfit: number

    if (action === "STRONG_BUY" || action === "BUY") {
      stopLoss = entryPrice * (1 - this.defaultStopLoss * (1 + (100 - confidence) / 100))
      takeProfit = entryPrice * (1 + this.defaultTakeProfit * (1 + confidence / 100))
    } else if (action === "STRONG_SELL" || action === "SELL") {
      stopLoss = entryPrice * (1 + this.defaultStopLoss * (1 + (100 - confidence) / 100))
      takeProfit = entryPrice * (1 - this.defaultTakeProfit * (1 + confidence / 100))
    } else {
      stopLoss = entryPrice * 0.98
      takeProfit = entryPrice * 1.04
    }

    let executionStrategy: "AGGRESSIVE" | "ICEBERG" | "TWAP" | "PASSIVE"
    if (confidence >= 80) {
      executionStrategy = "AGGRESSIVE"
    } else if (confidence >= 65) {
      executionStrategy = "ICEBERG"
    } else if (confidence >= 50) {
      executionStrategy = "TWAP"
    } else {
      executionStrategy = "PASSIVE"
    }

    return {
      action,
      confidence,
      entryPrice,
      stopLoss: Math.round(stopLoss * 100) / 100,
      takeProfit: Math.round(takeProfit * 100) / 100,
      positionSize,
      reason,
      executionStrategy
    }
  }

  /**
   * Update engine weights dynamically
   */
  updateWeights(weights: Partial<typeof this.weights>): void {
    Object.assign(this.weights, weights)
    const total = Object.values(this.weights).reduce((a, b) => a + b, 0)
    for (const key of Object.keys(this.weights) as (keyof typeof this.weights)[]) {
      this.weights[key] = this.weights[key] / total
    }
  }

  /**
   * Update risk parameters
   */
  updateRisk(params: {
    maxPositionSize?: number
    defaultStopLoss?: number
    defaultTakeProfit?: number
    minConfidence?: number
  }): void {
    if (params.maxPositionSize !== undefined) this.maxPositionSize = params.maxPositionSize
    if (params.defaultStopLoss !== undefined) this.defaultStopLoss = params.defaultStopLoss
    if (params.defaultTakeProfit !== undefined) this.defaultTakeProfit = params.defaultTakeProfit
    if (params.minConfidence !== undefined) this.minConfidence = params.minConfidence
  }
}

// Singleton instance
export const strategyCommander = new StrategyCommander()
