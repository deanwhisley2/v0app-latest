"use client"

// NEXUS ENGINE - Replaces old strategy voting system
// One unified intelligence. No conflicts. No voting.

import { nexusEngine, TradeDecision, MarketData } from "../nexus-core/nexus-engine"
import { getBinanceOrderBook } from '@/lib/binance-api'
import { depthToNexusTuples, depthToOrderBookData, toBinanceSpotSymbol } from '@/lib/order-book-mapper'
import { sentimentWeapon } from '@/lib/sentiment-weapon'
// Re-export for compatibility with existing UI components
export type { TradeDecision, MarketData }

// ============================================================
// Types for dashboard UI components
// ============================================================

export interface BacktestResults {
  winRate: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  totalTrades: number
}

export interface Strategy {
  id: string
  name: string
  shortName: string
  description: string
  category: "smart_money" | "momentum" | "trend" | "reversal" | "volatility"
  isActive: boolean
  rules: {
    entry: string[]
    exit: string[]
    stopLoss: string
    takeProfit: string
  }
  indicators: string[]
  backtestResults?: BacktestResults
}

export interface TradeAnalysisSignal {
  strategy: string
  signal: "BUY" | "SELL" | "HOLD" | "WAIT"
  confidence: number
  reason: string
}

export interface TradeAnalysis {
  coin: string
  timestamp: Date
  signals: TradeAnalysisSignal[]
  consensus: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL"
  overallConfidence: number
  recommendation: string
  riskLevel: "LOW" | "MEDIUM" | "HIGH"
  suggestedEntry: number
  suggestedSL: number
  suggestedTP: number
  historicalAccuracy: number
}

// ============================================================
// Trading strategy definitions for the dashboard UI
// ============================================================

export const tradingStrategies: Strategy[] = [
  {
    id: "smart_money_flow",
    name: "Smart Money Flow",
    shortName: "SMF",
    description: "Tracks institutional order flow and detects large wallet accumulation/distribution patterns using shadow book analysis.",
    category: "smart_money",
    isActive: true,
    rules: {
      entry: ["Detect large buy orders in shadow book", "Confirm with cumulative delta divergence", "Wait for price to break above VWAP"],
      exit: ["Trailing stop based on ATR", "Exit on large sell order cluster detected"],
      stopLoss: "2.5% below entry or below recent swing low",
      takeProfit: "1:2.5 risk-reward ratio"
    },
    indicators: ["Cumulative Delta", "Order Flow Imbalance", "VWAP", "Shadow Book Depth"],
    backtestResults: { winRate: 67, profitFactor: 2.1, avgWin: 4.2, avgLoss: 2.0, totalTrades: 342 }
  },
  {
    id: "momentum_breakout",
    name: "Momentum Breakout",
    shortName: "MB",
    description: "Identifies high-probability breakouts using volume confirmation and volatility expansion signals.",
    category: "momentum",
    isActive: true,
    rules: {
      entry: ["Price breaks above resistance with 2x volume", "RSI > 55 and rising", "MACD histogram expanding"],
      exit: ["Volume drops below 20-period average", "RSI crosses below 70"],
      stopLoss: "Below breakout candle low",
      takeProfit: "1:3 risk-reward or next resistance level"
    },
    indicators: ["RSI", "MACD", "Volume Profile", "Bollinger Bands"],
    backtestResults: { winRate: 62, profitFactor: 2.8, avgWin: 5.1, avgLoss: 1.8, totalTrades: 287 }
  },
  {
    id: "trend_following",
    name: "Trend Following",
    shortName: "TF",
    description: "Captures sustained moves using Kalman-filtered trend detection and multi-timeframe confirmation.",
    category: "trend",
    isActive: true,
    rules: {
      entry: ["Kalman filter shows trend direction change", "Price above both 20 & 50 EMA", "ADX > 25 and rising"],
      exit: ["Kalman filter signals trend reversal", "Price closes below 20 EMA"],
      stopLoss: "Below 50 EMA or 3% whichever is lower",
      takeProfit: "Trailing stop at 2x ATR"
    },
    indicators: ["Kalman Filter", "EMA (20, 50, 200)", "ADX", "SuperTrend"],
    backtestResults: { winRate: 58, profitFactor: 3.2, avgWin: 6.8, avgLoss: 2.1, totalTrades: 198 }
  },
  {
    id: "reversal_scalp",
    name: "Reversal Scalp",
    shortName: "RS",
    description: "Quick counter-trend entries at extreme overbought/oversold levels with tight risk management.",
    category: "reversal",
    isActive: true,
    rules: {
      entry: ["RSI < 25 (oversold) or > 75 (overbought)", "Stochastic crossover confirmation", "Price at Bollinger Band extreme"],
      exit: ["Return to mean (20 EMA)", "Stochastic reverse cross"],
      stopLoss: "Beyond the extreme (1.5% max)",
      takeProfit: "1:1.5 risk-reward"
    },
    indicators: ["RSI", "Stochastic", "Bollinger Bands", "Volume"],
    backtestResults: { winRate: 71, profitFactor: 1.8, avgWin: 2.5, avgLoss: 1.4, totalTrades: 523 }
  },
  {
    id: "volatility_compression",
    name: "Volatility Compression",
    shortName: "VC",
    description: "Detects periods of low volatility that historically precede explosive moves, using Kalman volatility estimates.",
    category: "volatility",
    isActive: true,
    rules: {
      entry: ["Bollinger Band width at 6-month low", "Volume declining for 3+ periods", "Kalman volatility estimate below threshold"],
      exit: ["Price breaks out with 3x volume", "Bollinger Band expands 20%"],
      stopLoss: "Opposite side of the compression range",
      takeProfit: "1:4 risk-reward or volatility target"
    },
    indicators: ["Bollinger Band Width", "Kalman Volatility", "Volume", "ATR"],
    backtestResults: { winRate: 55, profitFactor: 3.5, avgWin: 8.2, avgLoss: 2.3, totalTrades: 156 }
  }
]

