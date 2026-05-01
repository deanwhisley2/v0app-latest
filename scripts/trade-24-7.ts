/**
 * TRADE 24/7 — Main Entry Point
 *
 * Starts the 24/7 automated trading system.
 * Run with: npx tsx scripts/trade-24-7.ts
 *
 * This script:
 * 1. Loads coin learning data
 * 2. Initializes the MultiCoinManager
 * 3. Starts the TradingScheduler
 * 4. Runs continuous trading cycles
 * 5. Logs performance reports
 */

import { MultiCoinManager } from "../lib/multi-coin-manager"
import { TradingScheduler } from "../lib/trading-scheduler"
import { PerformanceTracker } from "../lib/performance-tracker"
import { MarketIntelligenceEngine } from "../lib/market-intelligence"
import { FeeOptimizer } from "../lib/fee-optimizer"
import * as fs from "fs"
import * as path from "path"

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
  capital: 1000,           // Starting capital in USD
  maxDailyTrades: 20,      // Maximum trades per day
  minConfidence: 60,       // Minimum confidence score (0-100)
  cooldownMinutes: 5,      // Cooldown between trades
  cycleIntervalMinutes: 15, // How often to run a trading cycle
  tradesPerCoin: 10,       // Paper trades per coin for learning
  logFile: path.join(__dirname, "..", "logs", "trade-24-7.log"),
  performanceFile: path.join(__dirname, "..", "logs", "performance.json"),
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(message: string): void {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${message}`
  console.log(line)

  try {
    const dir = path.dirname(CONFIG.logFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.appendFileSync(CONFIG.logFile, line + "\n")
  } catch {
    // Silently fail if we can't write to log file
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║              NEXUS PRO — 24/7 TRADING               ║
║         Automated Trading System v1.0.0              ║
╚══════════════════════════════════════════════════════╝
  `)

  log("🚀 Starting 24/7 Trading System...")
  log(`   Capital: $${CONFIG.capital}`)
  log(`   Max Daily Trades: ${CONFIG.maxDailyTrades}`)
  log(`   Min Confidence: ${CONFIG.minConfidence}`)
  log(`   Cycle Interval: ${CONFIG.cycleIntervalMinutes}min`)
  log(`   Cooldown: ${CONFIG.cooldownMinutes}min`)
  log("")

  // 1. Initialize Market Intelligence
  const marketIntel = new MarketIntelligenceEngine()
  log("✅ Market Intelligence Engine initialized")
  log(marketIntel.getMarketSummary())
  log("")

  // 2. Initialize Fee Optimizer
  const feeOptimizer = new FeeOptimizer()
  log("✅ Fee Optimizer initialized")
  log(`   Maker fee: ${(feeOptimizer.getConfig().makerFee * 100).toFixed(3)}%`)
  log(`   Taker fee: ${(feeOptimizer.getConfig().takerFee * 100).toFixed(3)}%`)
  log(`   Mode: ${feeOptimizer.getConfig().useMakerOnly ? 'Maker-only (limit orders)' : 'Market orders allowed'}`)
  log("")

  // 3. Initialize Performance Tracker
  const performanceTracker = new PerformanceTracker()
  log("✅ Performance Tracker initialized")
  log("")

  // 4. Initialize MultiCoinManager (has built-in coin list)
  const multiCoinManager = new MultiCoinManager()
  log("✅ MultiCoinManager initialized")
  log(`   Total coins configured: ${multiCoinManager.getEnabledCoins().length}`)
  log("")

  // 5. Run learning phase for top coins
  log("🧠 Running learning phase...")
  log(`   Running ${CONFIG.tradesPerCoin} paper trades per coin`)
  log("")

  const enabledCoins = multiCoinManager.getEnabledCoins()
  const coinsToLearn = enabledCoins.slice(0, 8) // Learn top 8 coins

  for (const coin of coinsToLearn) {
    try {
      log(`   📊 Learning ${coin.symbol}...`)
      const result = await multiCoinManager.learnCoin(coin.symbol, CONFIG.tradesPerCoin)
      log(`   ✅ ${coin.symbol}: ${result.winRate}% win rate | Confidence: ${result.confidenceScore}/100 | ${result.recommendation}`)
    } catch (err) {
      log(`   ⚠️ Error learning ${coin.symbol}: ${err}`)
    }
  }

  log("")
  log("✅ Learning phase complete")
  log("")

  // Print confidence report
  log(multiCoinManager.getConfidenceReport())
  log("")

  // 6. Initialize Trading Scheduler
  const scheduler = new TradingScheduler(multiCoinManager, {
    capital: CONFIG.capital,
    maxDailyTrades: CONFIG.maxDailyTrades,
    minConfidenceScore: CONFIG.minConfidence,
    cooldownMinutes: CONFIG.cooldownMinutes,
    autoRestart: true,
    logToConsole: true,
  })
  log("✅ Trading Scheduler initialized")
  log("")

  // 7. Start the scheduler
  log("▶️ Starting trading cycles...")
  log("   Press Ctrl+C to stop gracefully")
  log("")

  scheduler.start(CONFIG.cycleIntervalMinutes)

  // 8. Handle graceful shutdown
  process.on("SIGINT", () => {
    log("")
    log("⏹️ Received SIGINT. Shutting down gracefully...")
    scheduler.stop()
    multiCoinManager.stopAll()

    // Print final summary
    log("")
    log(scheduler.getSummaryReport())
    log("")

    // Save performance data
    try {
      const dir = path.dirname(CONFIG.performanceFile)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(CONFIG.performanceFile, performanceTracker.exportToJson(), "utf-8")
      log(`✅ Performance data saved to ${CONFIG.performanceFile}`)
    } catch (err) {
      log(`⚠️ Could not save performance data: ${err}`)
    }

    log("👋 Goodbye!")
    process.exit(0)
  })

  // 9. Print periodic status updates
  setInterval(() => {
    const status = scheduler.getStatus()
    const dailyReport = performanceTracker.getDailyReport()

    log("")
    log("─── STATUS UPDATE ───")
    log(`   Running: ${status.running ? '🟢 YES' : '🔴 NO'}`)
    log(`   Cycles: ${status.cycleCount}`)
    log(`   Daily Trades: ${status.dailyTradeCount}/${status.maxDailyTrades}`)
    log(`   Last Trade: ${status.lastTradeAgo || 'N/A'}`)
    log(`   Session: ${status.currentSession}`)
    log(`   Today's PnL: $${dailyReport.totalPnl.toFixed(2)}`)
    log(`   Today's Win Rate: ${dailyReport.winRate}%`)
    log(`   Fee Savings: $${dailyReport.feeSavings.toFixed(2)}`)
    log("─────────────────────")
    log("")
  }, 5 * 60 * 1000) // Every 5 minutes
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("❌ Fatal error:", err)
  process.exit(1)
})
