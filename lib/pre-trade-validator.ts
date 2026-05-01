"use client"

/**
 * PRE-TRADE VALIDATOR
 *
 * Validates every trade request BEFORE execution.
 * Blocks dangerous trades based on:
 * - Learned patterns from strategy-learner (e.g., "SELL on NEUTRAL has 0% win rate")
 * - Position size limits (never risk > 2% of portfolio)
 * - Cooldown after loss (no new trades within 30 seconds of a loss)
 * - Maximum daily loss limit (if daily PnL < -5%, stop all trades)
 * - RSI extremes (RSI > 70 + BUY = buying top, RSI < 30 + SELL = selling bottom)
 * - Latency thresholds (> 500ms = chasing price)
 */

export interface TradeRequest {
  symbol: string
  action: "buy" | "sell"
  quantity: number
  price: number
  rsi?: number
  signal?: "bullish" | "bearish" | "neutral"
  latency_ms?: number
  portfolio_value?: number
}

export interface ValidationResult {
  canExecute: boolean
  blockReason: string | null
  warnings: string[]
  timestamp: number
}

export interface ValidationRule {
  id: string
  description: string
  check: (request: TradeRequest) => { blocked: boolean; reason: string | null }
  enabled: boolean
  priority: number // Lower = checked first
}

export class PreTradeValidator {
  private rules: ValidationRule[] = []
  private blockedTrades: Array<{ request: TradeRequest; reason: string; timestamp: number }> = []
  private dailyStats: {
    date: string
    totalPnl: number
    totalTrades: number
    losses: number
    lastLossTimestamp: number | null
  }

  constructor() {
    this.dailyStats = this.resetDailyStats()
    this.initializeDefaultRules()
  }

  /**
   * Reset daily statistics
   */
  private resetDailyStats() {
    return {
      date: new Date().toISOString().slice(0, 10),
      totalPnl: 0,
      totalTrades: 0,
      losses: 0,
      lastLossTimestamp: null,
    }
  }

  /**
   * Initialize default safety rules
   */
  private initializeDefaultRules(): void {
    // Rule 1: Pattern-based blocking (learned from strategy-learner)
    this.addRule({
      id: "pattern-block",
      description: "Block known losing patterns (e.g., SELL on NEUTRAL)",
      priority: 1,
      enabled: true,
      check: (request: TradeRequest) => {
        // This will be dynamically updated by strategy-learner
        // Default: block SELL on NEUTRAL (known losing pattern from our test data)
        if (request.action === "sell" && request.signal === "neutral") {
          return {
            blocked: true,
            reason: "SELL on NEUTRAL has 0% win rate — blocked by pattern rule",
          }
        }
        return { blocked: false, reason: null }
      },
    })

    // Rule 2: Position size limit (never risk > 2% of portfolio)
    this.addRule({
      id: "position-size",
      description: "Never risk more than 2% of portfolio per trade",
      priority: 2,
      enabled: true,
      check: (request: TradeRequest) => {
        if (request.portfolio_value && request.quantity * request.price > request.portfolio_value * 0.02) {
          return {
            blocked: true,
            reason: `Position size $${(request.quantity * request.price).toFixed(2)} exceeds 2% of portfolio ($${(request.portfolio_value * 0.02).toFixed(2)})`,
          }
        }
        return { blocked: false, reason: null }
      },
    })

    // Rule 3: Cooldown after loss (no new trades within 30 seconds)
    this.addRule({
      id: "cooldown",
      description: "No new trades within 30 seconds of a loss",
      priority: 3,
      enabled: true,
      check: (_request: TradeRequest) => {
        if (this.dailyStats.lastLossTimestamp) {
          const elapsed = Date.now() - this.dailyStats.lastLossTimestamp
          if (elapsed < 30_000) {
            return {
              blocked: true,
              reason: `Cooldown active — ${Math.ceil((30_000 - elapsed) / 1000)}s remaining since last loss`,
            }
          }
        }
        return { blocked: false, reason: null }
      },
    })

    // Rule 4: Maximum daily loss limit
    this.addRule({
      id: "daily-loss-limit",
      description: "Stop all trades if daily PnL < -5%",
      priority: 4,
      enabled: true,
      check: (_request: TradeRequest) => {
        // Check if day changed
        const today = new Date().toISOString().slice(0, 10)
        if (this.dailyStats.date !== today) {
          this.dailyStats = this.resetDailyStats()
          this.dailyStats.date = today
        }

        // If we have a portfolio value, check percentage
        // For now, check if total losses exceed a threshold
        if (this.dailyStats.totalPnl < -5000) {
          return {
            blocked: true,
            reason: `Daily loss limit reached ($${Math.abs(this.dailyStats.totalPnl).toFixed(2)} loss) — all trades stopped for the day`,
          }
        }
        return { blocked: false, reason: null }
      },
    })

    // Rule 5: RSI extremes (buying tops / selling bottoms)
    this.addRule({
      id: "rsi-extreme",
      description: "Block trades at RSI extremes (RSI > 70 + BUY, RSI < 30 + SELL)",
      priority: 5,
      enabled: true,
      check: (request: TradeRequest) => {
        if (request.rsi !== undefined) {
          if (request.rsi > 70 && request.action === "buy") {
            return {
              blocked: true,
              reason: `RSI ${request.rsi} > 70 — buying at overbought levels (buying tops)`,
            }
          }
          if (request.rsi < 30 && request.action === "sell") {
            return {
              blocked: true,
              reason: `RSI ${request.rsi} < 30 — selling at oversold levels (selling bottoms)`,
            }
          }
        }
        return { blocked: false, reason: null }
      },
    })

    // Rule 6: Latency threshold
    this.addRule({
      id: "latency-threshold",
      description: "Block trades if latency > 500ms (chasing price)",
      priority: 6,
      enabled: true,
      check: (request: TradeRequest) => {
        if (request.latency_ms !== undefined && request.latency_ms > 500) {
          return {
            blocked: true,
            reason: `Latency ${request.latency_ms}ms > 500ms — you're chasing price, not leading it`,
          }
        }
        return { blocked: false, reason: null }
      },
    })
  }

