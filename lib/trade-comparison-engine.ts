"use client"

/**
 * TRADE COMPARISON ENGINE
 * 
 * Live battlefield feedback system that compares:
 * 1. Binance WebSocket signals (what the market is doing)
 * 2. AI trade decisions (what our engine decided)
 * 3. Actual execution outcomes (what happened after)
 * 
 * Architecture:
 *   Binance WebSocket ──► Signal Capture Module ──► AI Trade Decision ──► Execution Engine ──► Trade Log
 *                                                                                              │
 *   Binance Signal Log ◄───────────────────────────────────────────────────────────────────────┤
 *                                                                                              │
 *   Comparator Engine ◄────────────────────────────────────────────────────────────────────────┤
 *        │
 *        └──► Report: Latency + Accuracy
 * 
 * Key metrics exposed:
 *   - Latency > 500ms → you're chasing price, not leading it
 *   - Direction mismatch > 30% → your signal logic is broken
 *   - Post-trade price consistently reverses → you're buying tops / selling bottoms
 */

import { type TradeAction } from "./enhanced-trading-engine"
import { PreTradeValidator, type TradeRequest } from "./pre-trade-validator"
import { GuardrailEngine, type ExecutionContext } from "./guardrail-engine"
import { StrategyLearner, type TradeResult } from "./strategy-learner"
import { SafetyNotifier } from "./safety-notifier"
import { FeeOptimizer } from "./fee-optimizer"

// ============================================================
// Types
// ============================================================

/**
 * Raw signal captured from Binance WebSocket at a moment in time
 */
export interface BinanceSignalSnapshot {
  timestamp_ms: number
  symbol: string
  price: number
  signal: "bullish" | "bearish" | "neutral"
  rsi: number
  volume_24h: number
  bid_ask_spread: number
}

/**
 * AI trade decision record with execution details
 */
export interface TradeExecutionRecord {
  trade_id: string
  execution_timestamp_ms: number
  symbol: string
  action: "buy" | "sell"
  quantity: number
  executed_price: number
  binance_signal_at_moment: {
    timestamp_ms: number
    signal: "bullish" | "bearish" | "neutral"
  }
  latency_ms: number
  direction_match: boolean
}

/**
 * Post-trade outcome evaluation
 */
export interface TradeOutcome {
  trade_id: string
  price_1min_later: number
  price_5min_later: number
  pnl_1min: number
  pnl_5min: number
  was_correct: boolean
}

/**
 * Full comparison report for a single trade
 */
export interface TradeComparisonReport {
  trace_id: string
  timestamp: string
  symbol: string
  ai_execution_time: string
  binance_signal_time: string
  latency_ms: number
  signal_at_moment: {
    direction: string
    rsi: number
    volume_context: string
  }
  ai_action: string
  direction_match: boolean
  post_trade: {
    price_change_1min: string
    price_change_5min: string
    result_1min: "PROFIT" | "LOSS" | "FLAT"
    result_5min: "PROFIT" | "LOSS" | "FLAT"
  }
  verdict: string
}

/**
 * Aggregated statistics across multiple trades
 */
export interface ComparisonStatistics {
  total_trades: number
  avg_latency_ms: number
  max_latency_ms: number
  min_latency_ms: number
  direction_match_rate: number
  accuracy_1min: number
  accuracy_5min: number
  avg_pnl_1min: number
  avg_pnl_5min: number
  total_pnl_1min: number
  total_pnl_5min: number
  warnings: string[]
}

// ============================================================
// Signal Capture Module
// ============================================================

/**
 * Captures and logs Binance WebSocket signals.
 * In production, this connects to wss://stream.binance.com:9443/ws/btcusdt@ticker
 * For testing, it generates realistic simulated signals.
 */
export class SignalCaptureModule {
  private signalLog: BinanceSignalSnapshot[] = []
  private readonly MAX_LOG_SIZE = 10000
  private ws: WebSocket | null = null
  private symbol: string
  private onSignal: ((signal: BinanceSignalSnapshot) => void) | null = null

  constructor(symbol: string = "BTCUSDT") {
    this.symbol = symbol
  }