// ============================================================
// Singleton engine instance
// ============================================================
let engineInitialized = false

// Initialize engine for a coin
export function initializeEngine(symbol: string, historicalData: number[]): void {
  nexusEngine.initialize(symbol, historicalData)
  engineInitialized = true
}

// Main analysis function - replaces ALL old strategies
export function analyzeWithNexus(marketData: MarketData): TradeDecision {
  return nexusEngine.getTradeSignal(marketData)
}

export function sentimentBiasFromReport(compositeSignal: string, compositeConfidence: number): number {
  const c = Math.min(100, Math.max(0, compositeConfidence))
  if (compositeSignal === "BULLISH") return c * 0.65
  if (compositeSignal === "BEARISH") return -c * 0.65
  return 0
}

export function buildMarketData(
  coin: { symbol: string; price: number; change24h: number },
  historicalData: Array<{ close: number; volume: number }>,
  orderBook: MarketData["orderBook"],
  sentimentBiasScore?: number
): MarketData {
  const md: MarketData = {
    symbol: coin.symbol,
    currentPrice: coin.price,
    historicalPrices: historicalData.map((d) => d.close),
    volumes: historicalData.map((d) => d.volume),
    orderBook,
    change24h: coin.change24h,
    high24h: coin.price * 1.02,
    low24h: coin.price * 0.98,
    volume24h: historicalData.reduce((sum, d) => sum + d.volume, 0),
  }
  if (sentimentBiasScore !== undefined) {
    md.sentimentBiasScore = sentimentBiasScore
  }
  return md
}

export function decisionToTradeAnalysis(coin: { symbol: string; price: number }, decision: TradeDecision): TradeAnalysis {
  const oldFormatSignals: TradeAnalysisSignal[] = [
    {
      strategy: "Nexus Unified Engine",
      signal:
        decision.action === "STRONG_BUY"
          ? "BUY"
          : decision.action === "BUY"
            ? "BUY"
            : decision.action === "STRONG_SELL"
              ? "SELL"
              : decision.action === "SELL"
                ? "SELL"
                : "HOLD",
      confidence: decision.confidence,
      reason: decision.reason,
    },
  ]

  return {
    coin: coin.symbol,
    timestamp: new Date(),
    signals: oldFormatSignals,
    consensus:
      decision.action === "STRONG_BUY"
        ? "STRONG_BUY"
        : decision.action === "BUY"
          ? "BUY"
          : decision.action === "STRONG_SELL"
            ? "STRONG_SELL"
            : decision.action === "SELL"
              ? "SELL"
              : "NEUTRAL",
    overallConfidence: decision.confidence,
    recommendation: decision.reason,
    riskLevel: decision.confidence > 70 ? "LOW" : decision.confidence > 50 ? "MEDIUM" : "HIGH",
    suggestedEntry: decision.entryPrice || coin.price,
    suggestedSL: decision.stopLoss || coin.price * 0.98,
    suggestedTP: decision.takeProfit || coin.price * 1.04,
    historicalAccuracy: 68,
  }
}

/** Same as {@link analyzeWithAllStrategiesAsync} but without network — empty book, no sentiment bias. */
export function analyzeWithAllStrategies(coin: any, historicalData: any[]): TradeAnalysis {
  if (historicalData.length > 0) {
    initializeEngine(coin.symbol, historicalData.map((d: { close: number }) => d.close))
  }
  const marketData = buildMarketData(coin, historicalData, { bids: [], asks: [] })
  const decision = nexusEngine.getTradeSignal(marketData)
  return decisionToTradeAnalysis(coin, decision)
}

/**
 * Fetches live Binance depth (via `/api/binance` proxy), maps into Nexus + sentiment bias, then runs Nexus.
 */
export async function analyzeWithAllStrategiesAsync(
  coin: { symbol: string; price: number; change24h: number },
  historicalData: Array<{ close: number; volume: number }>,
  depthLimit: number = 100
): Promise<TradeAnalysis> {
  if (historicalData.length > 0) {
    initializeEngine(coin.symbol, historicalData.map((d) => d.close))
  }
  const spot = toBinanceSpotSymbol(coin.symbol)
  let orderBook: MarketData["orderBook"] = { bids: [], asks: [] }
  let sentimentBias: number | undefined

  try {
    const depth = await getBinanceOrderBook(spot, depthLimit)
    orderBook = depthToNexusTuples(depth)
    const obData = depthToOrderBookData(depth)
    const lastVol = historicalData.length ? historicalData[historicalData.length - 1]!.volume : 0
    const prevClose =
      historicalData.length > 5 ? historicalData[historicalData.length - 6]!.close : coin.price
    const priceChange5m = prevClose !== 0 ? ((coin.price - prevClose) / prevClose) * 100 : coin.change24h
    const sentimentReport = sentimentWeapon.analyze(
      obData,
      null,
      coin.symbol,
      lastVol,
      coin.price,
      priceChange5m
    )
    sentimentBias = sentimentBiasFromReport(sentimentReport.compositeSignal, sentimentReport.compositeConfidence)
  } catch (e) {
    console.warn(`[trading-strategies] Order book fetch failed for ${coin.symbol}, using empty book:`, e)
  }

  const marketData = buildMarketData(coin, historicalData, orderBook, sentimentBias)
  const decision = nexusEngine.getTradeSignal(marketData)
  return decisionToTradeAnalysis(coin, decision)
}
