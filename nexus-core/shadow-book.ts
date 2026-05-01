// OUR SHADOW BOOK - Maintains local copy of entire order book
// We see liquidity that others cannot see

export interface LiquidityAnalysis {
  bidImbalance: number
  askImbalance: number
  totalBidVolume: number
  totalAskVolume: number
  spread: number
  signal: "BULLISH" | "BEARISH" | "NEUTRAL"
  whaleSpotting: WhaleActivity[]
}

export interface WhaleActivity {
  price: number
  volume: number
  side: "BID" | "ASK"
  significance: number
}

export class ShadowBook {
  private bids: Map<number, { price: number; volume: number; exchange: string }> = new Map()
  private asks: Map<number, { price: number; volume: number; exchange: string }> = new Map()
  private readonly MAX_LEVELS = 100

  update(orderBook: { bids: [number, number][]; asks: [number, number][]; exchange?: string }): void {
    this.bids.clear()
    this.asks.clear()
    
    for (let i = 0; i < Math.min(orderBook.bids.length, this.MAX_LEVELS); i++) {
      const [price, volume] = orderBook.bids[i]
      if (price > 0 && volume > 0) {
        this.bids.set(price, { price, volume, exchange: orderBook.exchange || "unknown" })
      }
    }
    
    for (let i = 0; i < Math.min(orderBook.asks.length, this.MAX_LEVELS); i++) {
      const [price, volume] = orderBook.asks[i]
      if (price > 0 && volume > 0) {
        this.asks.set(price, { price, volume, exchange: orderBook.exchange || "unknown" })
      }
    }
  }

  analyze(): LiquidityAnalysis {
    const totalBidVolume = Array.from(this.bids.values()).reduce((sum, level) => sum + level.volume, 0)
    const totalAskVolume = Array.from(this.asks.values()).reduce((sum, level) => sum + level.volume, 0)
    
    const bestBid = this.bids.size > 0 ? Math.max(...Array.from(this.bids.keys())) : 0
    const bestAsk = this.asks.size > 0 ? Math.min(...Array.from(this.asks.keys())) : 0
    const spread = bestAsk - bestBid
    
    const totalVolume = totalBidVolume + totalAskVolume
    const bidImbalance = totalVolume > 0 ? (totalBidVolume - totalAskVolume) / totalVolume : 0
    
    const whaleSpotting = this.detectWhales()
    
    let signal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL"
    if (bidImbalance > 0.2 || whaleSpotting.filter(w => w.side === "BID").length > 0) {
      signal = "BULLISH"
    } else if (bidImbalance < -0.2 || whaleSpotting.filter(w => w.side === "ASK").length > 0) {
      signal = "BEARISH"
    }
    
    return {
      bidImbalance,
      askImbalance: -bidImbalance,
      totalBidVolume,
      totalAskVolume,
      spread,
      signal,
      whaleSpotting
    }
  }

  private detectWhales(): WhaleActivity[] {
    const whales: WhaleActivity[] = []
    const avgBidVolume = Array.from(this.bids.values()).reduce((sum, l) => sum + l.volume, 0) / Math.max(1, this.bids.size)
    const avgAskVolume = Array.from(this.asks.values()).reduce((sum, l) => sum + l.volume, 0) / Math.max(1, this.asks.size)
    
    for (const [price, level] of this.bids) {
      if (level.volume > avgBidVolume * 3) {
        whales.push({ price, volume: level.volume, side: "BID", significance: Math.min((level.volume / avgBidVolume) * 20, 100) })
      }
    }
    
    for (const [price, level] of this.asks) {
      if (level.volume > avgAskVolume * 3) {
        whales.push({ price, volume: level.volume, side: "ASK", significance: Math.min((level.volume / avgAskVolume) * 20, 100) })
      }
    }
    
    return whales.sort((a, b) => b.significance - a.significance)
  }

  getBestBid(): number {
    return this.bids.size > 0 ? Math.max(...Array.from(this.bids.keys())) : 0
  }
  
  getBestAsk(): number {
    return this.asks.size > 0 ? Math.min(...Array.from(this.asks.keys())) : 0
  }
  
  getMidPrice(): number {
    return (this.getBestBid() + this.getBestAsk()) / 2
  }
}