  /**
   * Start capturing live signals from Binance WebSocket
   */
  startLiveCapture(onSignal?: (signal: BinanceSignalSnapshot) => void): void {
    this.onSignal = onSignal || null
    const wsSymbol = this.symbol.toLowerCase()

    try {
      // Connect to Binance 24hr ticker stream (updates every ~1 second)
      this.ws = new WebSocket(`wss://stream.binance.com:9443/ws/${wsSymbol}@ticker`)

      this.ws.onopen = () => {
        console.log(`[SignalCapture] WebSocket connected for ${this.symbol}`)
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const signal = this.parseTickerData(data)
          this.recordSignal(signal)
        } catch {
          // Ignore parse errors
        }
      }

      this.ws.onerror = () => {
        // Will reconnect
      }

      this.ws.onclose = () => {
        // Reconnect after 2 seconds
        setTimeout(() => this.startLiveCapture(onSignal), 2000)
      }
    } catch {
      console.warn("[SignalCapture] WebSocket not available, using simulated data")
    }
  }

  /**
   * Stop live capture
   */
  stopLiveCapture(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * Parse Binance 24hr ticker data into our signal format
   */
  private parseTickerData(data: any): BinanceSignalSnapshot {
    const price = parseFloat(data.c) // Current price
    const open = parseFloat(data.o) // Open price 24h ago
    const high = parseFloat(data.h) // High price 24h
    const low = parseFloat(data.l) // Low price 24h
    const volume = parseFloat(data.v) // Volume
    const quoteVolume = parseFloat(data.q) // Quote volume
    const priceChange = parseFloat(data.p) // Price change
    const bidPrice = parseFloat(data.b) // Best bid
    const askPrice = parseFloat(data.a) // Best ask

    // Calculate RSI-like metric from price change velocity
    const changePercent = (priceChange / open) * 100
    const rsi = this.calculateSimulatedRSI(changePercent)

    // Determine signal direction
    let signal: "bullish" | "bearish" | "neutral"
    if (changePercent > 0.5 && rsi > 60) signal = "bullish"
    else if (changePercent < -0.5 && rsi < 40) signal = "bearish"
    else signal = "neutral"

    const bidAskSpread = askPrice > 0 ? ((askPrice - bidPrice) / askPrice) * 100 : 0

    return {
      timestamp_ms: data.E || Date.now(),
      symbol: data.s || this.symbol,
      price,
      signal,
      rsi: Math.round(rsi * 10) / 10,
      volume_24h: quoteVolume || volume,
      bid_ask_spread: Math.round(bidAskSpread * 10000) / 10000,
    }
  }

  /**
   * Simulate RSI from price change percentage
   */
  private calculateSimulatedRSI(changePercent: number): number {
    // Map price change to RSI (0-100 scale)
    // -5% change → RSI ~15, 0% → RSI ~50, +5% → RSI ~85
    const normalized = (changePercent / 5) * 35 + 50
    return Math.max(5, Math.min(95, normalized))
  }

  /**
   * Generate a simulated signal (for testing without WebSocket)
   */
  generateSimulatedSignal(price: number): BinanceSignalSnapshot {
    const now = Date.now()
    const rsi = 30 + Math.random() * 40 // 30-70 range
    const volumeBase = 10000000000 + Math.random() * 5000000000

    let signal: "bullish" | "bearish" | "neutral"
    if (rsi > 60) signal = "bullish"
    else if (rsi < 40) signal = "bearish"
    else signal = "neutral"

    return {
      timestamp_ms: now,
      symbol: this.symbol,
      price,
      signal,
      rsi: Math.round(rsi * 10) / 10,
      volume_24h: volumeBase,
      bid_ask_spread: Math.round((0.01 + Math.random() * 0.1) * 10000) / 10000,
    }
  }

  /**
   * Record a signal to the log
   */
  recordSignal(signal: BinanceSignalSnapshot): void {
    this.signalLog.push(signal)
    if (this.signalLog.length > this.MAX_LOG_SIZE) {
      this.signalLog.shift()
    }
    if (this.onSignal) {
      this.onSignal(signal)
    }
  }

  /**
   * Get the most recent signal for a given symbol
   */
  getLatestSignal(): BinanceSignalSnapshot | null {
    return this.signalLog.length > 0
      ? this.signalLog[this.signalLog.length - 1]
      : null
  }

  /**
   * Get the signal that was active at a specific timestamp
   */
  getSignalAt(timestamp_ms: number): BinanceSignalSnapshot | null {
    // Find the closest signal before or at the given timestamp
    for (let i = this.signalLog.length - 1; i >= 0; i--) {
      if (this.signalLog[i].timestamp_ms <= timestamp_ms) {
        return this.signalLog[i]
      }
    }
    return null
  }

  /**
   * Get all signals in a time range
   */
  getSignalsInRange(from_ms: number, to_ms: number): BinanceSignalSnapshot[] {
    return this.signalLog.filter(
      (s) => s.timestamp_ms >= from_ms && s.timestamp_ms <= to_ms
    )
  }

  /**
   * Export signal log
   */
  getSignalLog(): BinanceSignalSnapshot[] {
    return [...this.signalLog]
  }

  /**
   * Clear signal log
   */
  clearSignalLog(): void {
    this.signalLog.length = 0
  }
}

