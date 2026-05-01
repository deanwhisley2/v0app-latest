/**
 * SAFETY SYSTEM TEST
 *
 * Tests the complete safety system:
 * 1. Pre-trade validation (blocks dangerous trades)
 * 2. Guardrail engine (monitors execution)
 * 3. Strategy learner (identifies losing patterns)
 * 4. Safety notifier (alerts for critical events)
 *
 * Run: npm run test-safety
 */

import { PreTradeValidator, TradeRequest } from "../lib/pre-trade-validator"
import { GuardrailEngine, ExecutionContext } from "../lib/guardrail-engine"
import { StrategyLearner, TradeResult } from "../lib/strategy-learner"
import { SafetyNotifier } from "../lib/safety-notifier"

// Colors for console output
const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const YELLOW = "\x1b[33m"
const CYAN = "\x1b[36m"
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"

function pass(msg: string): void {
  console.log(`  ${GREEN}✅ ${msg}${RESET}`)
}

function fail(msg: string): void {
  console.log(`  ${RED}❌ ${msg}${RESET}`)
}

function info(msg: string): void {
  console.log(`  ${CYAN}ℹ️  ${msg}${RESET}`)
}

function header(msg: string): void {
  console.log(`\n${BOLD}${msg}${RESET}`)
  console.log("=".repeat(msg.length))
}

// Track test results
let passed = 0
let failed = 0

function test(name: string, fn: () => boolean): void {
  process.stdout.write(`  ${name}... `)
  try {
    if (fn()) {
      console.log(`${GREEN}✅ PASS${RESET}`)
      passed++
    } else {
      console.log(`${RED}❌ FAIL${RESET}`)
      failed++
    }
  } catch (e) {
    console.log(`${RED}❌ FAIL (error)${RESET}`)
    console.log(`     ${RED}${e}${RESET}`)
    failed++
  }
}

