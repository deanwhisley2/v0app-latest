/**
 * CLINE INSTRUCTION: This file defines the STANDARD SIGNAL FORMAT.
 * DO NOT MODIFY the structure. All strategies MUST output this format.
 * The Commander depends on these exact fields.
 *
 * WHY: Prevents "fake execution" by requiring broker confirmation,
 * order IDs, and audit trails before a trade is shown as "real".
 *
 * What This Prevents:
 * ✅ Fake trades — A signal is NOT a trade until brokerOrderId exists
 * ✅ Lost orders — Every order has signalId → signal traceability
 * ✅ Silent failures — rejectionReason explains why trade didn't execute
 * ✅ Audit gaps — auditTrail documents every step with timestamp
 * ✅ Rogue strategies — REQUIRED_FIELDS enforces minimum quality
 * ✅ Confusion — executionMode: "paper" | "live" is explicit
 */

import { type TradeReason, type EnhancedTradeSignal } from "./enhanced-trading-engine"
import { type LiquidityWarfareReport } from "./liquidity-warfare"
import { type SentimentReport } from "./sentiment-weapon"
import { type TradeDecision } from "../nexus-core/nexus-engine"

// ============================================================
// STANDARD TRADE SIGNAL — All strategies MUST output this format
// ============================================================

export type TradeAction = "BUY" | "SELL" | "HOLD"

export interface TradeSignal {
  id: string                   // Unique signal ID (UUID) — traceability back from execution
  strategyId: string           // Which bot generated this signal
  symbol: string               // BTCUSDT, ETHUSDT, etc.
  action: TradeAction
  confidence: number           // 0-1, minimum 0.65 to be considered
  entry: number                // Proposed entry price
  stopLoss: number             // Stop loss price
  takeProfit: number           // Take profit price
  riskPercent: number          // 0.5% to 2% max
  timestamp: string            // ISO timestamp
  // Optional additional data
  reason?: string              // Why this signal was generated
  liquiditySweepDetected?: boolean
  sentimentExtreme?: boolean
  /** BUY: optional fixed USDT spend; overrides risk-based quote size in Commander */
  quoteOverrideUsd?: number
  /** SELL: optional fixed base quantity */
  baseOverrideQuantity?: number
}

export interface OrderExecution {
  id: string                   // Unique order ID
  signalId: string             // Links back to original signal
  strategyId: string
  symbol: string
  action: TradeAction
  status: "PENDING" | "APPROVED" | "REJECTED" | "SENT" | "FILLED" | "FAILED" | "CANCELLED"
  executionMode: "paper" | "live"
  brokerOrderId?: string       // REQUIRED for live trades (from exchange)
  entryPrice?: number          // Actual fill price (may differ from signal.entry)
  stopLoss?: number
  takeProfit?: number
  fillQuantity?: number
  fillTimestamp?: string
  rejectionReason?: string
  auditTrail: AuditEntry[]     // Every step logged here
  createdAt: string
  updatedAt: string
  /** Planned MARKET BUY spend (USDT) — set by Commander for live Binance */
  quoteOrderQtyUsd?: number
  /** Planned base size for MARKET SELL — set by Commander */
  baseQuantityPlan?: number
}

export interface AuditEntry {
  timestamp: string
  step: "VALIDATION" | "RISK_CHECK" | "QUEUE" | "SENT_TO_BROKER" | "BROKER_CONFIRMATION" | "FILLED" | "FAILED"
  status: "PASS" | "FAIL" | "PENDING" | "COMPLETE"
  message: string
  metadata?: Record<string, any>
}

// Signal validation rules
export const SIGNAL_RULES = {
  MIN_CONFIDENCE: 0.65,
  MAX_RISK_PERCENT: 2,
  MIN_RISK_PERCENT: 0.5,
  REQUIRED_FIELDS: ["strategyId", "symbol", "action", "confidence", "entry", "stopLoss", "takeProfit", "riskPercent"]
}

// Create a new audit entry
export function createAuditEntry(step: AuditEntry["step"], status: AuditEntry["status"], message: string, metadata?: any): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    step,
    status,
    message,
    metadata
  }
}

// ============================================================
// Signal Sources — where did this signal come from?
// ============================================================

export type SignalSource =
  | "nexus_engine"        // Kalman + Shadow Book + Smart Money
  | "contrarian_engine"   // Enhanced Trading Engine (liquidity sweeps, spoof fades)
  | "liquidity_warfare"   // Stop clusters, dark pools, sweeps
  | "sentiment_weapon"    // Order book imbalance, funding rates
  | "strategy_learner"    // Learned patterns from trade history
  | "market_intelligence" // Session-aware, pre-pump detection
  | "multi_coin"          // Cross-coin confidence aggregation
  | "guardrail"           // Emergency override from guardrail engine
  | "manual"              // Manual override

// ============================================================
// Signal Priority — higher wins in conflict
// ============================================================

export type SignalPriority = 1 | 2 | 3 | 4 | 5

export const SIGNAL_PRIORITY: Record<SignalSource, SignalPriority> = {
  guardrail: 5,            // Safety always wins
  manual: 5,               // Manual override = absolute
  contrarian_engine: 4,    // Contrarian entries are high conviction
  liquidity_warfare: 3,    // Liquidity data is real-time
  sentiment_weapon: 3,     // Sentiment confirms or denies
  nexus_engine: 2,         // Core engine is baseline
  strategy_learner: 2,     // Learned patterns inform
  market_intelligence: 1,  // Contextual awareness
  multi_coin: 1,           // Aggregated view
}