// ============================================================
// Execution Engine
// ============================================================

/**
 * Simulates trade execution and records the full lifecycle:
 * 1. Captures the Binance signal at decision moment
 * 2. Records the AI's decision
 * 3. Simulates execution with realistic latency
 * 4. Evaluates post-trade outcome after 1min and 5min
 */
export class ExecutionEngine {
  private tradeLog: TradeExecutionRecord[] = []
  private outcomeLog: TradeOutcome[] = []
  private readonly MAX_LOG_SIZE = 5000
  private tradeCounter: number = 0
  private signalCapture: SignalCaptureModule

  constructor(signalCapture: SignalCaptureModule) {
    this.signalCapture = signalCapture
  }

  /**
   * Execute a trade decision and record everything.
   * 
   * @param symbol - Trading pair (e.g., "BTCUSDT")
   * @param action - AI decision: "buy" or "sell"
   * @param quantity - Amount to trade
   * @param currentPrice - Price at execution
   * @param simulatedLatency - Optional override for latency simulation
   * @returns The trade execution record
   */
  executeTrade(
    symbol: string,
    action: "buy" | "sell",
    quantity: number,
    currentPrice: number,
    simulatedLatency?: number
  ): TradeExecutionRecord {
    const now = Date.now()
    this.tradeCounter++

    // Capture the Binance signal at this exact moment
    const signal = this.signalCapture.getLatestSignal() ||
      this.signalCapture.generateSimulatedSignal(currentPrice)

    // Calculate latency: time between signal timestamp and execution
    const latency_ms = simulatedLatency ?? (now - signal.timestamp_ms)

    // Determine if AI direction matches Binance signal
    const directionMatch = this.checkDirectionMatch(action, signal.signal)

    const trade: TradeExecutionRecord = {
      trade_id: `tx_${now}_${this.tradeCounter}`,
      execution_timestamp_ms: now,
      symbol,
      action,
      quantity,
      executed_price: currentPrice,
      binance_signal_at_moment: {
        timestamp_ms: signal.timestamp_ms,
        signal: signal.signal,
      },
      latency_ms: Math.max(0, latency_ms),
      direction_match: directionMatch,
    }

    this.tradeLog.push(trade)
    if (this.tradeLog.length > this.MAX_LOG_SIZE) {
      this.tradeLog.shift()
    }

    return trade
  }

  /**
   * Evaluate trade outcome after price movement.
   * Call this 1 minute and 5 minutes after execution.
   */
  evaluateOutcome(
    tradeId: string,
    price1minLater: number,
    price5minLater: number
  ): TradeOutcome {
    const trade = this.tradeLog.find((t) => t.trade_id === tradeId)
    if (!trade) {
      throw new Error(`Trade ${tradeId} not found in log`)
    }

    const entryPrice = trade.executed_price
    const isBuy = trade.action === "buy"

    // Calculate PnL
    const pnl_1min = isBuy
      ? price1minLater - entryPrice
      : entryPrice - price1minLater
    const pnl_5min = isBuy
      ? price5minLater - entryPrice
      : entryPrice - price5minLater

    // Determine if the trade was correct (profitable)
    const was_correct = pnl_5min > 0

    const outcome: TradeOutcome = {
      trade_id: tradeId,
      price_1min_later: price1minLater,
      price_5min_later: price5minLater,
      pnl_1min: Math.round(pnl_1min * 100) / 100,
      pnl_5min: Math.round(pnl_5min * 100) / 100,
      was_correct,
    }

    this.outcomeLog.push(outcome)
    if (this.outcomeLog.length > this.MAX_LOG_SIZE) {
      this.outcomeLog.shift()
    }

    return outcome
  }

  /**
   * Check if AI action matches Binance signal direction
   */
  private checkDirectionMatch(
    action: "buy" | "sell",
    signal: "bullish" | "bearish" | "neutral"
  ): boolean {
    if (signal === "neutral") return true // Neutral is always a match
    if (action === "buy" && signal === "bullish") return true
    if (action === "sell" && signal === "bearish") return true
    return false
  }

  /**
   * Get all trade records
   */
  getTradeLog(): TradeExecutionRecord[] {
    return [...this.tradeLog]
  }

  /**
   * Get all outcome records
   */
  getOutcomeLog(): TradeOutcome[] {
    return [...this.outcomeLog]
  }

  /**
   * Get a specific trade by ID
   */
  getTrade(tradeId: string): TradeExecutionRecord | undefined {
    return this.tradeLog.find((t) => t.trade_id === tradeId)
  }

