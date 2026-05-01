/**
 * TEST TRADE COMPARISON
 * 
 * Run with: npx tsx scripts/test-trade-comparison.ts
 * Or: npm run test-trade
 * 
 * This script simulates a live battlefield feedback loop:
 * 1. Generates Binance-like signals
 * 2. Executes AI trades with realistic latency
 * 3. Evaluates post-trade outcomes
 * 4. Spits out the comparison report
 */

import { TradeComparisonSystem } from "../lib/trade-comparison-engine"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.log("🚀 TRADE COMPARISON TEST")
  console.log("========================\n")

  // Initialize the system
  const system = new TradeComparisonSystem("BTCUSDT")
  system.start()

  // Generate some initial signals
  console.log("📡 Generating Binance signals...")
  const prices = [43200.50, 43210.00, 43195.30, 43225.80, 43250.10]
  for (const price of prices) {
    const signal = system.signalCapture.generateSimulatedSignal(price)
    system.signalCapture.recordSignal(signal)
    await sleep(100) // Small delay between signals
  }

  console.log("🤖 Executing AI trades...\n")

  // Simulate a few trades with different scenarios
  const trades = [
    // Trade 1: Fast execution, bullish match
    system.executeTrade("BTCUSDT", "buy", 0.05, 43200.50),
    // Trade 2: Slower execution (higher latency)
    system.executeTrade("BTCUSDT", "sell", 0.10, 43210.00),
    // Trade 3: Neutral signal, buy action
    system.executeTrade("BTCUSDT", "buy", 0.02, 43195.30),
  ]

  // Manually evaluate outcomes (simulating 1min and 5min price movements)
  console.log("📊 Evaluating trade outcomes...\n")

  // Trade 1: Profitable (price went up)
  system.evaluateTrade(trades[0].trade_id, 43250.75, 43280.30)
  
  // Trade 2: Loss (price went up, but we sold)
  system.evaluateTrade(trades[1].trade_id, 43230.00, 43245.50)
  
  // Trade 3: Slight profit
  system.evaluateTrade(trades[2].trade_id, 43210.00, 43215.00)

  // Generate and display reports
  for (const trade of trades) {
    console.log(system.getTextReport(trade.trade_id))
    console.log("")
  }

  // Generate statistics
  console.log(system.getStatisticsReport())
  console.log("")

  // Cleanup
  system.stop()
  console.log("✅ Test complete")
}

main().catch(console.error)
