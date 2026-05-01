// OUR NEXUS UNIFIED ENGINE - ONE BRAIN, ONE DECISION

import { KalmanFilter, PredictionResult } from './kalman-filter'
import { ShadowBook, LiquidityAnalysis } from './shadow-book'
import { SmartMoneyDetector, InstitutionalFlow } from './smart-money'

export interface MarketData {
  symbol: string
  currentPrice: number
  historicalPrices: number[]
  volumes: number[]
  orderBook: { bids: [number, number][]; asks: [number, number][] }
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
}

export interface TradeDecision {
  action: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL"
  confidence: number
  entryPrice?: number
  stopLoss?: number
  takeProfit?: number
  reason: string
  components: {
    kalmanSignal: string
    kalmanWeight: number
    liquiditySignal: string
    liquidityWeight: number
    smartMoneySignal: string
    smartMoneyWeight: number
  }
}

export class NexusTradingEngine {
  private kalman: KalmanFilter
  private shadowBook: ShadowBook
  private smartMoney: SmartMoneyDetector
  
  private weights = {
    kalman: 0.35,
    liquidity: 0.25,
    smartMoney: 0.25,
    sentiment: 0.15
  }
  
  constructor() {
    this.kalman = new KalmanFilter()
    this.shadowBook = new ShadowBook()
    this.smartMoney = new SmartMoneyDetector()
  }
  
  initialize(symbol: string, historicalData: number[]): void {
    this.kalman.reset()
    this.kalman.fit(historicalData)
  }
  
  getTradeSignal(marketData: MarketData): TradeDecision {
    const kalmanResult = this.kalman.update(marketData.currentPrice)
    this.shadowBook.update(marketData.orderBook)
    const liquidityResult = this.shadowBook.analyze()
    const smartMoneyResult = this.smartMoney.analyze(marketData.historicalPrices, marketData.volumes)
    
    let totalScore = 0
    let totalWeight = 0
    
    let kalmanSignalScore = 0
    let kalmanSignalText = "NEUTRAL"
    if (kalmanResult.signal === "BULLISH") {
      kalmanSignalScore = kalmanResult.strength
      kalmanSignalText = "BULLISH"
    } else if (kalmanResult.signal === "BEARISH") {
      kalmanSignalScore = -kalmanResult.strength
      kalmanSignalText = "BEARISH"
    }
    totalScore += kalmanSignalScore * this.weights.kalman
    totalWeight += this.weights.kalman
    
    let liquiditySignalScore = 0
    let liquiditySignalText = "NEUTRAL"
    if (liquidityResult.signal === "BULLISH") {
      liquiditySignalScore = 60
      liquiditySignalText = "BULLISH"
    } else if (liquidityResult.signal === "BEARISH") {
      liquiditySignalScore = -60
      liquiditySignalText = "BEARISH"
    }
    totalScore += liquiditySignalScore * this.weights.liquidity
    totalWeight += this.weights.liquidity
    
    let smartMoneySignalScore = 0
    let smartMoneySignalText = "NEUTRAL"
    if (smartMoneyResult.signal === "BULLISH") {
      smartMoneySignalScore = smartMoneyResult.confidence
      smartMoneySignalText = "BULLISH"
    } else if (smartMoneyResult.signal === "BEARISH") {
      smartMoneySignalScore = -smartMoneyResult.confidence
      smartMoneySignalText = "BEARISH"
    }
    totalScore += smartMoneySignalScore * this.weights.smartMoney
    totalWeight += this.weights.smartMoney
    
    const normalizedScore = totalScore / (totalWeight + 0.001)
    
    let action: TradeDecision["action"]
    let confidence = Math.abs(normalizedScore)
    
    if (normalizedScore > 70) {
      action = "STRONG_BUY"
    } else if (normalizedScore > 30) {
      action = "BUY"
    } else if (normalizedScore < -70) {
      action = "STRONG_SELL"
    } else if (normalizedScore < -30) {
      action = "SELL"
    } else {
      action = "HOLD"
    }
    
    const atr = this.calculateATR(marketData.historicalPrices, marketData.volumes)
    const entryPrice = marketData.currentPrice
    let stopLoss = entryPrice
    let takeProfit = entryPrice
    
    if (action.includes("BUY")) {
      stopLoss = entryPrice - (atr * 1.5)
      takeProfit = entryPrice + (atr * 3)
    } else if (action.includes("SELL")) {
      stopLoss = entryPrice + (atr * 1.5)
      takeProfit = entryPrice - (atr * 3)
    }
    
    const reason = this.generateReason(action, confidence, { kalman: kalmanResult, liquidity: liquidityResult, smartMoney: smartMoneyResult })
    
    return {
      action,
      confidence: Math.min(confidence, 100),
      entryPrice,
      stopLoss,
      takeProfit,
      reason,
      components: {
        kalmanSignal: kalmanSignalText,
        kalmanWeight: this.weights.kalman,
        liquiditySignal: liquiditySignalText,
        liquidityWeight: this.weights.liquidity,
        smartMoneySignal: smartMoneySignalText,
        smartMoneyWeight: this.weights.smartMoney
      }
    }
  }
  
  private calculateATR(prices: number[], volumes: number[], period: number = 14): number {
    if (prices.length < period + 1) return prices[prices.length - 1] * 0.02
    let sum = 0
    for (let i = prices.length - period; i < prices.length - 1; i++) {
      const high = prices[i] * 1.01
      const low = prices[i] * 0.99
      const prevClose = prices[i - 1]
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
      sum += tr
    }
    return sum / period
  }
  
  private generateReason(action: string, confidence: number, components: { kalman: PredictionResult; liquidity: LiquidityAnalysis; smartMoney: InstitutionalFlow }): string {
    const reasons: string[] = []
    if (components.kalman.signal !== "NEUTRAL") {
      reasons.push(`Kalman predicts ${components.kalman.signal.toLowerCase()} with ${Math.round(components.kalman.strength)}% strength`)
    }
    if (components.liquidity.signal !== "NEUTRAL") {
      reasons.push(`Order book shows ${components.liquidity.signal.toLowerCase()} imbalance (${Math.round(components.liquidity.bidImbalance * 100)}% bid advantage)`)
    }
    if (components.smartMoney.signal !== "NEUTRAL") {
      reasons.push(`Smart money ${components.smartMoney.direction.toLowerCase()} with ${Math.round(components.smartMoney.confidence)}% confidence`)
    }
    if (reasons.length === 0) {
      return `${action} signal with ${Math.round(confidence)}% confidence. Mixed signals, wait for confirmation.`
    }
    return `${action} signal (${Math.round(confidence)}% confidence). ` + reasons.slice(0, 3).join(". ")
  }
  
  setWeights(kalman: number, liquidity: number, smartMoney: number, sentiment: number): void {
    const total = kalman + liquidity + smartMoney + sentiment
    this.weights = {
      kalman: kalman / total,
      liquidity: liquidity / total,
      smartMoney: smartMoney / total,
      sentiment: sentiment / total
    }
  }
  
  getWeights(): typeof this.weights {
    return { ...this.weights }
  }
}

// Create singleton instance
export const nexusEngine = new NexusTradingEngine()