  /**
   * Get outcome for a specific trade
   */
  getOutcome(tradeId: string): TradeOutcome | undefined {
    return this.outcomeLog.find((o) => o.trade_id === tradeId)
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.tradeLog.length = 0
    this.outcomeLog.length = 0
    this.tradeCounter = 0
  }
}

// ============================================================
// Comparator Engine
// ============================================================

/**
 * Compares AI trade decisions against actual market outcomes.
 * Generates actionable insights about:
 * - Latency (are we chasing price?)
 * - Direction accuracy (is signal logic correct?)
 * - Post-trade price action (are we buying tops / selling bottoms?)
 */
export class ComparatorEngine {
  private executionEngine: ExecutionEngine

  constructor(executionEngine: ExecutionEngine) {
    this.executionEngine = executionEngine
  }

  /**
   * Generate a full comparison report for a single trade
   */
  generateReport(tradeId: string): TradeComparisonReport | null {
    const trade = this.executionEngine.getTrade(tradeId)
    const outcome = this.executionEngine.getOutcome(tradeId)

    if (!trade) return null

    const signal = trade.binance_signal_at_moment
    const now = new Date(trade.execution_timestamp_ms)
    const signalTime = new Date(signal.timestamp_ms)

    // Format times
    const timeStr = now.toTimeString().split(" ")[0] // HH:MM:SS
    const signalTimeStr = signalTime.toTimeString().split(" ")[0]

    // Generate trace ID
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "")
    const randomSuffix = Math.random().toString(36).substring(2, 7)
    const traceId = `${randomSuffix}_${dateStr}_${timeStr.replace(/:/g, "")}`

    // Volume context
    const volumeContext = this.getVolumeContext(trade.executed_price)

    // Post-trade analysis
    let priceChange1min = "N/A"
    let priceChange5min = "N/A"
    let result1min: "PROFIT" | "LOSS" | "FLAT" = "FLAT"
    let result5min: "PROFIT" | "LOSS" | "FLAT" = "FLAT"

    if (outcome) {
      const change1min =
        ((outcome.price_1min_later - trade.executed_price) / trade.executed_price) *
        100
      const change5min =
        ((outcome.price_5min_later - trade.executed_price) / trade.executed_price) *
        100

      priceChange1min = `${change1min >= 0 ? "+" : ""}${change1min.toFixed(2)}%`
      priceChange5min = `${change5min >= 0 ? "+" : ""}${change5min.toFixed(2)}%`

      result1min = outcome.pnl_1min > 0 ? "PROFIT" : outcome.pnl_1min < 0 ? "LOSS" : "FLAT"
      result5min = outcome.pnl_5min > 0 ? "PROFIT" : outcome.pnl_5min < 0 ? "LOSS" : "FLAT"
    }

    // Generate verdict
    const verdict = this.generateVerdict(
      trade.latency_ms,
      trade.direction_match,
      outcome
    )