// ============================================================
// Signal Envelope — what every signal looks like
// ============================================================

export interface SignalEnvelope {
  id: string
  source: SignalSource
  priority: SignalPriority
  timestamp: number
  symbol: string

  // The actual trade recommendation
  action: TradeAction
  confidence: number       // 0–100
  reason: TradeReason | string
  explanation: string

  // Price levels
  entryPrice: number
  stopLoss: number
  takeProfit: number
  riskReward: number

  // Optional: full context from the source
  sourceData?: {
    nexusDecision?: TradeDecision
    enhancedSignal?: EnhancedTradeSignal
    warfareReport?: LiquidityWarfareReport
    sentimentReport?: SentimentReport
  }

  // Metadata
  expiresAt: number        // Signal is stale after this timestamp
  isOverride: boolean      // If true, this signal overrides all lower-priority signals
}

// ============================================================
// Signal Bus — collects, ranks, and resolves signals
// ============================================================

export class SignalBus {
  private signals: Map<string, SignalEnvelope> = new Map()
  private history: SignalEnvelope[] = []
  private readonly MAX_HISTORY = 1000

  /**
   * Emit a signal onto the bus. If a signal with the same symbol
   * and source already exists, it gets replaced (latest wins).
   */
  emit(signal: SignalEnvelope): void {
    const key = `${signal.symbol}:${signal.source}`
    this.signals.set(key, signal)
    this.history.push(signal)

    // Trim history
    if (this.history.length > this.MAX_HISTORY) {
      this.history = this.history.slice(-this.MAX_HISTORY)
    }
  }

  /**
   * Get the winning signal for a symbol.
   * - Override signals (priority 5) always win.
   * - Otherwise, highest priority wins.
   * - If tie, highest confidence wins.
   * - If still tie, most recent wins.
   */
  resolve(symbol: string): SignalEnvelope | null {
    const relevant = Array.from(this.signals.values())
      .filter((s) => s.symbol === symbol && s.expiresAt > Date.now())

    if (relevant.length === 0) return null

    // Check for overrides first
    const overrides = relevant.filter((s) => s.isOverride)
    if (overrides.length > 0) {
      return overrides.reduce((best, current) =>
        current.timestamp > best.timestamp ? current : best
      )
    }

    // Sort by priority desc, then confidence desc, then timestamp desc
    relevant.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      if (b.confidence !== a.confidence) return b.confidence - a.confidence
      return b.timestamp - a.timestamp
    })

    return relevant[0]
  }

  /**
   * Get all active (non-expired) signals for a symbol.
   */
  getActiveSignals(symbol: string): SignalEnvelope[] {
    return Array.from(this.signals.values())
      .filter((s) => s.symbol === symbol && s.expiresAt > Date.now())
      .sort((a, b) => b.priority - a.priority)
  }

  /**
   * Get all signals from a specific source.
   */
  getSignalsBySource(source: SignalSource): SignalEnvelope[] {
    return Array.from(this.signals.values())
      .filter((s) => s.source === source && s.expiresAt > Date.now())
  }

  /**
   * Clear expired signals.
   */
  prune(): number {
    const before = this.signals.size
    for (const [key, signal] of this.signals) {
      if (signal.expiresAt <= Date.now()) {
        this.signals.delete(key)
      }
    }
    return before - this.signals.size
  }

  /**
   * Get recent history for analysis.
   */
  getHistory(limit = 50): SignalEnvelope[] {
    return this.history.slice(-limit)
  }

  /**
   * Clear all signals (e.g., on market close).
   */
  clear(): void {
    this.signals.clear()
  }

  /**
   * Get signal count per source (for dashboard).
   */
  getStats(): Record<SignalSource, number> {
    const stats: Record<string, number> = {}
    for (const source of Object.keys(SIGNAL_PRIORITY)) {
      stats[source] = 0
    }
    for (const signal of this.signals.values()) {
      if (signal.expiresAt > Date.now()) {
        stats[signal.source] = (stats[signal.source] || 0) + 1
      }
    }
    return stats as Record<SignalSource, number>
  }
}

// ============================================================
// Helpers
// ============================================================

let signalCounter = 0

export function createSignalId(): string {
  signalCounter++
  return `sig_${Date.now()}_${signalCounter}_${Math.random().toString(36).slice(2, 8)}`
}

export function createSignalEnvelope(params: {
  source: SignalSource
  symbol: string
  action: TradeAction
  confidence: number
  reason: TradeReason | string
  explanation: string
  entryPrice: number
  stopLoss: number
  takeProfit: number
  isOverride?: boolean
  sourceData?: SignalEnvelope["sourceData"]
  ttlMs?: number
}): SignalEnvelope {
  const now = Date.now()
  return {
    id: createSignalId(),
    source: params.source,
    priority: SIGNAL_PRIORITY[params.source],
    timestamp: now,
    symbol: params.symbol,
    action: params.action,
    confidence: params.confidence,
    reason: params.reason,
    explanation: params.explanation,
    entryPrice: params.entryPrice,
    stopLoss: params.stopLoss,
    takeProfit: params.takeProfit,
    riskReward:
      params.entryPrice === params.stopLoss
        ? 0
        : Math.abs(
            (params.takeProfit - params.entryPrice) /
              (params.entryPrice - params.stopLoss)
          ),
    isOverride: params.isOverride ?? false,
    sourceData: params.sourceData,
    expiresAt: now + (params.ttlMs ?? 60_000), // default 1 minute TTL
  }
}
