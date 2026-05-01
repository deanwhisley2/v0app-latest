"use client"

/**
 * TRADING SCHEDULER
 *
 * 24/7 automated trading scheduler that:
 * - Runs continuous trading cycles based on market sessions
 * - Respects fee optimization (only trades when worth it)
 * - Uses market intelligence for session-aware decisions
 * - Manages cooldowns and daily trade caps
 * - Integrates with the full safety system
 *
 * This is the orchestrator that ties together:
 *   MarketIntelligenceEngine → FeeOptimizer → TradeComparisonSystem
 */

import { MarketIntelligenceEngine } from "./market-intelligence"
import { FeeOptimizer } from "./fee-optimizer"
import { TradeComparisonSystem } from "./trade-comparison-engine"
import { MultiCoinManager } from "./multi-coin-manager"

export interface SchedulerConfig {
  capital: number
  maxDailyTrades: number
  minConfidenceScore: number
  cooldownMinutes: number
  autoRestart: boolean
  logToConsole: boolean
}

export interface TradeCycleResult {
  cycleId: number
  timestamp: string
  session: string
  tradesAttempted: number
  tradesExecuted: number
  tradesBlocked: number
  totalPnl: number
  errors: string[]
  durationMs: number
}

export class TradingScheduler {
  private marketIntel: MarketIntelligenceEngine
  private feeOptimizer: FeeOptimizer
  private multiCoinManager: MultiCoinManager
  private config: SchedulerConfig
  private isRunning: boolean = false
  private cycleCount: number = 0
  private dailyTradeCount: number = 0
  private lastTradeTimestamp: number = 0
  private cycleResults: TradeCycleResult[] = []
  private intervalId: ReturnType<typeof setInterval> | null = null

  constructor(
    multiCoinManager: MultiCoinManager,
    config?: Partial<SchedulerConfig>
  ) {
    this.marketIntel = new MarketIntelligenceEngine()
    this.feeOptimizer = new FeeOptimizer()
    this.multiCoinManager = multiCoinManager
    this.config = {
      capital: 1000,
      maxDailyTrades: 20,
      minConfidenceScore: 60,
      cooldownMinutes: 5,
      autoRestart: true,
      logToConsole: true,
      ...config,
    }
  }

  /**
   * Start the 24/7 trading scheduler.
   * Runs a trading cycle every `intervalMinutes` minutes.
   */
  start(intervalMinutes: number = 15): void {
    if (this.isRunning) {
      this.log('⚠️ Scheduler is already running')
      return
    }

    this.isRunning = true
    this.log(`🚀 Trading Scheduler STARTED (interval: ${intervalMinutes}min)`)
    this.log(`   Capital: $${this.config.capital}`)
    this.log(`   Max Daily Trades: ${this.config.maxDailyTrades}`)
    this.log(`   Min Confidence: ${this.config.minConfidenceScore}`)
    this.log('')

    // Run first cycle immediately
    this.runCycle()

    // Schedule subsequent cycles
    this.intervalId = setInterval(() => {
      this.runCycle()
    }, intervalMinutes * 60 * 1000)
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.log('⏹️ Trading Scheduler STOPPED')
  }

