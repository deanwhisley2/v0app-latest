// OUR SMART MONEY DETECTOR - Follows institutional footprints

export interface InstitutionalFlow {
  direction: "ACCUMULATING" | "DISTRIBUTING" | "NEUTRAL"
  confidence: number
  accumulationZones: PriceZone[]
  largeTradesDetected: LargeTrade[]
  signal: "BULLISH" | "BEARISH" | "NEUTRAL"
}

export interface PriceZone {
  low: number
  high: number
  volumeAccumulated: number
  significance: number
}

export interface LargeTrade {
  price: number
  volume: number
  timestamp: number
  side: "BUY" | "SELL"
}

export class SmartMoneyDetector {
  private recentTrades: LargeTrade[] = []
  private maxTradesStored: number = 1000

  recordTrade(trade: LargeTrade): void {
    this.recentTrades.push(trade)
    if (this.recentTrades.length > this.maxTradesStored) {
      this.recentTrades.shift()
    }
  }

  analyze(prices: number[], volumes: number[], trades?: LargeTrade[]): InstitutionalFlow {
    if (trades) {
      for (const trade of trades) {
        this.recordTrade(trade)
      }
    }
    
    const accumulationZones = this.findAccumulationZones(prices, volumes)
    const largeTradesDetected = this.findLargeTradeClusters()
    
    const buyVolume = largeTradesDetected.filter(t => t.side === "BUY").reduce((sum, t) => sum + t.volume, 0)
    const sellVolume = largeTradesDetected.filter(t => t.side === "SELL").reduce((sum, t) => sum + t.volume, 0)
    const netVolume = buyVolume - sellVolume
    const totalVolume = buyVolume + sellVolume
    
    let direction: InstitutionalFlow["direction"] = "NEUTRAL"
    let signal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL"
    
    if (accumulationZones.length > 0 && netVolume > totalVolume * 0.2) {
      direction = "ACCUMULATING"
      signal = "BULLISH"
    } else if (accumulationZones.length > 0 && netVolume < -totalVolume * 0.2) {
      direction = "DISTRIBUTING"
      signal = "BEARISH"
    }
    
    const confidence = Math.min((accumulationZones.length * 20) + (Math.abs(netVolume) / Math.max(1, totalVolume)) * 50, 100)
    
    return {
      direction,
      confidence,
      accumulationZones: accumulationZones.slice(0, 3),
      largeTradesDetected: largeTradesDetected.slice(0, 10),
      signal
    }
  }

  private findAccumulationZones(prices: number[], volumes: number[]): PriceZone[] {
    const zones: PriceZone[] = []
    const lookback = Math.min(100, prices.length)
    if (lookback < 20) return zones
    
    const avgVolume = volumes.slice(-lookback).reduce((a, b) => a + b, 0) / lookback
    const windowSize = 20
    
    for (let i = lookback - windowSize; i < prices.length - windowSize; i += 5) {
      const windowVolumes = volumes.slice(i, i + windowSize)
      const windowPrices = prices.slice(i, i + windowSize)
      const windowAvgVolume = windowVolumes.reduce((a, b) => a + b, 0) / windowSize
      
      if (windowAvgVolume > avgVolume * 1.5) {
        const low = Math.min(...windowPrices)
        const high = Math.max(...windowPrices)
        const range = (high - low) / low
        
        if (range < 0.02) {
          zones.push({
            low,
            high,
            volumeAccumulated: windowVolumes.reduce((a, b) => a + b, 0),
            significance: Math.min((windowAvgVolume / avgVolume) * 50, 100)
          })
        }
      }
    }
    
    return zones.sort((a, b) => b.significance - a.significance)
  }

  private findLargeTradeClusters(): LargeTrade[] {
    if (this.recentTrades.length < 3) return []
    
    const avgVolume = this.recentTrades.reduce((a, b) => a + b.volume, 0) / this.recentTrades.length
    const threshold = avgVolume * 3
    const largeOnes = this.recentTrades.filter(t => t.volume > threshold)
    
    const clusters: LargeTrade[] = []
    for (let i = 0; i < largeOnes.length; i++) {
      const current = largeOnes[i]
      const cluster: LargeTrade[] = [current]
      
      for (let j = i + 1; j < largeOnes.length; j++) {
        if (largeOnes[j].timestamp - current.timestamp < 5000) {
          cluster.push(largeOnes[j])
          largeOnes.splice(j, 1)
          j--
        }
      }
      
      if (cluster.length >= 2) {
        clusters.push(...cluster)
      }
    }
    
    return clusters
  }

  getQuickSignal(): { signal: string; confidence: number } {
    if (this.recentTrades.length === 0) {
      return { signal: "NEUTRAL", confidence: 0 }
    }
    
    const lastTrades = this.recentTrades.slice(-50)
    const buyVolume = lastTrades.filter(t => t.side === "BUY").reduce((a, b) => a + b.volume, 0)
    const sellVolume = lastTrades.filter(t => t.side === "SELL").reduce((a, b) => a + b.volume, 0)
    const netBuyRatio = (buyVolume - sellVolume) / (buyVolume + sellVolume + 0.001)
    
    if (netBuyRatio > 0.3) {
      return { signal: "BULLISH", confidence: netBuyRatio * 100 }
    } else if (netBuyRatio < -0.3) {
      return { signal: "BEARISH", confidence: Math.abs(netBuyRatio) * 100 }
    }
    return { signal: "NEUTRAL", confidence: 50 }
  }
}