    return {
      trace_id: traceId,
      timestamp: now.toISOString(),
      symbol: trade.symbol,
      ai_execution_time: timeStr,
      binance_signal_time: signalTimeStr,
      latency_ms: trade.latency_ms,
      signal_at_moment: {
        direction: signal.signal.toUpperCase(),
        rsi: this.getSignalRSI(trade.execution_timestamp_ms),
        volume_context: volumeContext,
      },
      ai_action: trade.action.toUpperCase(),
      direction_match: trade.direction_match,
      post_trade: {
        price_change_1min: priceChange1min,
        price_change_5min: priceChange5min,
        result_1min: result1min,
        result_5min: result5min,
      },
      verdict,
    }
  }

  /**
   * Get RSI from the signal at execution time
   */
  private getSignalRSI(timestamp_ms: number): number {
    // In a real implementation, this would look up the actual RSI from the signal log
    // For now, return a simulated value
    return Math.round((30 + Math.random() * 40) * 10) / 10
  }

  /**
   * Generate volume context string
   */
  private getVolumeContext(price: number): string {
    // Simulated volume comparison against average
    const volumeRatio = 0.8 + Math.random() * 0.6 // 0.8x to 1.4x
    if (volumeRatio > 1.2) return `+${Math.round((volumeRatio - 1) * 100)}% above avg`
    if (volumeRatio < 0.9) return `-${Math.round((1 - volumeRatio) * 100)}% below avg`
    return "normal"
  }

  /**
   * Generate a human-readable verdict
   */
  private generateVerdict(
    latencyMs: number,
    directionMatch: boolean,
    outcome: TradeOutcome | undefined
  ): string {
    const parts: string[] = []

    // Latency assessment
    if (latencyMs > 500) {
      parts.push(`High latency (${latencyMs}ms) — you're chasing price, not leading it`)
    } else if (latencyMs > 200) {
      parts.push(`Moderate latency (${latencyMs}ms) — acceptable but could be faster`)
    } else {
      parts.push(`Low latency (${latencyMs}ms) — excellent execution speed`)
    }

    // Direction match
    if (!directionMatch) {
      parts.push("Direction MISMATCH — AI went against Binance signal")
    } else {
      parts.push("Direction matched Binance signal")
    }

    // Outcome
    if (outcome) {
      if (outcome.was_correct) {
        parts.push("Trade was PROFITABLE — signal followed correctly")
      } else {
        parts.push("Trade was a LOSS — review signal logic")
      }

      // Check for reversal pattern (buying tops / selling bottoms)
      const entryPrice = this.getEntryPrice(outcome.trade_id)
      if (entryPrice !== null) {
        const priceNow = outcome.price_5min_later
        const movedAgainst =
          (outcome.pnl_5min < 0 && Math.abs(outcome.pnl_5min) > Math.abs(outcome.pnl_1min))

        if (movedAgainst) {
          parts.push("⚠️ Price consistently reversed — you may be buying tops / selling bottoms")
        }
      }
    }

    return parts.join(". ") + "."
  }

  /**
   * Get entry price for a trade
   */
  private getEntryPrice(tradeId: string): number | null {
    const trade = this.executionEngine.getTrade(tradeId)
    return trade?.executed_price ?? null
  }

  /**
   * Generate a formatted text report (like the sample in the spec)
   */
  generateTextReport(tradeId: string): string {
    const report = this.generateReport(tradeId)
    if (!report) return `Trade ${tradeId} not found`

    const lines = [
      `TRACE ID: ${report.trace_id}`,
      `================================`,
      `SYMBOL: ${report.symbol}`,
      `AI EXECUTION: ${report.ai_execution_time}`,
      `BINANCE SIGNAL: ${report.binance_signal_time}`,
      `LATENCY: ${report.latency_ms}ms`,
      ``,
      `SIGNAL AT MOMENT:`,
      `  - Direction: ${report.signal_at_moment.direction}`,
      `  - RSI: ${report.signal_at_moment.rsi}`,
      `  - Volume: ${report.signal_at_moment.volume_context}`,
      ``,
      `AI ACTION: ${report.ai_action}`,
      `DIRECTION MATCH: ${report.direction_match ? "✅ YES" : "❌ NO"}`,
      ``,
      `1 MIN LATER (${this.addMinutes(report.timestamp, 1)}):`,
      `  - Price: ${report.post_trade.price_change_1min}`,
      `  - Result: ${report.post_trade.result_1min}`,
      ``,
      `5 MIN LATER (${this.addMinutes(report.timestamp, 5)}):`,
      `  - Price: ${report.post_trade.price_change_5min}`,
      `  - Result: ${report.post_trade.result_5min}`,
      ``,
      `VERDICT: ${report.verdict}`,
    ]

    return lines.join("\n")
  }

  /**
   * Format a timestamp + minutes offset
   */
  private addMinutes(isoTimestamp: string, minutes: number): string {
    const date = new Date(isoTimestamp)
    date.setMinutes(date.getMinutes() + minutes)
    return date.toTimeString().split(" ")[0]
  }

  /**
   * Calculate aggregate statistics across all trades
   */
  calculateStatistics(): ComparisonStatistics {
    const trades = this.executionEngine.getTradeLog()
    const outcomes = this.executionEngine.getOutcomeLog()

    if (trades.length === 0) {
      return {
        total_trades: 0,
        avg_latency_ms: 0,
        max_latency_ms: 0,
        min_latency_ms: 0,
        direction_match_rate: 0,
        accuracy_1min: 0,
        accuracy_5min: 0,
        avg_pnl_1min: 0,
        avg_pnl_5min: 0,
        total_pnl_1min: 0,
        total_pnl_5min: 0,
        warnings: ["No trade data available"],
      }
    }

    // Latency stats
    const latencies = trades.map((t) => t.latency_ms)
    const avgLatency =
      latencies.reduce((a, b) => a + b, 0) / latencies.length
    const maxLatency = Math.max(...latencies)
    const minLatency = Math.min(...latencies)

    // Direction match rate
    const matches = trades.filter((t) => t.direction_match).length
    const directionMatchRate = (matches / trades.length) * 100

    // Outcome stats
    const matchedOutcomes = outcomes.filter((o) =>
      trades.some((t) => t.trade_id === o.trade_id)
    )

    const accuracy1min =
      matchedOutcomes.length > 0
        ? (matchedOutcomes.filter((o) => o.pnl_1min > 0).length /
            matchedOutcomes.length) *
          100
        : 0

    const accuracy5min =
      matchedOutcomes.length > 0
        ? (matchedOutcomes.filter((o) => o.was_correct).length /
            matchedOutcomes.length) *
          100
        : 0

    const avgPnl1min =
      matchedOutcomes.length > 0
        ? matchedOutcomes.reduce((a, o) => a + o.pnl_1min, 0) /
          matchedOutcomes.length
        : 0

    const avgPnl5min =
      matchedOutcomes.length > 0
        ? matchedOutcomes.reduce((a, o) => a + o.pnl_5min, 0) /
          matchedOutcomes.length
        : 0

    const totalPnl1min = matchedOutcomes.reduce((a, o) => a + o.pnl_1min, 0)
    const totalPnl5min = matchedOutcomes.reduce((a, o) => a + o.pnl_5min, 0)

    // Generate warnings
    const warnings: string[] = []
    if (avgLatency > 500) {
      warnings.push(
        `⚠️ Average latency ${Math.round(avgLatency)}ms > 500ms — you're chasing price, not leading it`
      )
    }
    if (directionMatchRate < 70) {
      warnings.push(
        `⚠️ Direction mismatch ${(100 - directionMatchRate).toFixed(1)}% > 30% — your signal logic may be broken`
      )
    }
    if (accuracy5min < 50 && matchedOutcomes.length >= 5) {
      warnings.push(
        `⚠️ Post-trade accuracy ${accuracy5min.toFixed(1)}% < 50% — you may be buying tops / selling bottoms`
      )
    }
    if (matchedOutcomes.length < 10) {
      warnings.push(
        `ℹ️ Only ${matchedOutcomes.length} trades evaluated — need 10+ for statistical significance`
      )
    }

    return {
      total_trades: trades.length,
      avg_latency_ms: Math.round(avgLatency),
      max_latency_ms: maxLatency,
      min_latency_ms: minLatency,
      direction_match_rate: Math.round(directionMatchRate * 10) / 10,
      accuracy_1min: Math.round(accuracy1min * 10) / 10,
      accuracy_5min: Math.round(accuracy5min * 10) / 10,
      avg_pnl_1min: Math.round(avgPnl1min * 100) / 100,
      avg_pnl_5min: Math.round(avgPnl5min * 100) / 100,
      total_pnl_1min: Math.round(totalPnl1min * 100) / 100,
      total_pnl_5min: Math.round(totalPnl5min * 100) / 100,
      warnings,
    }
  }

  /**
   * Generate a full statistics text report
   */
  generateStatisticsReport(): string {
    const stats = this.calculateStatistics()

    const lines = [
      `📊 TRADE COMPARISON STATISTICS`,
      `================================`,
      `Total Trades: ${stats.total_trades}`,
      ``,
      `── Latency ──`,
      `  Average: ${stats.avg_latency_ms}ms`,
      `  Maximum: ${stats.max_latency_ms}ms`,
      `  Minimum: ${stats.min_latency_ms}ms`,
      ``,
      `── Accuracy ──`,
      `  Direction Match Rate: ${stats.direction_match_rate}%`,
      `  1-Min Accuracy: ${stats.accuracy_1min}%`,
      `  5-Min Accuracy: ${stats.accuracy_5min}%`,
      ``,
      `── P&L ──`,
      `  Avg PnL (1min): $${stats.avg_pnl_1min}`,
      `  Avg PnL (5min): $${stats.avg_pnl_5min}`,
      `  Total PnL (1min): $${stats.total_pnl_1min}`,
      `  Total PnL (5min): $${stats.total_pnl_5min}`,
      ``,
      `── Warnings ──`,
    ]

    if (stats.warnings.length === 0) {
      lines.push(`  ✅ No warnings — system is performing well`)
    } else {
      for (const warning of stats.warnings) {
        lines.push(`  ${warning}`)
      }
    }

    return lines.join("\n")
  }
}

