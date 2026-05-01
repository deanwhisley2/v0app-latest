"use client"

/**
 * PERFORMANCE TRACKER
 *
 * Tracks and reports on the 24/7 trading system's performance.
 * Logs every trade, cycle, and session to a structured log file.
 * Generates daily/weekly/monthly performance reports.
 */

export interface TradeLogEntry {
  timestamp: string
  cycleId: number
  symbol: string
  action: 'buy' | 'sell'
  quantity: number
  price: number
  pnl: number
  session: string
  confidence: number
  latencyMs: number
  blocked: boolean
  blockReason?: string
}

export interface DailyReport {
  date: string
  totalTrades: number
  executedTrades: number
  blockedTrades: number
  totalPnl: number
  winRate: number
  bestTrade: number
  worstTrade: number
  avgConfidence: number
  sessions: Record<string, number>
  feeSavings: number
}

export class PerformanceTracker {
  private tradeLog: TradeLogEntry[] = []
  private readonly MAX_LOG_SIZE = 50000

  /**
   * Log a trade entry
   */
  logTrade(entry: TradeLogEntry): void {
    this.tradeLog.push(entry)
    if (this.tradeLog.length > this.MAX_LOG_SIZE) {
      this.tradeLog.shift()
    }
  }

  /**
   * Get today's performance report
   */
  getDailyReport(): DailyReport {
    const today = new Date().toISOString().slice(0, 10)
    const todayTrades = this.tradeLog.filter((t) => t.timestamp.slice(0, 10) === today)

    const executed = todayTrades.filter((t) => !t.blocked)
    const blocked = todayTrades.filter((t) => t.blocked)
    const profitable = executed.filter((t) => t.pnl > 0)
    const losses = executed.filter((t) => t.pnl < 0)

    const totalPnl = executed.reduce((sum, t) => sum + t.pnl, 0)
    const winRate = executed.length > 0 ? (profitable.length / executed.length) * 100 : 0
    const bestTrade = executed.length > 0 ? Math.max(...executed.map((t) => t.pnl)) : 0
    const worstTrade = executed.length > 0 ? Math.min(...executed.map((t) => t.pnl)) : 0
    const avgConfidence = executed.length > 0
      ? executed.reduce((sum, t) => sum + t.confidence, 0) / executed.length
      : 0

    // Count trades per session
    const sessions: Record<string, number> = {}
    for (const trade of todayTrades) {
      sessions[trade.session] = (sessions[trade.session] || 0) + 1
    }

    // Fee savings (maker vs taker)
    const feeSavings = executed.reduce((sum, t) => {
      const tradeValue = t.price * t.quantity
      return sum + tradeValue * (0.0010 - 0.00075) * 2 // taker - maker * 2 sides
    }, 0)

    return {
      date: today,
      totalTrades: todayTrades.length,
      executedTrades: executed.length,
      blockedTrades: blocked.length,
      totalPnl: Math.round(totalPnl * 100) / 100,
      winRate: Math.round(winRate * 10) / 10,
      bestTrade: Math.round(bestTrade * 100) / 100,
      worstTrade: Math.round(worstTrade * 100) / 100,
      avgConfidence: Math.round(avgConfidence * 10) / 10,
      sessions,
      feeSavings: Math.round(feeSavings * 100) / 100,
    }
  }

  /**
   * Get weekly performance report
   */
  getWeeklyReport(): string {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const weekTrades = this.tradeLog.filter(
      (t) => new Date(t.timestamp) >= weekAgo
    )

    const executed = weekTrades.filter((t) => !t.blocked)
    const profitable = executed.filter((t) => t.pnl > 0)
    const totalPnl = executed.reduce((sum, t) => sum + t.pnl, 0)
    const winRate = executed.length > 0 ? (profitable.length / executed.length) * 100 : 0

    // Group by day
    const dailyPnl: Record<string, number> = {}
    for (const trade of executed) {
      const day = trade.timestamp.slice(0, 10)
      dailyPnl[day] = (dailyPnl[day] || 0) + trade.pnl
    }

    const lines = [
      `📈 WEEKLY PERFORMANCE REPORT`,
      `=============================`,
      `Period: ${weekAgo.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`,
      `Total Trades: ${weekTrades.length}`,
      `Executed: ${executed.length}`,
      `Blocked: ${weekTrades.length - executed.length}`,
      `Win Rate: ${winRate.toFixed(1)}%`,
      `Total PnL: $${totalPnl.toFixed(2)}`,
      ``,
      `── Daily PnL ──`,
    ]

    for (const [day, pnl] of Object.entries(dailyPnl).sort()) {
      const emoji = pnl >= 0 ? '🟢' : '🔴'
      lines.push(`  ${emoji} ${day}: $${pnl.toFixed(2)}`)
    }

    return lines.join('\n')
  }

  /**
   * Get all trade logs
   */
  getTradeLog(): TradeLogEntry[] {
    return [...this.tradeLog]
  }

  /**
   * Get recent trades
   */
  getRecentTrades(n: number = 20): TradeLogEntry[] {
    return this.tradeLog.slice(-n)
  }

  /**
   * Export trade log as JSON string
   */
  exportToJson(): string {
    return JSON.stringify(this.tradeLog, null, 2)
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.tradeLog.length = 0
  }
}
