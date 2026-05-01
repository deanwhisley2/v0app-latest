"use client"

/**
 * Backtesting Engine
 * Simulates trading strategies against historical data
 * Provides detailed performance metrics and trade logs
 */

import { coinsData, type Coin } from "./coins-data"
import { fetchHistoricalData, type OHLCV } from "./market-data"
import { tradingStrategies, type Strategy } from "./trading-strategies"

// ============================================================
// Types
// ============================================================

export type BacktestOrderSide = "buy" | "sell"

export interface BacktestOrder {
  timestamp: number
  side: BacktestOrderSide
  price: number
  quantity: number
  total: number
  reason: string
  strategyName: string
}

export interface BacktestPosition {
  entryTimestamp: number
  entryPrice: number
  exitTimestamp: number | null
  exitPrice: number | null
  quantity: number
  side: "long" | "short"
  pnl: number
  pnlPercentage: number
  holdingPeriod: number // in hours
  strategyName: string
}

export interface BacktestMetrics {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  totalPnl: number
  totalPnlPercentage: number
  maxDrawdown: number
  maxDrawdownPercentage: number
  sharpeRatio: number
  profitFactor: number
  averageWin: number
  averageLoss: number
  largestWin: number
  largestLoss: number
  averageHoldingPeriod: number
  totalFees: number
  startPrice: number
  endPrice: number
  buyAndHoldReturn: number
  strategyReturn: number
  outperformance: number
}

export interface BacktestResult {
  symbol: string
  strategyName: string
  period: string
  startDate: Date
  endDate: Date
  metrics: BacktestMetrics
  orders: BacktestOrder[]
  positions: BacktestPosition[]
  equityCurve: { timestamp: number; equity: number }[]
  ohlcvData: OHLCV[]
}

export interface BacktestConfig {
  symbol: string
  strategyName: string
  days: number
  initialCapital: number
  feeRate: number
  positionSize: number // percentage of capital per trade (0-1)
}

// ============================================================
// Default Config
// ============================================================

const DEFAULT_CONFIG: BacktestConfig = {
  symbol: "BTC",
  strategyName: "all",
  days: 30,
  initialCapital: 10000,
  feeRate: 0.001,
  positionSize: 0.25,
}

// ============================================================
// Backtesting Engine
// ============================================================

class BacktestingEngine {
  /**
   * Run a full backtest for a given symbol and strategy
   */
  async runBacktest(
    config: Partial<BacktestConfig> = {}
  ): Promise<BacktestResult> {
    const fullConfig: BacktestConfig = { ...DEFAULT_CONFIG, ...config }
    const { symbol, strategyName, days, initialCapital, feeRate, positionSize } = fullConfig

    // Fetch historical data
    const ohlcvData = await fetchHistoricalData(symbol, days)
    if (ohlcvData.length < 20) {
      throw new Error(`Insufficient historical data for ${symbol}`)
    }

    // Get the strategy
    let strategies: Strategy[]
    if (strategyName === "all") {
      strategies = tradingStrategies
    } else {
      const strategy = tradingStrategies.find((s) => s.name === strategyName)
      if (!strategy) {
        throw new Error(`Strategy "${strategyName}" not found`)
      }
      strategies = [strategy]
    }

    // Run backtest for each strategy and pick the best
    const results = await Promise.all(
      strategies.map((s) =>
        this.runSingleStrategy(s, ohlcvData, initialCapital, feeRate, positionSize, days)
      )
    )

    // Return the best result (highest P&L)
    results.sort((a, b) => b.metrics.totalPnl - a.metrics.totalPnl)
    const bestResult = results[0]

    // Calculate buy & hold return for comparison
    const startPrice = ohlcvData[0].close
    const endPrice = ohlcvData[ohlcvData.length - 1].close
    const buyAndHoldReturn = ((endPrice - startPrice) / startPrice) * 100

    bestResult.metrics.buyAndHoldReturn = Number(buyAndHoldReturn.toFixed(2))
    bestResult.metrics.strategyReturn = bestResult.metrics.totalPnlPercentage
    bestResult.metrics.outperformance = Number(
      (bestResult.metrics.totalPnlPercentage - buyAndHoldReturn).toFixed(2)
    )
    bestResult.metrics.startPrice = startPrice
    bestResult.metrics.endPrice = endPrice

    return bestResult
  }