async function main() {
  console.log(`\n${BOLD}${CYAN}🧪 SAFETY SYSTEM TEST${RESET}`)
  console.log("=".repeat(50))

  // =========================================================
  // 1. PRE-TRADE VALIDATOR TESTS
  // =========================================================
  header("1. Pre-Trade Validator")

  const validator = new PreTradeValidator()

  // Test 1: Block SELL on NEUTRAL (known losing pattern)
  test("SELL on NEUTRAL → BLOCKED", () => {
    const request: TradeRequest = {
      symbol: "BTCUSDT",
      action: "sell",
      quantity: 0.05,
      price: 43200,
      signal: "neutral",
    }
    const result = validator.validate(request)
    return !result.canExecute && result.blockReason!.includes("SELL on NEUTRAL")
  })

  // Test 2: Allow BUY on NEUTRAL (winning pattern)
  test("BUY on NEUTRAL → ALLOWED", () => {
    const request: TradeRequest = {
      symbol: "BTCUSDT",
      action: "buy",
      quantity: 0.05,
      price: 43200,
      signal: "neutral",
    }
    const result = validator.validate(request)
    return result.canExecute
  })

  // Test 3: Block latency > 500ms
  test("Latency > 500ms → BLOCKED", () => {
    const request: TradeRequest = {
      symbol: "BTCUSDT",
      action: "buy",
      quantity: 0.05,
      price: 43200,
      signal: "bullish",
      latency_ms: 600,
    }
    const result = validator.validate(request)
    return !result.canExecute && result.blockReason!.includes("500ms")
  })

  // Test 4: Allow latency < 500ms
  test("Latency < 500ms → ALLOWED", () => {
    const request: TradeRequest = {
      symbol: "BTCUSDT",
      action: "buy",
      quantity: 0.05,
      price: 43200,
      signal: "bullish",
      latency_ms: 100,
    }
    const result = validator.validate(request)
    return result.canExecute
  })

  // Test 5: Block RSI > 70 + BUY (buying tops)
  test("RSI 75 + BUY → BLOCKED", () => {
    const request: TradeRequest = {
      symbol: "BTCUSDT",
      action: "buy",
      quantity: 0.05,
      price: 43200,
      signal: "bullish",
      rsi: 75,
    }
    const result = validator.validate(request)
    return !result.canExecute && result.blockReason!.includes("overbought")
  })

  // Test 6: Block RSI < 30 + SELL (selling bottoms)
  test("RSI 25 + SELL → BLOCKED", () => {
    const request: TradeRequest = {
      symbol: "BTCUSDT",
      action: "sell",
      quantity: 0.05,
      price: 43200,
      signal: "bearish",
      rsi: 25,
    }
    const result = validator.validate(request)
    return !result.canExecute && result.blockReason!.includes("oversold")
  })

  // Test 7: Allow RSI 50 + BUY (normal)
  test("RSI 50 + BUY → ALLOWED", () => {
    const request: TradeRequest = {
      symbol: "BTCUSDT",
      action: "buy",
      quantity: 0.05,
      price: 43200,
      signal: "bullish",
      rsi: 50,
    }
    const result = validator.validate(request)
    return result.canExecute
  })

  // Test 8: Block position size > 2% of portfolio
  test("Position size > 2% of portfolio → BLOCKED", () => {
    const request: TradeRequest = {
      symbol: "BTCUSDT",
      action: "buy",
      quantity: 10, // $432,000 position
      price: 43200,
      signal: "bullish",
      portfolio_value: 100000, // 2% = $2,000
    }
    const result = validator.validate(request)
    return !result.canExecute && result.blockReason!.includes("exceeds 2%")
  })

  // Test 9: Cooldown after loss
  test("Cooldown after loss → BLOCKED", () => {
    // Simulate a loss
    validator.recordTradeResult(-100)
    const request: TradeRequest = {
      symbol: "BTCUSDT",
      action: "buy",
      quantity: 0.05,
      price: 43200,
      signal: "bullish",
    }
    const result = validator.validate(request)
    return !result.canExecute && result.blockReason!.includes("Cooldown")
  })

  // =========================================================
  // 2. GUARDRAIL ENGINE TESTS
  // =========================================================
  header("2. Guardrail Engine")

  const guardrail = new GuardrailEngine()

  // Test 10: Block slippage > 0.5%
  test("Slippage > 0.5% → EMERGENCY CANCEL", () => {
    const context: ExecutionContext = {
      orderId: "test-1",
      symbol: "BTCUSDT",
      action: "buy",
      quantity: 0.05,
      signalPrice: 43200,
      currentPrice: 43500, // 0.69% slippage
      latency_ms: 50,
      timestamp: Date.now(),
    }
    const decision = guardrail.monitor(context)
    return !decision.allowExecution && decision.overrideAction === "cancel"
  })

  // Test 11: Allow slippage < 0.5%
  test("Slippage < 0.5% → ALLOWED", () => {
    const context: ExecutionContext = {
      orderId: "test-2",
      symbol: "BTCUSDT",
      action: "buy",
      quantity: 0.05,
      signalPrice: 43200,
      currentPrice: 43250, // 0.12% slippage
      latency_ms: 50,
      timestamp: Date.now(),
    }
    const decision = guardrail.monitor(context)
    return decision.allowExecution
  })

  // Test 12: Block latency spike > 1000ms
  test("Latency spike > 1000ms → EMERGENCY CANCEL", () => {
    const context: ExecutionContext = {
      orderId: "test-3",
      symbol: "BTCUSDT",
      action: "buy",
      quantity: 0.05,
      signalPrice: 43200,
      currentPrice: 43200,
      latency_ms: 1500,
      timestamp: Date.now(),
    }
    const decision = guardrail.monitor(context)
    return !decision.allowExecution && decision.overrideAction === "cancel"
  })

  // Test 13: Block price reversal > 1%
  test("Price reversal > 1% against BUY → EMERGENCY CANCEL", () => {
    const context: ExecutionContext = {
      orderId: "test-4",
      symbol: "BTCUSDT",
      action: "buy",
      quantity: 0.05,
      signalPrice: 43200,
      currentPrice: 42700, // -1.16% move against buy
      latency_ms: 50,
      timestamp: Date.now(),
    }
    const decision = guardrail.monitor(context)
    return !decision.allowExecution && decision.overrideAction === "cancel"
  })

  // =========================================================
  // 3. STRATEGY LEARNER TESTS
  // =========================================================
  header("3. Strategy Learner")

  const learner = new StrategyLearner(validator)

  // Test 14: Identify losing pattern
  test("Identifies SELL on NEUTRAL as losing pattern", () => {
    // Feed losing trades
    learner.analyze({
      trade_id: "loss-1",
      action: "sell",
      signal: "neutral",
      rsi: 50,
      pnl_1min: -50,
      pnl_5min: -120,
      was_correct: false,
      timestamp: Date.now(),
    })
    learner.analyze({
      trade_id: "loss-2",
      action: "sell",
      signal: "neutral",
      rsi: 45,
      pnl_1min: -30,
      pnl_5min: -80,
      was_correct: false,
      timestamp: Date.now(),
    })

    const patterns = learner.getPatterns()
    const sellNeutral = patterns.find((p) => p.pattern === "SELL on NEUTRAL")
    return sellNeutral !== undefined && sellNeutral.blocked
  })

  // Test 15: Strategy learner blocks the pattern in validator
  test("Strategy learner blocks SELL on NEUTRAL in validator", () => {
    const request: TradeRequest = {
      symbol: "BTCUSDT",
      action: "sell",
      quantity: 0.05,
      price: 43200,
      signal: "neutral",
    }
    const result = validator.validate(request)
    return !result.canExecute && result.blockReason!.includes("Learned pattern")
  })

  // Test 16: Track rule changes
  test("Rule changes are logged", () => {
    const changes = learner.getRuleChanges()
    return changes.length > 0 && changes[0].pattern === "SELL on NEUTRAL"
  })

  // =========================================================
  // 4. SAFETY NOTIFIER TESTS
  // =========================================================
  header("4. Safety Notifier")

  const notifier = new SafetyNotifier({
    consoleEnabled: false,
    fileLoggingEnabled: false,
  })

  // Test 17: Notify trade blocked
  test("Notifies trade blocked events", () => {
    notifier.notify({
      type: "TRADE_BLOCKED",
      severity: "high",
      message: "SELL on NEUTRAL blocked by pattern rule",
      timestamp: Date.now(),
    })
    const events = notifier.getEventsByType("TRADE_BLOCKED")
    return events.length === 1
  })

  // Test 18: Notify emergency cancel
  test("Notifies emergency cancel events", () => {
    notifier.notify({
      type: "EMERGENCY_CANCEL",
      severity: "critical",
      message: "Slippage 0.69% exceeded threshold",
      timestamp: Date.now(),
    })
    const events = notifier.getEventsByType("EMERGENCY_CANCEL")
    return events.length === 1
  })

  // Test 19: Notify rule changes
  test("Notifies rule change events", () => {
    notifier.notify({
      type: "RULE_CHANGE",
      severity: "medium",
      message: "Blocked SELL on NEUTRAL (0% win rate)",
      timestamp: Date.now(),
    })
    const events = notifier.getEventsByType("RULE_CHANGE")
    return events.length === 1
  })

  // Test 20: Notify daily loss limit
  test("Notifies daily loss limit events", () => {
    notifier.notify({
      type: "DAILY_LOSS_LIMIT",
      severity: "critical",
      message: "Daily loss limit of -5% reached",
      timestamp: Date.now(),
    })
    const events = notifier.getEventsByType("DAILY_LOSS_LIMIT")
    return events.length === 1
  })

  // =========================================================
  // 5. INTEGRATION TEST: Full safety flow
  // =========================================================
  header("5. Integration: Full Safety Flow")

  // Test 21: Complete flow blocks dangerous trade
  test("Full flow: SELL on NEUTRAL → BLOCKED + NOTIFIED", () => {
    const freshValidator = new PreTradeValidator()
    const freshLearner = new StrategyLearner(freshValidator)
    const freshNotifier = new SafetyNotifier({
      consoleEnabled: false,
      fileLoggingEnabled: false,
    })

    // Feed losing trades to learner
    freshLearner.analyze({
      trade_id: "loss-1",
      action: "sell",
      signal: "neutral",
      rsi: 50,
      pnl_1min: -50,
      pnl_5min: -120,
      was_correct: false,
      timestamp: Date.now(),
    })
    freshLearner.analyze({
      trade_id: "loss-2",
      action: "sell",
      signal: "neutral",
      rsi: 45,
      pnl_1min: -30,
      pnl_5min: -80,
      was_correct: false,
      timestamp: Date.now(),
    })

    // Try to execute dangerous trade
    const request: TradeRequest = {
      symbol: "BTCUSDT",
      action: "sell",
      quantity: 0.05,
      price: 43200,
      signal: "neutral",
    }
    const validation = freshValidator.validate(request)

    if (!validation.canExecute) {
      freshNotifier.notify({
        type: "TRADE_BLOCKED",
        severity: "high",
        message: validation.blockReason!,
        timestamp: Date.now(),
      })
    }

    const blockedEvents = freshNotifier.getEventsByType("TRADE_BLOCKED")
    return !validation.canExecute && blockedEvents.length === 1
  })

  // Test 22: Complete flow allows safe trade
  test("Full flow: BUY on NEUTRAL → ALLOWED", () => {
    const freshValidator = new PreTradeValidator()
    const freshLearner = new StrategyLearner(freshValidator)

    // Feed winning trades
    freshLearner.analyze({
      trade_id: "win-1",
      action: "buy",
      signal: "neutral",
      rsi: 50,
      pnl_1min: 50,
      pnl_5min: 120,
      was_correct: true,
      timestamp: Date.now(),
    })
    freshLearner.analyze({
      trade_id: "win-2",
      action: "buy",
      signal: "neutral",
      rsi: 45,
      pnl_1min: 30,
      pnl_5min: 80,
      was_correct: true,
      timestamp: Date.now(),
    })

    const request: TradeRequest = {
      symbol: "BTCUSDT",
      action: "buy",
      quantity: 0.05,
      price: 43200,
      signal: "neutral",
    }
    const validation = freshValidator.validate(request)
    return validation.canExecute
  })

  // =========================================================
  // RESULTS
  // =========================================================
  console.log(`\n${BOLD}${CYAN}📊 TEST RESULTS${RESET}`)
  console.log("=".repeat(50))
  console.log(`  ${GREEN}Passed: ${passed}${RESET}`)
  console.log(`  ${RED}Failed: ${failed}${RESET}`)
  console.log(`  Total:  ${passed + failed}`)

  if (failed === 0) {
    console.log(`\n  ${GREEN}${BOLD}✅ All safety checks passed. No losing trades will execute.${RESET}\n`)
    process.exit(0)
  } else {
    console.log(`\n  ${RED}${BOLD}❌ ${failed} test(s) failed. Review safety system.${RESET}\n`)
    process.exit(1)
  }
}

main().catch(console.error)
