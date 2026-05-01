#!/usr/bin/env npx tsx
/**
 * LEARN COINS — Multi-Coin Self-Learning Engine
 *
 * Runs paper trades on ALL configured coins to learn their behavior,
 * generates confidence scores, and sends reports to Telegram.
 *
 * Usage:
 *   npm run learn-coins              # Run learning (20 trades/coin), send to Telegram
 *   npm run learn-coins -- --trades=10  # Override trades per coin
 *   npm run learn-coins -- --dry-run   # Run without Telegram notification
 *
 * Output:
 *   - Console: Full confidence report with all coins
 *   - File:    logs/coin-learning.json (persistent learning data)
 *   - Telegram: Formatted daily report with top picks
 *
 * For daily automation, add to crontab:
 *   0 8 * * * cd /path/to/project && npm run learn-coins >> logs/cron.log 2>&1
 */

import * as fs from "fs"
import * as path from "path"
import { MultiCoinManager } from "../lib/multi-coin-manager"
import { TelegramNotifier } from "../lib/telegram-notifier"

// Parse CLI args
const args = process.argv.slice(2)
const isDryRun = args.includes("--dry-run")
const tradesPerCoin = parseInt(args.find((a) => a.startsWith("--trades="))?.split("=")[1] || "20", 10)

async function main() {
  console.log("=".repeat(50))
  console.log("🧠 MULTI-COIN SELF-LEARNING ENGINE")
  console.log("=".repeat(50))
  console.log(`\n📊 Running ${tradesPerCoin} paper trades per coin...`)
  console.log(`📡 Telegram notifications: ${isDryRun ? "DISABLED (dry-run)" : "ENABLED"}`)
  console.log("")

  // Initialize the multi-coin manager
  const manager = new MultiCoinManager()
  const enabledCoins = manager.getEnabledCoins()
  console.log(`🪙 Coins to analyze: ${enabledCoins.length} total`)
  console.log(`   ${enabledCoins.map((c) => c.symbol).join(", ")}\n`)

  // Run learning on all coins
  const startTime = Date.now()
  const results = await manager.learnAllCoins(tradesPerCoin)
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // Get top and worst coins
  const topCoins = manager.getTopCoins(3)
  const worstCoins = manager.getWorstCoins(3)

  // Print confidence report
  console.log("\n" + manager.getConfidenceReport())

  // Save results to file
  const logDir = path.join(process.cwd(), "logs")
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }

  const logFile = path.join(logDir, "coin-learning.json")
  const existingData: Record<string, any> = fs.existsSync(logFile)
    ? JSON.parse(fs.readFileSync(logFile, "utf-8"))
    : {}

  // Merge new results with existing data
  for (const result of results) {
    existingData[result.symbol] = {
      ...result,
      lastUpdated: new Date().toISOString(),
      history: [
        ...(existingData[result.symbol]?.history || []),
        {
          timestamp: new Date().toISOString(),
          winRate: result.winRate,
          confidenceScore: result.confidenceScore,
          totalTrades: result.totalTrades,
          recommendation: result.recommendation,
        },
      ].slice(-50), // Keep last 50 entries
    }
  }

  fs.writeFileSync(logFile, JSON.stringify(existingData, null, 2))
  console.log(`\n💾 Learning data saved to: ${logFile}`)

  // Send to Telegram (always unless dry-run)
  if (!isDryRun) {
    console.log("\n📡 Sending report to Telegram...")
    const notifier = new TelegramNotifier()

    if (notifier.isEnabled()) {
      const sent = await notifier.sendCoinsReport(results, topCoins, worstCoins)
      if (sent) {
        console.log("✅ Telegram report sent successfully!")
      } else {
        console.log("❌ Failed to send Telegram report")
      }
    } else {
      console.log("⚠️ Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env")
      console.log("   TELEGRAM_BOT_TOKEN is set. You need to set TELEGRAM_CHAT_ID.")
      console.log("   Get your chat ID by messaging @userinfobot on Telegram.")
    }
  } else {
    console.log("\n📡 Skipping Telegram (dry-run mode)")
  }

  // Summary
  console.log("\n" + "=".repeat(50))
  console.log("📊 FINAL SUMMARY")
  console.log("=".repeat(50))
  console.log(`  Total coins analyzed: ${results.length}`)
  console.log(`  Trades per coin: ${tradesPerCoin}`)
  console.log(`  Total paper trades: ${results.length * tradesPerCoin}`)
  console.log(`  Time elapsed: ${elapsed}s`)

  const recommended = results.filter(
    (r) => r.recommendation === "STRONG BUY" || r.recommendation === "BUY"
  ).length
  const avoided = results.filter((r) => r.recommendation === "AVOID").length
  const neutral = results.filter((r) => r.recommendation === "NEUTRAL").length
  const insufficient = results.filter((r) => r.recommendation === "INSUFFICIENT_DATA").length

  console.log(`  🟢 Recommended: ${recommended}`)
  console.log(`  🟡 Neutral: ${neutral}`)
  console.log(`  🔴 Avoid: ${avoided}`)
  console.log(`  ⚪ Insufficient Data: ${insufficient}`)

  if (topCoins.length > 0) {
    console.log(`\n  🏆 Top 3 for clients:`)
    for (const coin of topCoins) {
      console.log(`     ${coin.symbol} — ${coin.confidenceScore}/100 confidence (${coin.winRate}% win rate)`)
    }
  }

  if (worstCoins.length > 0) {
    console.log(`\n  ⚠️  Bottom 3 to avoid:`)
    for (const coin of worstCoins) {
      console.log(`     ${coin.symbol} — ${coin.confidenceScore}/100 confidence (${coin.winRate}% win rate)`)
    }
  }

  // Cleanup
  manager.stopAll()
  console.log("\n✅ Learning complete!")
}

main().catch((error) => {
  console.error("❌ Error:", error)
  process.exit(1)
})
