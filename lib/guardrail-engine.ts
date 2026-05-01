"use client"

/**
 * GUARDRAIL ENGINE
 *
 * Monitors trades DURING execution and can emergency-cancel if:
 * - Slippage exceeds 0.5% (execution price deviates from signal price)
 * - Latency spikes above threshold
 * - Price moves against the trade beyond acceptable limits
 *
 * Acts as the second line of defense after PreTradeValidator.
 */

export interface ExecutionContext {
  orderId: string
  symbol: string
  action: "buy" | "sell"
  quantity: number
  signalPrice: number
  currentPrice: number
  latency_ms: number
  timestamp: number
}

export interface GuardrailDecision {
  allowExecution: boolean
  overrideAction?: "buy" | "sell" | "cancel"
  reason: string
  timestamp: number
}

export interface GuardrailRule {
  id: string
  description: string
  check: (context: ExecutionContext) => GuardrailDecision
  enabled: boolean
}

export class GuardrailEngine {
  private rules: GuardrailRule[] = []
  private incidents: Array<{ context: ExecutionContext; decision: GuardrailDecision }> = []

  constructor() {
    this.initializeDefaultRules()
  }

  /**
   * Initialize default guardrail rules
   */
  private initializeDefaultRules(): void {
    // Rule 1: Slippage monitor
    this.addRule({
      id: "slippage",
      description: "Cancel if execution price deviates > 0.5% from signal price",
      enabled: true,
      check: (context: ExecutionContext) => {
        const slippage = Math.abs(
          ((context.currentPrice - context.signalPrice) / context.signalPrice) * 100
        )
        if (slippage > 0.5) {
          return {
            allowExecution: false,
            overrideAction: "cancel",
            reason: `Slippage ${slippage.toFixed(2)}% exceeds 0.5% threshold — emergency cancel`,
            timestamp: Date.now(),
          }
        }
        return {
          allowExecution: true,
          reason: `Slippage ${slippage.toFixed(2)}% within acceptable range`,
          timestamp: Date.now(),
        }
      },
    })

    // Rule 2: Latency spike monitor
    this.addRule({
      id: "latency-spike",
      description: "Cancel if latency spikes above 1000ms",
      enabled: true,
      check: (context: ExecutionContext) => {
        if (context.latency_ms > 1000) {
          return {
            allowExecution: false,
            overrideAction: "cancel",
            reason: `Latency spike ${context.latency_ms}ms > 1000ms — emergency cancel`,
            timestamp: Date.now(),
          }
        }
        return {
          allowExecution: true,
          reason: `Latency ${context.latency_ms}ms acceptable`,
          timestamp: Date.now(),
        }
      },
    })

    // Rule 3: Price reversal monitor
    this.addRule({
      id: "price-reversal",
      description: "Cancel if price moves against trade by > 1% during execution",
      enabled: true,
      check: (context: ExecutionContext) => {
        const priceMove = context.action === "buy"
          ? ((context.currentPrice - context.signalPrice) / context.signalPrice) * 100
          : ((context.signalPrice - context.currentPrice) / context.signalPrice) * 100

        if (priceMove < -1) {
          return {
            allowExecution: false,
            overrideAction: "cancel",
            reason: `Price moved ${priceMove.toFixed(2)}% against ${context.action.toUpperCase()} — emergency cancel`,
            timestamp: Date.now(),
          }
        }
        return {
          allowExecution: true,
          reason: `Price move ${priceMove.toFixed(2)}% acceptable`,
          timestamp: Date.now(),
        }
      },
    })
  }

  /**
   * Add a guardrail rule
   */
  addRule(rule: GuardrailRule): void {
    this.rules.push(rule)
  }

  /**
   * Monitor an execution context against all guardrail rules
   */
  monitor(context: ExecutionContext): GuardrailDecision {
    for (const rule of this.rules) {
      if (!rule.enabled) continue

      const decision = rule.check(context)
      if (!decision.allowExecution) {
        // Log the incident
        this.incidents.push({ context, decision })
        return decision
      }
    }

    // All rules passed
    const passed: GuardrailDecision = {
      allowExecution: true,
      reason: "All guardrail checks passed",
      timestamp: Date.now(),
    }
    return passed
  }

  /**
   * Get all incidents
   */
  getIncidents() {
    return [...this.incidents]
  }

  /**
   * Clear incidents
   */
  clearIncidents(): void {
    this.incidents.length = 0
  }
}