// ============================================================
// Main Trade Comparison System (with Safety Integration)
// ============================================================

/**
 * The main orchestrator that ties together:
 * - Signal Capture (Binance WebSocket)
 * - Execution Engine (trade logging)
 * - Comparator Engine (analysis + reporting)
 * - PreTradeValidator (blocks dangerous trades BEFORE execution)
 * - GuardrailEngine (emergency cancels DURING execution)
 * - StrategyLearner (learns from trade history, updates rules)
 * - SafetyNotifier (alerts for blocked/cancelled trades)
 * 
 * Usage:
 *   const system = new TradeComparisonSystem("BTCUSDT")
 *   system.start() // Starts WebSocket capture
 *   
 *   // When AI makes a decision (with safety):
 *   const result = system.executeTradeWithSafety("BTCUSDT", "buy", 0.05, 43200.50, { rsi: 62, signal: "bullish" })
 *   if (result.executed) {
 *     console.log(system.getTextReport(result.trade!.trade_id))
 *   }
 *   
 *   // Get statistics:
 *   console.log(system.getStatisticsReport())
 */
export class TradeComparisonSystem {
  public signalCapture: SignalCaptureModule
  public executionEngine: ExecutionEngine
  public comparator: ComparatorEngine
  public symbol: string

  // Safety system components
  public preTradeValidator: PreTradeValidator
  public guardrailEngine: GuardrailEngine
  public strategyLearner: StrategyLearner
  public safetyNotifier: SafetyNotifier