  /**
   * Run backtest for a single strategy
   */
  private async runSingleStrategy(
    strategy: Strategy,
    ohlcvData: OHLCV[],
    initialCapital: number,
    feeRate: number,
    positionSize: number,
    days: number = 30
  ): Promise<BacktestResult> {
    const orders: BacktestOrder[] = []
    const positions: BacktestPosition[] = []
    const equityCurve: { timestamp: number; equity: number }[] = []

    let capital = initialCapital
    let currentPosition: {
      entryPrice: number
      entryTimestamp: number
      quantity: number
      side: "long" | "short"
    } | null = null

    let peakCapital = initialCapital
    let maxDrawdown = 0
    let maxDrawdownPercentage = 0

    // Track P&L for Sharpe ratio calculation
    const dailyReturns: number[] = []
    let previousEquity = initialCapital

    // Use a rolling window for signal generation
    const minWindow = Math.max(strategy.indicators?.length || 5, 10)

    for (let i = minWindow; i < ohlcvData.length; i++) {
      const currentCandle = ohlcvData[i]
      const window = ohlcvData.slice(0, i + 1)

      // Get historical prices for this window
      const historicalPrices = window.map((c) => c.close)
      const volumes = window.map((c) => c.volume)

      // Generate signal using the strategy
      const signal = this.generateSignal(
        strategy,
        historicalPrices,
        volumes,
        currentCandle.close
      )

      // Calculate current equity
      let currentEquity = capital
      if (currentPosition) {
        const positionValue = currentPosition.quantity * currentCandle.close
        const entryValue = currentPosition.quantity * currentPosition.entryPrice
        const unrealizedPnl =
          currentPosition.side === "long"
            ? positionValue - entryValue
            : entryValue - positionValue
        currentEquity = capital + unrealizedPnl
      }

      // Track equity curve
      equityCurve.push({
        timestamp: currentCandle.timestamp,
        equity: Number(currentEquity.toFixed(2)),
      })

      // Calculate daily return for Sharpe ratio
      if (i > minWindow) {
        const dailyReturn = (currentEquity - previousEquity) / previousEquity
        dailyReturns.push(dailyReturn)
      }
      previousEquity = currentEquity

      // Track drawdown
      if (currentEquity > peakCapital) {
        peakCapital = currentEquity
      }
      const drawdown = peakCapital - currentEquity
      const drawdownPercentage = (drawdown / peakCapital) * 100
      if (drawdownPercentage > maxDrawdownPercentage) {
        maxDrawdown = drawdown
        maxDrawdownPercentage = drawdownPercentage
      }

      // Execute signals
      if (signal === "BUY" || signal === "STRONG_BUY") {
        // Close short position if exists
        if (currentPosition && currentPosition.side === "short") {
          const exitValue = currentPosition.quantity * currentCandle.close
          const entryValue = currentPosition.quantity * currentPosition.entryPrice
          const grossPnl = entryValue - exitValue
          const fee = exitValue * feeRate
          const netPnl = grossPnl - fee

          capital += currentPosition.quantity * currentPosition.entryPrice + netPnl

          positions.push({
            entryTimestamp: currentPosition.entryTimestamp,
            entryPrice: currentPosition.entryPrice,
            exitTimestamp: currentCandle.timestamp,
            exitPrice: currentCandle.close,
            quantity: currentPosition.quantity,
            side: "short",
            pnl: Number(netPnl.toFixed(2)),
            pnlPercentage: Number(
              ((netPnl / (currentPosition.quantity * currentPosition.entryPrice)) * 100).toFixed(2)
            ),
            holdingPeriod: Number(
              (
                (currentCandle.timestamp - currentPosition.entryTimestamp) /
                (3600 * 1000)
              ).toFixed(1)
            ),
            strategyName: strategy.name,
          })

          orders.push({
            timestamp: currentCandle.timestamp,
            side: "buy",
            price: currentCandle.close,
            quantity: currentPosition.quantity,
            total: Number((currentPosition.quantity * currentCandle.close).toFixed(2)),
            reason: "Cover short - Buy signal",
            strategyName: strategy.name,
          })

          currentPosition = null
        }

        // Open long position
        if (!currentPosition) {
          const tradeCapital = capital * positionSize
          const quantity = tradeCapital / currentCandle.close
          const fee = tradeCapital * feeRate
          capital -= tradeCapital + fee

          currentPosition = {
            entryPrice: currentCandle.close,
            entryTimestamp: currentCandle.timestamp,
            quantity,
            side: "long",
          }

          orders.push({
            timestamp: currentCandle.timestamp,
            side: "buy",
            price: currentCandle.close,
            quantity,
            total: Number(tradeCapital.toFixed(2)),
            reason: "Open long - Buy signal",
            strategyName: strategy.name,
          })
        }
      } else if (signal === "SELL" || signal === "STRONG_SELL") {
        // Close long position if exists
        if (currentPosition && currentPosition.side === "long") {
          const exitValue = currentPosition.quantity * currentCandle.close
          const entryValue = currentPosition.quantity * currentPosition.entryPrice
          const grossPnl = exitValue - entryValue
          const fee = exitValue * feeRate
          const netPnl = grossPnl - fee

          capital += exitValue - fee

          positions.push({
            entryTimestamp: currentPosition.entryTimestamp,
            entryPrice: currentPosition.entryPrice,
            exitTimestamp: currentCandle.timestamp,
            exitPrice: currentCandle.close,
            quantity: currentPosition.quantity,
            side: "long",
            pnl: Number(netPnl.toFixed(2)),
            pnlPercentage: Number(
              ((netPnl / entryValue) * 100).toFixed(2)
            ),
            holdingPeriod: Number(
              (
                (currentCandle.timestamp - currentPosition.entryTimestamp) /
                (3600 * 1000)
              ).toFixed(1)
            ),
            strategyName: strategy.name,
          })

          orders.push({
            timestamp: currentCandle.timestamp,
            side: "sell",
            price: currentCandle.close,
            quantity: currentPosition.quantity,
            total: Number(exitValue.toFixed(2)),
            reason: "Close long - Sell signal",
            strategyName: strategy.name,
          })

          currentPosition = null
        }

        // Open short position
        if (!currentPosition) {
          const tradeCapital = capital * positionSize
          const quantity = tradeCapital / currentCandle.close
          const fee = tradeCapital * feeRate
          capital -= fee

          currentPosition = {
            entryPrice: currentCandle.close,
            entryTimestamp: currentCandle.timestamp,
            quantity,
            side: "short",
          }

          orders.push({
            timestamp: currentCandle.timestamp,
            side: "sell",
            price: currentCandle.close,
            quantity,
            total: Number(tradeCapital.toFixed(2)),
            reason: "Open short - Sell signal",
            strategyName: strategy.name,
          })
        }
      }
    }

    // Close any remaining position at the end
    if (currentPosition) {
      const lastCandle = ohlcvData[ohlcvData.length - 1]
      const exitValue = currentPosition.quantity * lastCandle.close
      const entryValue = currentPosition.quantity * currentPosition.entryPrice
      const grossPnl =
        currentPosition.side === "long"
          ? exitValue - entryValue
          : entryValue - exitValue
      const fee = exitValue * feeRate
      const netPnl = grossPnl - fee

      capital += currentPosition.side === "long" ? exitValue - fee : currentPosition.quantity * currentPosition.entryPrice + netPnl

      positions.push({
        entryTimestamp: currentPosition.entryTimestamp,
        entryPrice: currentPosition.entryPrice,
        exitTimestamp: lastCandle.timestamp,
        exitPrice: lastCandle.close,
        quantity: currentPosition.quantity,
        side: currentPosition.side,
        pnl: Number(netPnl.toFixed(2)),
        pnlPercentage: Number(
          ((netPnl / (currentPosition.quantity * currentPosition.entryPrice)) * 100).toFixed(2)
        ),
        holdingPeriod: Number(
          (
            (lastCandle.timestamp - currentPosition.entryTimestamp) /
            (3600 * 1000)
          ).toFixed(1)
        ),
        strategyName: strategy.name,
      })

      orders.push({
        timestamp: lastCandle.timestamp,
        side: currentPosition.side === "long" ? "sell" : "buy",
        price: lastCandle.close,
        quantity: currentPosition.quantity,
        total: Number(exitValue.toFixed(2)),
        reason: "Close position - End of backtest",
        strategyName: strategy.name,
      })
    }

    // Calculate metrics
    const totalPnl = capital - initialCapital
    const totalPnlPercentage = (totalPnl / initialCapital) * 100
    const totalTrades = positions.length
    const winningTrades = positions.filter((p) => p.pnl > 0).length
    const losingTrades = positions.filter((p) => p.pnl <= 0).length
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0

    const wins = positions.filter((p) => p.pnl > 0).map((p) => p.pnl)
    const losses = positions.filter((p) => p.pnl <= 0).map((p) => p.pnl)
    const averageWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
    const averageLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0
    const largestWin = wins.length > 0 ? Math.max(...wins) : 0
    const largestLoss = losses.length > 0 ? Math.min(...losses) : 0

    const totalWins = wins.reduce((a, b) => a + b, 0)
    const totalLosses = Math.abs(losses.reduce((a, b) => a + b, 0))
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0

    const averageHoldingPeriod =
      positions.length > 0
        ? positions.reduce((a, b) => a + b.holdingPeriod, 0) / positions.length
        : 0

    const totalFees = orders.length * (orders.reduce((a, b) => a + b.total, 0) * feeRate)

    // Sharpe ratio (annualized, assuming daily returns)
    const avgDailyReturn =
      dailyReturns.length > 0
        ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
        : 0
    const stdDev =
      dailyReturns.length > 1
        ? Math.sqrt(
            dailyReturns.reduce(
              (a, b) => a + Math.pow(b - avgDailyReturn, 2),
              0
            ) /
              (dailyReturns.length - 1)
          )
        : 0
    const sharpeRatio =
      stdDev > 0
        ? (avgDailyReturn / stdDev) * Math.sqrt(365)
        : 0

    const metrics: BacktestMetrics = {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate: Number(winRate.toFixed(2)),
      totalPnl: Number(totalPnl.toFixed(2)),
      totalPnlPercentage: Number(totalPnlPercentage.toFixed(2)),
      maxDrawdown: Number(maxDrawdown.toFixed(2)),
      maxDrawdownPercentage: Number(maxDrawdownPercentage.toFixed(2)),
      sharpeRatio: Number(sharpeRatio.toFixed(2)),
      profitFactor: Number(
        profitFactor === Infinity ? 999 : profitFactor.toFixed(2)
      ),
      averageWin: Number(averageWin.toFixed(2)),
      averageLoss: Number(averageLoss.toFixed(2)),
      largestWin: Number(largestWin.toFixed(2)),
      largestLoss: Number(largestLoss.toFixed(2)),
      averageHoldingPeriod: Number(averageHoldingPeriod.toFixed(1)),
      totalFees: Number(totalFees.toFixed(2)),
      startPrice: ohlcvData[0].close,
      endPrice: ohlcvData[ohlcvData.length - 1].close,
      buyAndHoldReturn: 0,
      strategyReturn: Number(totalPnlPercentage.toFixed(2)),
      outperformance: 0,
    }

    return {
      symbol: ohlcvData[0]?.close
        ? coinsData.find((c) => c.symbol === "BTC")?.symbol || "UNKNOWN"
        : "UNKNOWN",
      strategyName: strategy.name,
      period: `${days} days`,
      startDate: new Date(ohlcvData[0].timestamp),
      endDate: new Date(ohlcvData[ohlcvData.length - 1].timestamp),
      metrics,
      orders,
      positions,
      equityCurve,
      ohlcvData,
    }
  }