  /**
   * Run a single trading cycle
   */
  async runCycle(): Promise<TradeCycleResult> {
    const cycleId = ++this.cycleCount
    const startTime = Date.now()
    const errors: string[] = []

    this.log(`\n🔄 CYCLE #${cycleId} — ${new Date().toISOString()}`)

    // 1. Check market conditions
    const session = this.marketIntel.getCurrentSession()
    this.log(`   Session: ${session.name} (vol: ${session.volatility}, liq: ${session.liquidity})`)

    // 2. Check if safe to trade
    const safety = this.marketIntel.isSafeToTrade(this.config.capital)
    if (!safety.safe) {
      this.log(`   ⛔ ${safety.reason}`)
      const result: TradeCycleResult = {
        cycleId,
        timestamp: new Date().toISOString(),
        session: session.name,
        tradesAttempted: 0,
        tradesExecuted: 0,
        tradesBlocked: 0,
        totalPnl: 0,
        errors: [safety.reason!],
        durationMs: Date.now() - startTime,
      }
      this.cycleResults.push(result)
      return result
    }

    // 3. Check daily trade cap
    this.resetDailyCounterIfNewDay()
    if (this.dailyTradeCount >= this.config.maxDailyTrades) {
      this.log(`   ⛔ Daily trade cap reached (${this.dailyTradeCount}/${this.config.maxDailyTrades})`)
      const result: TradeCycleResult = {
        cycleId,
        timestamp: new Date().toISOString(),
        session: session.name,
        tradesAttempted: 0,
        tradesExecuted: 0,
        tradesBlocked: 0,
        totalPnl: 0,
        errors: ['Daily trade cap reached'],
        durationMs: Date.now() - startTime,
      }
      this.cycleResults.push(result)
      return result
    }

    // 4. Check cooldown
    const cooldownMs = this.config.cooldownMinutes * 60 * 1000
    if (Date.now() - this.lastTradeTimestamp < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - (Date.now() - this.lastTradeTimestamp)) / 1000)
      this.log(`   ⏳ Cooldown active — ${remaining}s remaining`)
      const result: TradeCycleResult = {
        cycleId,
        timestamp: new Date().toISOString(),
        session: session.name,
        tradesAttempted: 0,
        tradesExecuted: 0,
        tradesBlocked: 0,
        totalPnl: 0,
        errors: [],
        durationMs: Date.now() - startTime,
      }
      this.cycleResults.push(result)
      return result
    }

    // 5. Find pre-pump opportunities
    const opportunities = await this.marketIntel.findPrePumpOpportunities()
    if (opportunities.length > 0) {
      this.log(`   🔍 Pre-pump opportunities found:`)
      for (const opp of opportunities) {
        this.log(`      ${opp.symbol}: ${opp.confidence}% confidence — ${opp.reason}`)
      }
    }

    // 6. Get top coins from MultiCoinManager
    const topCoins = this.multiCoinManager.getTopCoins(5)
    if (topCoins.length === 0) {
      this.log('   ⚠️ No coin learning data available yet — run learn-coins first')
      const result: TradeCycleResult = {
        cycleId,
        timestamp: new Date().toISOString(),
        session: session.name,
        tradesAttempted: 0,
        tradesExecuted: 0,
        tradesBlocked: 0,
        totalPnl: 0,
        errors: ['No learning data'],
        durationMs: Date.now() - startTime,
      }
      this.cycleResults.push(result)
      return result
    }

    // 7. Execute trades for top coins
    let tradesAttempted = 0
    let tradesExecuted = 0
    let tradesBlocked = 0
    let totalPnl = 0

    for (const coin of topCoins) {
      // Check daily cap
      if (this.dailyTradeCount >= this.config.maxDailyTrades) break

      // Apply time-based confidence adjustment
      const adjustedConfidence = this.marketIntel.getTimeBasedConfidence(coin.confidenceScore)
      if (adjustedConfidence < this.config.minConfidenceScore) {
        this.log(`   ⏭️ ${coin.symbol}: confidence ${Math.round(adjustedConfidence)} < ${this.config.minConfidenceScore} (min)`)
        continue
      }

      // Check if trade is worth fees
      const tradeValue = this.config.capital * 0.02 // 2% per trade
      if (!this.feeOptimizer.isWorthFees(coin.avgPnl / tradeValue)) {
        this.log(`   ⏭️ ${coin.symbol}: expected profit too low vs fees`)
        continue
      }

      // Execute trade
      tradesAttempted++
      const system = this.multiCoinManager.getSystem(coin.symbol)
      const basePrice = this.getBasePrice(coin.symbol)
      const action = coin.winRate > 50 ? 'buy' : 'sell'
      const quantity = (tradeValue / basePrice) * this.marketIntel.getPositionSizeMultiplier()

      const result = system.executeTradeWithSafety(
        coin.symbol,
        action,
        Math.round(quantity * 10000) / 10000,
        basePrice,
        {
          rsi: 50 + (Math.random() - 0.5) * 20,
          signal: action === 'buy' ? 'bullish' : 'bearish',
          latency_ms: Math.floor(Math.random() * 200) + 50,
          portfolio_value: this.config.capital,
        }
      )

      if (result.executed) {
        tradesExecuted++
        this.dailyTradeCount++
        this.lastTradeTimestamp = Date.now()

        // Simulate outcome
        const isProfitable = Math.random() < 0.6
        const priceMove = basePrice * (isProfitable ? 0.002 : -0.002) * (1 + Math.random() * 0.5)
        system.evaluateTrade(result.trade!.trade_id, basePrice + priceMove, basePrice + priceMove * 1.5)
        system.analyzeTradeResult(result.trade!.trade_id)

        const pnl = isProfitable ? Math.random() * 5 : -Math.random() * 3
        totalPnl += pnl

        this.log(`   ✅ ${coin.symbol}: ${action.toUpperCase()} ${quantity.toFixed(4)} @ $${basePrice} | PnL: $${pnl.toFixed(2)}`)
      } else {
        tradesBlocked++
        this.log(`   🚫 ${coin.symbol}: BLOCKED — ${result.blockReason || result.guardrailReason || 'Unknown'}`)
      }
    }

    // 8. Log cycle summary
    const durationMs = Date.now() - startTime
    this.log(`\n   📊 CYCLE #${cycleId} SUMMARY:`)
    this.log(`      Attempted: ${tradesAttempted} | Executed: ${tradesExecuted} | Blocked: ${tradesBlocked}`)
    this.log(`      Total PnL: $${totalPnl.toFixed(2)} | Duration: ${durationMs}ms`)
    this.log(`      Daily Trades: ${this.dailyTradeCount}/${this.config.maxDailyTrades}`)

    const result: TradeCycleResult = {
      cycleId,
      timestamp: new Date().toISOString(),
      session: session.name,
      tradesAttempted,
      tradesExecuted,
      tradesBlocked,
      totalPnl: Math.round(totalPnl * 100) / 100,
      errors,
      durationMs,
    }

    this.cycleResults.push(result)
    return result
  }

  /**
   * Get the scheduler's current status
   */
  getStatus(): {
    running: boolean
    cycleCount: number
    dailyTradeCount: number
    maxDailyTrades: number
    lastTradeAgo: string | null
    currentSession: string
  } {
    const lastTradeAgo = this.lastTradeTimestamp > 0
      ? `${Math.floor((Date.now() - this.lastTradeTimestamp) / 1000)}s ago`
      : null

    return {
      running: this.isRunning,
      cycleCount: this.cycleCount,
      dailyTradeCount: this.dailyTradeCount,
      maxDailyTrades: this.config.maxDailyTrades,
      lastTradeAgo,
      currentSession: this.marketIntel.getCurrentSession().name,
    }
  }

  /**
   * Get recent cycle results
   */
  getRecentCycles(n: number = 10): TradeCycleResult[] {
    return this.cycleResults.slice(-n)
  }

  /**
   * Get a summary report of all cycles
   */
  getSummaryReport(): string {
    if (this.cycleResults.length === 0) return 'No cycles run yet.'

    const totalAttempted = this.cycleResults.reduce((s, r) => s + r.tradesAttempted, 0)
    const totalExecuted = this.cycleResults.reduce((s, r) => s + r.tradesExecuted, 0)
    const totalBlocked = this.cycleResults.reduce((s, r) => s + r.tradesBlocked, 0)
    const totalPnl = this.cycleResults.reduce((s, r) => s + r.totalPnl, 0)
    const avgDuration = this.cycleResults.reduce((s, r) => s + r.durationMs, 0) / this.cycleResults.length

    return [
      `📊 SCHEDULER SUMMARY (${this.cycleResults.length} cycles)`,
      `================================`,
      `Status: ${this.isRunning ? '🟢 RUNNING' : '⏹️ STOPPED'}`,
      `Total Cycles: ${this.cycleResults.length}`,
      `Total Trades Attempted: ${totalAttempted}`,
      `Total Trades Executed: ${totalExecuted}`,
      `Total Trades Blocked: ${totalBlocked}`,
      `Total PnL: $${totalPnl.toFixed(2)}`,
      `Avg Cycle Duration: ${Math.round(avgDuration)}ms`,
      `Daily Trades: ${this.dailyTradeCount}/${this.config.maxDailyTrades}`,
      `Current Session: ${this.marketIntel.getCurrentSession().name}`,
    ].join('\n')
  }

  /**
   * Reset daily counter if a new day has started
   */
  private resetDailyCounterIfNewDay(): void {
    // Simple check: if last cycle was on a different day
    if (this.cycleResults.length > 0) {
      const lastCycleDate = this.cycleResults[this.cycleResults.length - 1].timestamp.slice(0, 10)
      const today = new Date().toISOString().slice(0, 10)
      if (lastCycleDate !== today) {
        this.dailyTradeCount = 0
        this.log('   📅 New day — daily trade counter reset')
      }
    }
  }

  /**
   * Get base price for a coin
   */
  private getBasePrice(symbol: string): number {
    const prices: Record<string, number> = {
      BTCUSDT: 67500,
      ETHUSDT: 3450,
      SOLUSDT: 145,
      BNBUSDT: 580,
      ADAUSDT: 0.45,
      DOGEUSDT: 0.12,
      XRPUSDT: 0.55,
      AVAXUSDT: 35,
      DOTUSDT: 7.20,
      LINKUSDT: 14.50,
      PEPEUSDT: 0.000012,
      WIFUSDT: 2.50,
      BONKUSDT: 0.000025,
      FLOKIUSDT: 0.00018,
      SHIBUSDT: 0.000025,
      MEMEUSDT: 0.015,
      MYROUSDT: 0.15,
      BOMEUSDT: 0.012,
      MEWUSDT: 0.005,
      POPCATUSDT: 0.80,
      MOGUSDT: 0.000002,
      TURBOUSDT: 0.004,
      COQUSDT: 0.000003,
      SAMOUSDT: 0.008,
      KISHUUSDT: 0.000000001,
    }
    return prices[symbol] || 100
  }

  /**
   * Log to console if enabled
   */
  private log(message: string): void {
    if (this.config.logToConsole) {
      console.log(message)
    }
  }
}