  private evaluationTimers: Map<string, NodeJS.Timeout[]> = new Map()
  private isRunning: boolean = false

  constructor(symbol: string = "BTCUSDT") {
    this.symbol = symbol
    this.signalCapture = new SignalCaptureModule(symbol)
    this.executionEngine = new ExecutionEngine(this.signalCapture)
    this.comparator = new ComparatorEngine(this.executionEngine)

    // Initialize safety system
    this.preTradeValidator = new PreTradeValidator()
    this.guardrailEngine = new GuardrailEngine()
    this.strategyLearner = new StrategyLearner(this.preTradeValidator)
    this.safetyNotifier = new SafetyNotifier()
  }

  /**
   * Start the system: begin capturing Binance WebSocket signals
   */
  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.signalCapture.startLiveCapture()
    console.log(`[TradeComparison] Started monitoring ${this.symbol}`)
  }

  /**
   * Stop the system
   */
  stop(): void {
    this.isRunning = false
    this.signalCapture.stopLiveCapture()
    this.clearAllTimers()
    console.log(`[TradeComparison] Stopped monitoring ${this.symbol}`)
  }

  /**
   * Execute a trade with full safety system integration.
   * 
   * Flow:
   * 1. Pre-trade validation (blocks known losing patterns)
   * 2. Guardrail monitoring during execution (emergency cancel)
   * 3. Post-trade analysis by strategy learner
   * 4. Safety notifications for any blocked/cancelled trades
   */
  executeTradeWithSafety(
    symbol: string,
    action: "buy" | "sell",
    quantity: number,
    currentPrice: number,
    options?: {
      rsi?: number
      signal?: "bullish" | "bearish" | "neutral"
      latency_ms?: number
      portfolio_value?: number
      autoEvaluate?: boolean
    }
  ): { executed: boolean; trade?: TradeExecutionRecord; blockReason?: string; guardrailReason?: string } {
    const autoEvaluate = options?.autoEvaluate ?? true
    const latencyMs = options?.latency_ms ?? Math.floor(Math.random() * 300) // Simulate realistic latency

    // STEP 1: Pre-trade validation
    const tradeRequest: TradeRequest = {
      symbol,
      action,
      quantity,
      price: currentPrice,
      rsi: options?.rsi,
      signal: options?.signal,
      latency_ms: latencyMs,
      portfolio_value: options?.portfolio_value,
    }

    const validation = this.preTradeValidator.validate(tradeRequest)

    if (!validation.canExecute) {
      // Notify about blocked trade
      this.safetyNotifier.notify({
        type: "TRADE_BLOCKED",
        severity: "high",
        message: validation.blockReason || "Trade blocked by pre-trade validator",
        details: {
          symbol,
          action,
          quantity,
          price: currentPrice,
          rsi: options?.rsi,
          signal: options?.signal,
          latency_ms: latencyMs,
        },
        timestamp: Date.now(),
      })

      return { executed: false, blockReason: validation.blockReason || "Blocked by pre-trade validator" }
    }

    // STEP 2: Guardrail monitoring during execution
    const guardrailContext: ExecutionContext = {
      orderId: `order_${Date.now()}`,
      symbol,
      action,
      quantity,
      signalPrice: currentPrice,
      currentPrice,
      latency_ms: latencyMs,
      timestamp: Date.now(),
    }

    const guardrailDecision = this.guardrailEngine.monitor(guardrailContext)

    if (!guardrailDecision.allowExecution) {
      // Notify about emergency cancel
      this.safetyNotifier.notify({
        type: "EMERGENCY_CANCEL",
        severity: "critical",
        message: guardrailDecision.reason,
        details: {
          symbol,
          action,
          quantity,
          signalPrice: currentPrice,
          latency_ms: latencyMs,
        },
        timestamp: Date.now(),
      })

      return { executed: false, guardrailReason: guardrailDecision.reason }
    }

    // STEP 3: Execute the trade (original flow)
    const trade = this.executionEngine.executeTrade(
      symbol,
      action,
      quantity,
      currentPrice
    )

    if (autoEvaluate) {
      this.scheduleAutoEvaluation(trade)
    }

    return { executed: true, trade }
  }

  /**
   * Feed a trade result to the strategy learner for pattern analysis.
   * Call this after evaluating a trade outcome.
   */
  analyzeTradeResult(tradeId: string): void {
    const trade = this.executionEngine.getTrade(tradeId)
    const outcome = this.executionEngine.getOutcome(tradeId)
    if (!trade || !outcome) return

    // Find the signal at execution time
    const signal = trade.binance_signal_at_moment.signal

    // Get RSI from the signal log (or use a reasonable default)
    const signalSnapshot = this.signalCapture.getLatestSignal()
    const rsi = signalSnapshot?.rsi ?? 50

    const tradeResult: TradeResult = {
      trade_id: tradeId,
      action: trade.action,
      signal,
      rsi,
      pnl_1min: outcome.pnl_1min,
      pnl_5min: outcome.pnl_5min,
      was_correct: outcome.was_correct,
      timestamp: trade.execution_timestamp_ms,
    }

    this.strategyLearner.analyze(tradeResult)

    // Record the PnL in the validator for cooldown tracking
    this.preTradeValidator.recordTradeResult(outcome.pnl_5min)
  }

  /**
   * Legacy executeTrade method (no safety checks — kept for backward compatibility)
   */
  executeTrade(
    symbol: string,
    action: "buy" | "sell",
    quantity: number,
    currentPrice: number,
    autoEvaluate: boolean = true
  ): TradeExecutionRecord {
    const trade = this.executionEngine.executeTrade(
      symbol,
      action,
      quantity,
      currentPrice
    )

    if (autoEvaluate) {
      this.scheduleAutoEvaluation(trade)
    }

    return trade
  }

  /**
   * Manually evaluate a trade outcome
   */
  evaluateTrade(
    tradeId: string,
    price1minLater: number,
    price5minLater: number
  ): TradeOutcome {
    return this.executionEngine.evaluateOutcome(
      tradeId,
      price1minLater,
      price5minLater
    )
  }

  /**
   * Schedule automatic evaluation at 1min and 5min intervals
   */
  private scheduleAutoEvaluation(trade: TradeExecutionRecord): void {
    const timers: NodeJS.Timeout[] = []
    const entryPrice = trade.executed_price

    // 1-minute evaluation
    const timer1 = setTimeout(() => {
      const priceNow = this.simulatePriceMovement(entryPrice, 1)
      this.evaluateTrade(trade.trade_id, priceNow, entryPrice) // 5min will be updated later
    }, 60_000)

    // 5-minute evaluation
    const timer2 = setTimeout(() => {
      const priceNow = this.simulatePriceMovement(entryPrice, 5)
      // Update the 5min price (we already have a 1min record)
      const existing = this.executionEngine.getOutcome(trade.trade_id)
      if (existing) {
        this.evaluateTrade(trade.trade_id, existing.price_1min_later, priceNow)
      } else {
        this.evaluateTrade(trade.trade_id, entryPrice, priceNow)
      }
    }, 300_000)

    timers.push(timer1, timer2)
    this.evaluationTimers.set(trade.trade_id, timers)
  }

  /**
   * Simulate realistic price movement for auto-evaluation
   */
  private simulatePriceMovement(entryPrice: number, minutesElapsed: number): number {
    // Simulate realistic volatility: ~0.1% per minute with random direction
    const volatility = 0.001 * minutesElapsed
    const change = entryPrice * volatility * (Math.random() - 0.5) * 2
    return Math.round((entryPrice + change) * 100) / 100
  }

  /**
   * Generate a text report for a trade
   */
  getTextReport(tradeId: string): string {
    return this.comparator.generateTextReport(tradeId)
  }

  /**
   * Generate statistics report
   */
  getStatisticsReport(): string {
    return this.comparator.generateStatisticsReport()
  }

  /**
   * Clear all pending evaluation timers
   */
  private clearAllTimers(): void {
    for (const [, timers] of this.evaluationTimers) {
      for (const timer of timers) {
        clearTimeout(timer)
      }
    }
    this.evaluationTimers.clear()
  }
}

 