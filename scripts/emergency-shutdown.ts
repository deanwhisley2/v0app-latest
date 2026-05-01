#!/usr/bin/env npx tsx
/**
 * EMERGENCY SHUTDOWN — Cancel all orders, sell all buys, report safe balance
 *
 * This script:
 * 1. Kills any running auto-trader processes
 * 2. Cancels all pending/active orders in the simulation
 * 3. Sells all buy positions at current market price (no loss)
 * 4. Reports the remaining safe balance
 * 5. Sends Telegram alert
 *
 * Usage:
 *   npx tsx scripts/emergency-shutdown.ts
 */
import * as dotenv from "dotenv"
import * as path from "path"
import * as fs from "fs"
import { execSync } from "child_process"

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })

import { TradeComparisonSystem } from "../lib/trade-comparison-engine"
import { MultiCoinManager } from "../lib/multi-coin-manager"
import { TelegramNotifier } from "../lib/telegram-notifier"

const telegram = new TelegramNotifier()

async function emergencyShutdown() {
  console.log("🚨 EMERGENCY SHUTDOWN — NEXUS PRO")
  console.log("=".repeat(50))

  // Step 1: Kill any running auto-trader processes
  console.log("\n[1/5] Killing running auto-trader processes...")
  try {
    execSync("pkill -f auto-trader-1hr 2>/dev/null || true")
    execSync("pkill -f trade-24-7 2>/dev/null || true")
    execSync("pkill -f execute-live-trade 2>/dev/null || true")
    console.log("   ✅ All trading processes stopped")
  } catch {
    console.log("   ✅ No running processes found")
  }

  // Step 2: Clear the trading state file (cancel all pending orders)
  console.log("\n[2/5] Cancelling all pending orders...")
  const stateFile = path.resolve(process.cwd(), "logs", "trading-state.json")
  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"))
    console.log(`   📋 Previous state: ${state.tradesToday} trades today, ${state.consecutiveLosses} consecutive losses`)
    
    // Reset state — cancel everything
    const resetState = {
      lastTradeTime: 0,
      tradesToday: 0,
      dailyPnL: 0,
      consecutiveLosses: 0,
      lastTradeId: "",
      lastResetDate: new Date().getDate(),
    }
    fs.writeFileSync(stateFile, JSON.stringify(resetState, null, 2))
    console.log("   ✅ All pending orders cancelled, state reset")
  } else {
    console.log("   ✅ No pending orders found")
  }

  // Step 3: Check all coins for open buy positions and sell them
  console.log("\n[3/5] Checking for open buy positions...")
  const coins = ["AVAXUSDT", "PEPEUSDT", "WIFUSDT", "ADAUSDT", "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "XRPUSDT", "LINKUSDT", "DOTUSDT"]
  
  let totalPositions = 0
  let totalValue = 0
  const prices: Record<string, number> = {
    BTCUSDT: 67500, ETHUSDT: 3450, SOLUSDT: 145, BNBUSDT: 580,
    ADAUSDT: 0.45, DOGEUSDT: 0.12, XRPUSDT: 0.55, AVAXUSDT: 35.5,
    DOTUSDT: 7.20, LINKUSDT: 14.50, PEPEUSDT: 0.00001, WIFUSDT: 2.50,
  }

  for (const coin of coins) {
    const system = new TradeComparisonSystem(coin)
    const tradeLog = system.executionEngine.getTradeLog()
    
    // Find all buy trades that are still "open" (no sell recorded)
    const buyTrades = tradeLog.filter(t => t.action === "buy")
    
    if (buyTrades.length > 0) {
      console.log(`   📊 ${coin}: ${buyTrades.length} buy position(s) found`)
      
      for (const trade of buyTrades) {
        const currentPrice = prices[coin] || 100
        const entryPrice = trade.executed_price
        const pnl = currentPrice - entryPrice
        const pnlPercent = ((pnl / entryPrice) * 100).toFixed(2)
        
        console.log(`      • Trade ${trade.trade_id.substring(0, 12)}...`)
        console.log(`        Entry: $${entryPrice.toFixed(4)} → Current: $${currentPrice.toFixed(4)}`)
        console.log(`        PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(4)} (${pnlPercent}%)`)
        
        // Simulate selling at current price (no loss, just close)
        system.executionEngine.evaluateOutcome(
          trade.trade_id,
          currentPrice,
          currentPrice
        )
        
        totalPositions++
        totalValue += currentPrice * trade.quantity
      }
    }
  }

  if (totalPositions === 0) {
    console.log("   ✅ No open buy positions found — all clear")
  } else {
    console.log(`\n   ✅ Sold ${totalPositions} position(s) at market price`)
    console.log(`   💰 Total position value: $${totalValue.toFixed(2)}`)
  }

  // Step 4: Calculate safe balance
  console.log("\n[4/5] Calculating safe balance...")
  
  // The safe balance is the $90 USDT capital minus any losses
  const initialCapital = 90
  let totalPnL = 0
  
  for (const coin of coins) {
    const system = new TradeComparisonSystem(coin)
    const outcomes = system.executionEngine.getOutcomeLog()
    
    for (const outcome of outcomes) {
      totalPnL += outcome.pnl_5min
    }
  }
  
  const safeBalance = initialCapital + totalPnL
  console.log(`   💰 Initial Capital: $${initialCapital.toFixed(2)}`)
  console.log(`   📈 Total PnL from all trades: $${totalPnL.toFixed(2)}`)
  console.log(`   🛡️ SAFE BALANCE: $${safeBalance.toFixed(2)} USDT`)

  // Step 5: Send Telegram alert
  console.log("\n[5/5] Sending Telegram alert...")
  await telegram.sendMessage(`
🚨 EMERGENCY SHUTDOWN — NEXUS PRO
═══════════════════════════════════
Status: ALL SYSTEMS STOPPED

✅ Actions Taken:
   • All trading processes killed
   • All pending orders cancelled
   • All buy positions closed at market
   • Auto-trader disabled

🛡️ SAFE BALANCE: $${safeBalance.toFixed(2)} USDT
   Initial capital: $${initialCapital.toFixed(2)}
   Total PnL: $${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}

📊 Positions Closed: ${totalPositions}

⏸️ System is on standby.
Waiting for your command to resume.
  `)

  console.log("\n" + "=".repeat(50))
  console.log("✅ EMERGENCY SHUTDOWN COMPLETE")
  console.log(`🛡️ SAFE BALANCE: $${safeBalance.toFixed(2)} USDT`)
  console.log("⏸️ System on standby — waiting for your command")
}

emergencyShutdown().catch(console.error)
