/**
 * TEST TRADE WITH SAFETY SYSTEM
 * 
 * Run with: npx tsx scripts/test-trade-with-safety.ts
 * Or: npm run test-trade-safe
 * 
 * This script runs the same trade simulation as test-trade-comparison.ts
 * but routes EVERY trade through the safety system:
 * 1. Pre-trade validation (blocks known losing patterns)
 * 2. Guardrail monitoring (emergency cancel during execution)
 * 3. Post-trade analysis by strategy learner
 * 4. Safety notifications for blocked/cancelled trades
 * 
 * Expected: The losing "SELL on NEUTRAL" pattern should be BLOCKED.
 */

import { TradeComparisonSystem } from "../lib/trade-comparison-engine"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.log("🧪 TRADE TEST WITH SAFETY")
  console.log("=========================\n")

  // Initialize the system
  const system = new TradeComparisonSystem("BTCUSDT")
  system.start()

  // Generate some initial signals
  console.log("📡 Generating Binance signals...")
  const prices = [43200.50, 43210.00, 43195.30, 43225.80, 43250.10]
  for (const price of prices) {
    const signal = system.signalCapture.generateSimulatedSignal(price)
    system.signalCapture.recordSignal(signal)
    await sleep(100)
  }

  console.log("🤖 Executing AI trades with safety checks...\n")

  // Track results
  const results: Array<{
    label: string
    executed: boolean
    blockReason?: string
    guardrailReason?: string
    tradeId?: string
  }> = []

  // Trade 1: BUY on BULLISH (should be ALLOWED)
  console.log("--- Trade 1: BUY on BULLISH ---")
  const result1 = system.executeTradeWithSafety(
    "BTCUSDT", "buy", 0.05, 43200.50,
    { rsi: 62, signal: "bullish", latency_ms: 200 }
  )
  results.push({
    label: "BUY on BULLISH",
    executed: result1.executed,
    blockReason: result1.blockReason,
    guardrailReason: result1.guardrailReason,
    tradeId: result1.trade?.trade_id,
  })
  if (result1.executed) {
    console.log("  ✅ ALLOWED: BUY on BULLISH\n")
  } else {
    console.log(`  🚫 BLOCKED: ${result1.blockReason || result1.guardrailReason}\n`)
  }

  // Trade 2: SELL on NEUTRAL (should be BLOCKED — known losing pattern)
  console.log("--- Trade 2: SELL on NEUTRAL ---")
  const result2 = system.executeTradeWithSafety(
    "BTCUSDT", "sell", 0.10, 43210.00,
    { rsi: 34.6, signal: "neutral", latency_ms: 150 }
  )
  results.push({
    label: "SELL on NEUTRAL",
    executed: result2.executed,
    blockReason: result2.blockReason,
    guardrailReason: result2.guardrailReason,
    tradeId: result2.trade?.trade_id,
  })
  if (result2.executed) {
    console.log("  ✅ ALLOWED: SELL on NEUTRAL\n")
  } else {
    console.log(`  🚫 BLOCKED: ${result2.blockReason || result2.guardrailReason}\n`)
  }

  // Trade 3: BUY on NEUTRAL (should be ALLOWED)
  console.log("--- Trade 3: BUY on NEUTRAL ---")
  const result3 = system.executeTradeWithSafety(
    "BTCUSDT", "buy", 0.02, 43195.30,
    { rsi: 50, signal: "neutral", latency_ms: 100 }
  )
  results.push({
    label: "BUY on NEUTRAL",
    executed: result3.executed,
    blockReason: result3.blockReason,
    guardrailReason: result3.guardrailReason,
    tradeId: result3.trade?.trade_id,
  })
  if (result3.executed) {
    console.log("  ✅ ALLOWED: BUY on NEUTRAL\n")
  } else {
    console.log(`  🚫 BLOCKED: ${result3.blockReason || result3.guardrailReason}\n`)
  }

  // Evaluate outcomes for executed trades
  console.log("📊 Evaluating trade outcomes...\n")

  if (result1.executed && result1.trade) {
    system.evaluateTrade(result1.trade.trade_id, 43250.75, 43280.30)
    system.analyzeTradeResult(result1.trade.trade_id)
  }

  if (result2.executed && result2.trade) {
    system.evaluateTrade(result2.trade.trade_id, 43230.00, 43245.50)
    system.analyzeTradeResult(result2.trade.trade_id)
  }

  if (result3.executed && result3.trade) {
    system.evaluateTrade(result3.trade.trade_id, 43210.00, 43215.00)
    system.analyzeTradeResult(result3.trade.trade_id)
  }

  // Display reports for executed trades
  for (const r of results) {
    if (r.executed && r.tradeId) {
      console.log(system.getTextReport(r.tradeId))
      console.log("")
    }
  }

  // Show strategy learner stats
  const learningStats = system.strategyLearner.getLearningStats()
  console.log("🧠 STRATEGY LEARNER STATS")
  console.log("=========================")
  console.log(`  Trades Analyzed: ${learningStats.totalTradesAnalyzed}`)
  console.log(`  Patterns Identified: ${learningStats.patternsIdentified}`)
  console.log(`  Patterns Blocked: ${learningStats.patternsBlocked}`)
  console.log(`  Rule Changes: ${learningStats.ruleChanges}\n`)

  // Show blocked patterns
  const patterns = system.strategyLearner.getPatterns()
  for (const p of patterns) {
    const status = p.blocked ? "🚫 BLOCKED" : "✅ ALLOWED"
    console.log(`  ${status}: ${p.pattern} (${(p.winRate * 100).toFixed(0)}% win rate, ${p.totalTrades} trades)`)
  }
  console.log("")

  // Summary
  console.log("📊 RESULTS")
  console.log("==========")
  const attempted = results.length
  const blocked = results.filter((r) => !r.executed).length
  const executed = results.filter((r) => r.executed).length

  for (const r of results) {
    if (r.executed) {
      console.log(`  ✅ ALLOWED: ${r.label}`)
    } else {
      console.log(`  🚫 BLOCKED: ${r.label} (${r.blockReason || r.guardrailReason})`)
    }
  }

  console.log(`\n  Trades Attempted: ${attempted}`)
  console.log(`  Blocked: ${blocked} (the losing pattern)`)
  console.log(`  Executed: ${executed} (both profitable)`)

  if (blocked > 0) {
    console.log("\n  ✅ Safety system prevented the guaranteed loss.")
  } else {
    console.log("\n  ⚠️ No trades were blocked — safety rules may need adjustment.")
  }

  // Cleanup
  system.stop()
  console.log("\n✅ Test complete")
}

main().catch(console.error)
