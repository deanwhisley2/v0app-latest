"use client"

/**
 * STRATEGY LEARNER
 *
 * Automatically analyzes trade history and updates validation rules:
 * - Reads the comparison engine output
 * - Identifies losing patterns (like "SELL on NEUTRAL")
 * - Updates pre-trade validator rules dynamically
 * - Logs every rule change with timestamp
 *
 * This is how the system "environmentally trains" itself — not on historical data,
 * but on live battlefield feedback.
 */

import { PreTradeValidator, type TradeRequest } from "./pre-trade-validator"

export interface TradeResult {
  trade_id: string
  action: "buy" | "sell"
  signal: "bullish" | "bearish" | "neutral"
  rsi: number
  pnl_1min: number
  pnl_5min: number
  was_correct: boolean
  timestamp: number
}

export interface LearnedPattern {
  pattern: string // e.g., "SELL on NEUTRAL"
  action: string
  signal: string
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  avgPnl: number
  blocked: boolean
  lastObserved: number
}

export interface RuleChange {
  timestamp: number
  pattern: string
  oldState: "allowed" | "blocked"
  newState: "allowed" | "blocked"
  reason: string
  winRate: number
  totalTrades: number
}

export type StrategyLearnerHooks = {
  /** Fired after a pattern is blocked and the validator rule is installed (e.g. persist to API). */
  onPatternBlocked?: (pattern: LearnedPattern) => void
}

/** Idempotent: replaces existing learned rule with same id on the validator. */
export function applyLearnedPatternToValidator(
  validator: PreTradeValidator,
  pattern: LearnedPattern
): void {
  const id = `learned-block-${pattern.pattern.toLowerCase().replace(/\s+/g, "-")}`
  validator.removeRule(id)
  const action = pattern.action.toLowerCase()
  const signal = pattern.signal.toLowerCase()
  validator.addRule({
    id,
    description: `Learned: Block ${pattern.pattern} (${(pattern.winRate * 100).toFixed(0)}% win rate)`,
    priority: 0,
    enabled: true,
    check: (request: TradeRequest) => {
      if (request.action === action && request.signal === signal) {
        return {
          blocked: true,
          reason: `Learned pattern: ${pattern.pattern} has ${(pattern.winRate * 100).toFixed(0)}% win rate — blocked by strategy learner`,
        }
      }
      return { blocked: false, reason: null }
    },
  })
}

export class StrategyLearner {
  private tradeHistory: TradeResult[] = []
  private patterns: Map<string, LearnedPattern> = new Map()
  private ruleChanges: RuleChange[] = []
  private validator: PreTradeValidator
  private hooks?: StrategyLearnerHooks
  private readonly MIN_TRADES_FOR_PATTERN = 2 // Minimum trades to identify a pattern
  private readonly BLOCK_THRESHOLD = 0.3 // Block if win rate < 30%

  constructor(validator: PreTradeValidator, hooks?: StrategyLearnerHooks) {
    this.validator = validator
    this.hooks = hooks
  }

  /**
   * Restore a blocked pattern from persistence (validator rule + in-memory map).
   */
  importBlockedPattern(pattern: LearnedPattern): void {
    const p: LearnedPattern = { ...pattern, blocked: true }
    this.patterns.set(p.pattern, p)
    applyLearnedPatternToValidator(this.validator, p)
  }

  /**
   * Analyze a trade result and update patterns
   */
  analyze(result: TradeResult): void {
    this.tradeHistory.push(result)

    // Identify the pattern key
    const patternKey = `${result.action.toUpperCase()} on ${result.signal.toUpperCase()}`

    // Update or create pattern
    const existing = this.patterns.get(patternKey)
    if (existing) {
      existing.totalTrades++
      if (result.was_correct) {
        existing.wins++
      } else {
        existing.losses++
      }
      existing.winRate = existing.wins / existing.totalTrades
      existing.avgPnl = (existing.avgPnl * (existing.totalTrades - 1) + result.pnl_5min) / existing.totalTrades
      existing.lastObserved = result.timestamp
    } else {
      this.patterns.set(patternKey, {
        pattern: patternKey,
        action: result.action,
        signal: result.signal,
        totalTrades: 1,
        wins: result.was_correct ? 1 : 0,
        losses: result.was_correct ? 0 : 1,
        winRate: result.was_correct ? 1 : 0,
        avgPnl: result.pnl_5min,
        blocked: false,
        lastObserved: result.timestamp,
      })
    }

    // Check if we need to update rules
    this.updateRulesIfNeeded()
  }

  /**
   * Check if any patterns need rule updates
   */
  updateRulesIfNeeded(): void {
    for (const [, pattern] of this.patterns) {
      // Skip if already blocked
      if (pattern.blocked) continue

      // Need minimum trades to identify a pattern
      if (pattern.totalTrades < this.MIN_TRADES_FOR_PATTERN) continue

      // Block if win rate is below threshold
      if (pattern.winRate < this.BLOCK_THRESHOLD) {
        this.blockPattern(pattern)
      }
    }
  }

  /**
   * Block a losing pattern by adding a rule to the validator
   */
  private blockPattern(pattern: LearnedPattern): void {
    pattern.blocked = true

    // Record the rule change
    const change: RuleChange = {
      timestamp: Date.now(),
      pattern: pattern.pattern,
      oldState: "allowed",
      newState: "blocked",
      reason: `Win rate ${(pattern.winRate * 100).toFixed(0)}% below ${(this.BLOCK_THRESHOLD * 100).toFixed(0)}% threshold after ${pattern.totalTrades} trades`,
      winRate: pattern.winRate,
      totalTrades: pattern.totalTrades,
    }
    this.ruleChanges.push(change)

    applyLearnedPatternToValidator(this.validator, pattern)

    console.log(
      `[StrategyLearner] 🚫 Blocked pattern "${pattern.pattern}" — ` +
      `win rate ${(pattern.winRate * 100).toFixed(0)}% (${pattern.wins}/${pattern.totalTrades})`
    )

    this.hooks?.onPatternBlocked?.(pattern)
  }

  /**
   * Get all learned patterns
   */
  getPatterns(): LearnedPattern[] {
    return Array.from(this.patterns.values())
  }

  /**
   * Get all rule changes
   */
  getRuleChanges(): RuleChange[] {
    return [...this.ruleChanges]
  }

  /**
   * Get trade history
   */
  getTradeHistory(): TradeResult[] {
    return [...this.tradeHistory]
  }

  /**
   * Get statistics about learning
   */
  getLearningStats() {
    return {
      totalTradesAnalyzed: this.tradeHistory.length,
      patternsIdentified: this.patterns.size,
      patternsBlocked: Array.from(this.patterns.values()).filter((p) => p.blocked).length,
      ruleChanges: this.ruleChanges.length,
    }
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.tradeHistory.length = 0
    this.patterns.clear()
    this.ruleChanges.length = 0
  }
}