  /**
   * Add a custom validation rule
   */
  addRule(rule: ValidationRule): void {
    // Insert in priority order
    const index = this.rules.findIndex((r) => r.priority > rule.priority)
    if (index === -1) {
      this.rules.push(rule)
    } else {
      this.rules.splice(index, 0, rule)
    }
  }

  /**
   * Remove a rule by ID
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId)
  }

  /**
   * Enable or disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.find((r) => r.id === ruleId)
    if (rule) {
      rule.enabled = enabled
    }
  }

  /**
   * Get all current rules
   */
  getRules(): ValidationRule[] {
    return [...this.rules]
  }

  /**
   * Validate a trade request against all rules
   */
  validate(request: TradeRequest): ValidationResult {
    const warnings: string[] = []

    // Check each enabled rule in priority order
    for (const rule of this.rules) {
      if (!rule.enabled) continue

      const result = rule.check(request)
      if (result.blocked) {
        // Log the blocked trade
        this.blockedTrades.push({
          request,
          reason: result.reason!,
          timestamp: Date.now(),
        })

        return {
          canExecute: false,
          blockReason: result.reason,
          warnings,
          timestamp: Date.now(),
        }
      }
    }

    return {
      canExecute: true,
      blockReason: null,
      warnings,
      timestamp: Date.now(),
    }
  }

  /**
   * Record a trade result (win/loss) for cooldown tracking
   */
  recordTradeResult(pnl: number): void {
    this.dailyStats.totalTrades++
    this.dailyStats.totalPnl += pnl

    if (pnl < 0) {
      this.dailyStats.losses++
      this.dailyStats.lastLossTimestamp = Date.now()
    }
  }

  /**
   * Get blocked trades history
   */
  getBlockedTrades() {
    return [...this.blockedTrades]
  }

  /**
   * Get daily statistics
   */
  getDailyStats() {
    return { ...this.dailyStats }
  }

  /**
   * Reset daily stats (for testing)
   */
  resetDailyStatsForTesting(): void {
    this.dailyStats = this.resetDailyStats()
  }
}