  /**
   * Generate a trading signal from a strategy
   */
  private generateSignal(
    strategy: Strategy,
    prices: number[],
    volumes: number[],
    currentPrice: number
  ): "BUY" | "SELL" | "STRONG_BUY" | "STRONG_SELL" | "HOLD" {
    // Simple moving average crossover
    if (strategy.name.toLowerCase().includes("moving average") || strategy.name.toLowerCase().includes("ma")) {
      const fastPeriod = 10
      const slowPeriod = 30

      if (prices.length < slowPeriod) return "HOLD"

      const fastMA =
        prices.slice(-fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod
      const slowMA =
        prices.slice(-slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod

      const prevFastMA =
        prices.slice(-fastPeriod - 1, -1).reduce((a, b) => a + b, 0) / fastPeriod
      const prevSlowMA =
        prices.slice(-slowPeriod - 1, -1).reduce((a, b) => a + b, 0) / slowPeriod

      if (prevFastMA <= prevSlowMA && fastMA > slowMA) return "BUY"
      if (prevFastMA >= prevSlowMA && fastMA < slowMA) return "SELL"
      return "HOLD"
    }

    // RSI-based strategy
    if (strategy.name.toLowerCase().includes("rsi")) {
      const period = 14
      if (prices.length < period + 1) return "HOLD"

      const gains: number[] = []
      const losses: number[] = []

      for (let i = prices.length - period; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1]
        if (diff >= 0) {
          gains.push(diff)
          losses.push(0)
        } else {
          gains.push(0)
          losses.push(Math.abs(diff))
        }
      }

      const avgGain = gains.reduce((a, b) => a + b, 0) / period
      const avgLoss = losses.reduce((a, b) => a + b, 0) / period
      const rs = avgLoss > 0 ? avgGain / avgLoss : 100
      const rsi = 100 - 100 / (1 + rs)

      if (rsi < 30) return "BUY"
      if (rsi > 70) return "SELL"
      return "HOLD"
    }

    // Momentum strategy
    if (strategy.name.toLowerCase().includes("momentum")) {
      const lookback = 14
      if (prices.length < lookback + 1) return "HOLD"

      const prevPrice = prices[prices.length - lookback - 1]
      const momentum = ((currentPrice - prevPrice) / prevPrice) * 100

      if (momentum > 5) return "BUY"
      if (momentum < -5) return "SELL"
      return "HOLD"
    }

    // Bollinger Bands strategy
    if (strategy.name.toLowerCase().includes("bollinger")) {
      const period = 20
      if (prices.length < period) return "HOLD"

      const recentPrices = prices.slice(-period)
      const mean = recentPrices.reduce((a, b) => a + b, 0) / period
      const variance =
        recentPrices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period
      const stdDev = Math.sqrt(variance)

      const upperBand = mean + 2 * stdDev
      const lowerBand = mean - 2 * stdDev

      if (currentPrice <= lowerBand) return "BUY"
      if (currentPrice >= upperBand) return "SELL"
      return "HOLD"
    }

    // Default: use price trend
    const shortMA = prices.slice(-5).reduce((a, b) => a + b, 0) / 5
    const longMA = prices.slice(-20).reduce((a, b) => a + b, 0) / 20

    if (shortMA > longMA * 1.02) return "BUY"
    if (shortMA < longMA * 0.98) return "SELL"
    return "HOLD"
  }

  /**
   * Run backtest across all strategies and return comparison
   */
  async runComparison(
    symbol: string,
    days: number = 30
  ): Promise<BacktestResult[]> {
    const results: BacktestResult[] = []

    for (const strategy of tradingStrategies) {
      try {
        const result = await this.runBacktest({
          symbol,
          strategyName: strategy.name,
          days,
        })
        results.push(result)
      } catch {
        // Skip failed strategies
      }
    }

    // Sort by total P&L descending
    results.sort((a, b) => b.metrics.totalPnl - a.metrics.totalPnl)
    return results
  }
}

// Singleton instance
export const backtestingEngine = new BacktestingEngine()
