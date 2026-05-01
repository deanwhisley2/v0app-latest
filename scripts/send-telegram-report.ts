#!/usr/bin/env npx tsx
/**
 * Send the latest coin learning report to Telegram
 * Uses the already-saved data from logs/coin-learning.json
 */
import * as fs from "fs"
import * as path from "path"
import { TelegramNotifier } from "../lib/telegram-notifier"
import type { CoinLearningResult } from "../lib/multi-coin-manager"

async function main() {
  console.log("📡 Sending coin report to Telegram...")

  // Load saved learning data
  const logFile = path.join(process.cwd(), "logs", "coin-learning.json")
  if (!fs.existsSync(logFile)) {
    console.error("❌ No learning data found. Run 'npm run learn-coins' first.")
    process.exit(1)
  }

  const data = JSON.parse(fs.readFileSync(logFile, "utf-8"))
  const results: CoinLearningResult[] = Object.values(data).map((entry: any) => ({
    symbol: entry.symbol,
    totalTrades: entry.totalTrades,
    wins: entry.wins,
    losses: entry.losses,
    winRate: entry.winRate,
    avgPnl: entry.avgPnl,
    avgLatencyMs: entry.avgLatencyMs,
    directionMatchRate: entry.directionMatchRate,
    patternsIdentified: entry.patternsIdentified,
    patternsBlocked: entry.patternsBlocked,
    confidenceScore: entry.confidenceScore,
    recommendation: entry.recommendation,
    learnedPatterns: entry.learnedPatterns || [],
  }))

  // Sort by confidence descending
  const sorted = [...results].sort((a, b) => b.confidenceScore - a.confidenceScore)

  // Top 3
  const topCoins = sorted.filter((r) => r.totalTrades >= 3).slice(0, 3)
  // Worst 3
  const worstCoins = [...sorted].filter((r) => r.totalTrades >= 3).sort((a, b) => a.confidenceScore - b.confidenceScore).slice(0, 3)

  console.log(`📊 Loaded ${results.length} coins from learning data`)
  console.log(`🏆 Top: ${topCoins.map(c => c.symbol).join(", ")}`)
  console.log(`⚠️  Worst: ${worstCoins.map(c => c.symbol).join(", ")}`)

  // Send to Telegram
  const notifier = new TelegramNotifier()
  if (!notifier.isEnabled()) {
    console.error("❌ Telegram not configured. Check .env.local file.")
    console.error("   TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set.")
    process.exit(1)
  }

  const sent = await notifier.sendCoinsReport(results, topCoins, worstCoins)
  if (sent) {
    console.log("✅ Telegram report sent successfully!")
  } else {
    console.log("❌ Failed to send Telegram report")
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("❌ Error:", error)
  process.exit(1)
})
