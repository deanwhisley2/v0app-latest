import type { BinanceOrderBook } from "@/lib/binance-api"
import type { OrderBookData, OrderBookLevel } from "@/lib/market-data"

/** Binance spot pair e.g. BTC -> BTCUSDT */
export function toBinanceSpotSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (s.endsWith("USDT")) return s
  return `${s}USDT`
}

/** Nexus / shadow-book shape: tuples [price, quantity] */
export function depthToNexusTuples(depth: BinanceOrderBook): {
  bids: [number, number][]
  asks: [number, number][]
} {
  const bids: [number, number][] = depth.bids.map((b) => [
    parseFloat(b.price),
    parseFloat(b.quantity),
  ])
  const asks: [number, number][] = depth.asks.map((a) => [
    parseFloat(a.price),
    parseFloat(a.quantity),
  ])
  return { bids, asks }
}

/** Liquidity warfare + sentiment weapon shape */
export function depthToOrderBookData(depth: BinanceOrderBook): OrderBookData {
  const bids: OrderBookLevel[] = []
  let bidTotal = 0
  for (const b of depth.bids) {
    const price = parseFloat(b.price)
    const size = parseFloat(b.quantity)
    bidTotal += size
    bids.push({ price, size, total: bidTotal })
  }

  const asks: OrderBookLevel[] = []
  let askTotal = 0
  for (const a of depth.asks) {
    const price = parseFloat(a.price)
    const size = parseFloat(a.quantity)
    askTotal += size
    asks.push({ price, size, total: askTotal })
  }

  const bestBid = bids[0]?.price ?? 0
  const bestAsk = asks[0]?.price ?? 0
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0
  const mid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : bestBid || bestAsk || 1
  const spreadPercentage = mid > 0 ? (spread / mid) * 100 : 0

  return {
    bids,
    asks,
    spread,
    spreadPercentage,
  }
}
