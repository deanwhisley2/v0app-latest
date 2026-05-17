"use client"

/**
 * Market Data Service
 * Fetches real-time crypto prices from public APIs (CoinGecko free tier)
 * Provides historical data and price simulation for paper trading
 */

import { coinsData, type Coin } from "./coins-data"

// ============================================================
// Types
// ============================================================

export interface OHLCV {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MarketSnapshot {
  symbol: string
  price: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
  marketCap: number
  timestamp: number
}

export interface OrderBookLevel {
  price: number
  size: number
  total: number
}

export interface OrderBookData {
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  spread: number
  spreadPercentage: number
}

// ============================================================
// CoinGecko API (Free, no key required)
// ============================================================

const COINGECKO_BASE = "https://api.coingecko.com/api/v3"

// Map our coin symbols to CoinGecko IDs
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  MATIC: "matic-network",
  DOGE: "dogecoin",
  SHIB: "shiba-inu",
  UNI: "uniswap",
  ATOM: "cosmos",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  TRX: "tron",
  NEAR: "near",
  APE: "apecoin",
  FTM: "fantom",
  ALGO: "algorand",
  VET: "vechain",
  SAND: "the-sandbox",
  MANA: "decentraland",
  AXS: "axie-infinity",
  GALA: "gala",
  ENJ: "enjincoin",
  CHZ: "chiliz",
  FLOW: "flow",
  HBAR: "hedera-hashgraph",
  XTZ: "tezos",
  THETA: "theta-token",
  EOS: "eos",
  AAVE: "aave",
  MKR: "maker",
  COMP: "compound-governance-token",
  SNX: "havven",
  CRV: "curve-dao-token",
  "1INCH": "1inch",
  YFI: "yearn-finance",
  SUSHI: "sushi",
  LUNC: "terra-luna",
  KCS: "kucoin-shares",
  ORCA: "orca",
  CFX: "conflux-token",
}

// ============================================================
// Rate Limiting & Caching
// ============================================================

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

const cache = new Map<string, CacheEntry<any>>()

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache<T>(key: string, data: T, ttl: number): void {
  cache.set(key, { data, timestamp: Date.now(), ttl })
}

// Rate limiter: CoinGecko free tier allows 10-30 calls/min
let lastCallTime = 0
const MIN_CALL_INTERVAL = 2500 // 2.5 seconds between calls

async function rateLimitedFetch(url: string): Promise<any> {
  const now = Date.now()
  const timeSinceLastCall = now - lastCallTime
  if (timeSinceLastCall < MIN_CALL_INTERVAL) {
    await new Promise((resolve) => setTimeout(resolve, MIN_CALL_INTERVAL - timeSinceLastCall))
  }
  lastCallTime = Date.now()

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) {
      if (response.status === 429) {
        // Rate limited - wait and retry once
        await new Promise((resolve) => setTimeout(resolve, 5000))
        const retryResponse = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        })
        if (!retryResponse.ok) throw new Error(`HTTP ${retryResponse.status}`)
        return retryResponse.json()
      }
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  } catch (error) {
    throw error
  }
}

// ============================================================
// Public API Functions
// ============================================================

/**
 * Fetch current price for a single coin via canonical market authority API.
 */
export async function fetchCoinPrice(symbol: string): Promise<number | null> {
  const sym = symbol.toUpperCase()
  const cacheKey = `price_${sym}`
  const cached = getCached<number>(cacheKey)
  if (cached !== null) return cached

  try {
    const res = await fetch("/api/market/authority", { cache: "no-store" })
    const data = (await res.json()) as {
      ok?: boolean
      pricesBySymbol?: Record<string, { priceUsd?: number }>
      btc?: { priceUsd?: number }
    }
    if (!res.ok || !data.ok) return null
    const price =
      data.pricesBySymbol?.[sym]?.priceUsd ??
      (sym === "BTC" ? data.btc?.priceUsd : undefined) ??
      null
    if (price != null) setCache(cacheKey, price, 30_000)
    return price
  } catch {
    return null
  }
}

/**
 * Fetch current prices for multiple coins
 */
export async function fetchMultiplePrices(symbols: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  const uncached: string[] = []

  for (const symbol of symbols) {
    const cached = getCached<number>(`price_${symbol}`)
    if (cached !== null) {
      result[symbol] = cached
    } else {
      uncached.push(symbol)
    }
  }

  if (uncached.length === 0) return result

  try {
    const res = await fetch("/api/market/authority", { cache: "no-store" })
    const data = (await res.json()) as {
      ok?: boolean
      pricesBySymbol?: Record<string, { priceUsd?: number }>
      btc?: { priceUsd?: number }
    }
    if (!res.ok || !data.ok) return result

    for (const symbol of uncached) {
      const sym = symbol.toUpperCase()
      const price =
        data.pricesBySymbol?.[sym]?.priceUsd ??
        (sym === "BTC" ? data.btc?.priceUsd : undefined)
      if (typeof price === "number" && price > 0) {
        result[symbol] = price
        setCache(`price_${symbol}`, price, 30_000)
      }
    }
  } catch {
    /* return partial */
  }

  return result
}

/**
 * Fetch historical OHLCV data for a coin
 */
export async function fetchHistoricalData(
  symbol: string,
  days: number = 7
): Promise<OHLCV[]> {
  const coinId = COINGECKO_IDS[symbol.toUpperCase()]
  if (!coinId) return generateSimulatedOHLCV(symbol, days)

  const cacheKey = `history_${symbol}_${days}`
  const cached = getCached<OHLCV[]>(cacheKey)
  if (cached !== null) return cached

  try {
    const res = await fetch(
      `/api/market/ohlcv?symbol=${encodeURIComponent(symbol)}&days=${days}`,
      { cache: "no-store" }
    )
    const data = (await res.json()) as {
      ok?: boolean
      bars?: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>
    }
    if (res.ok && data.ok && data.bars?.length) {
      const ohlcv = data.bars
      setCache(cacheKey, ohlcv, 60_000)
      return ohlcv
    }
  } catch {
    /* simulated fallback */
  }

  return generateSimulatedOHLCV(symbol, days)
}

/**
 * Fetch market snapshot for all tracked coins
 */
export async function fetchMarketSnapshots(): Promise<MarketSnapshot[]> {
  const cacheKey = "market_snapshots"
  const cached = getCached<MarketSnapshot[]>(cacheKey)
  if (cached !== null) return cached

  const ids = Object.values(COINGECKO_IDS).join(",")

  try {
    const res = await fetch("/api/market/authority", { cache: "no-store" })
    const data = (await res.json()) as {
      ok?: boolean
      live?: { catalog?: Array<{ symbol: string; price: number; change24h: number; volume: number; marketCap: number }> }
    }
    if (res.ok && data.ok && data.live?.catalog?.length) {
      const snapshots: MarketSnapshot[] = data.live.catalog.map((c) => ({
        symbol: c.symbol,
        price: c.price,
        change24h: c.change24h,
        high24h: c.price,
        low24h: c.price,
        volume24h: c.volume,
        marketCap: c.marketCap,
        timestamp: Date.now(),
      }))
      setCache(cacheKey, snapshots, 60_000)
      return snapshots
    }
  } catch {
    /* static fallback */
  }

  // Fallback: return from static coinsData
  return coinsData.map((coin) => ({
    symbol: coin.symbol,
    price: coin.price,
    change24h: coin.change24h,
    high24h: coin.price * 1.02,
    low24h: coin.price * 0.98,
    volume24h: coin.volume,
    marketCap: coin.marketCap,
    timestamp: Date.now(),
  }))
}

/**
 * Generate a simulated order book for a coin
 */
export function generateOrderBook(
  currentPrice: number,
  levels: number = 15
): OrderBookData {
  const bids: OrderBookLevel[] = []
  const asks: OrderBookLevel[] = []

  let bidTotal = 0
  let askTotal = 0

  for (let i = 1; i <= levels; i++) {
    const bidPrice = currentPrice * (1 - (i * 0.001))
    const bidSize = Math.random() * 5 + 0.1
    bidTotal += bidSize
    bids.push({
      price: Number(bidPrice.toFixed(2)),
      size: Number(bidSize.toFixed(4)),
      total: Number(bidTotal.toFixed(4)),
    })

    const askPrice = currentPrice * (1 + (i * 0.001))
    const askSize = Math.random() * 5 + 0.1
    askTotal += askSize
    asks.push({
      price: Number(askPrice.toFixed(2)),
      size: Number(askSize.toFixed(4)),
      total: Number(askTotal.toFixed(4)),
    })
  }

  const spread = asks[0].price - bids[0].price
  const spreadPercentage = (spread / currentPrice) * 100

  return { bids, asks, spread, spreadPercentage }
}

// ============================================================
// Simulated Data Generation (Fallback)
// ============================================================

/**
 * Generate simulated OHLCV data when API is unavailable
 */
function generateSimulatedOHLCV(symbol: string, days: number): OHLCV[] {
  const coin = coinsData.find((c) => c.symbol === symbol)
  const basePrice = coin?.price ?? 100
  const volatility = basePrice * 0.02 // 2% daily volatility
  const dataPoints = days * 24 // Hourly data points
  const data: OHLCV[] = []

  let currentPrice = basePrice * (1 - days * 0.001) // Slight mean reversion

  for (let i = 0; i < dataPoints; i++) {
    const timestamp = Date.now() - (dataPoints - i) * 3600_000
    const change = (Math.random() - 0.48) * volatility
    const open = currentPrice
    const close = currentPrice + change
    const high = Math.max(open, close) + Math.random() * volatility * 0.5
    const low = Math.min(open, close) - Math.random() * volatility * 0.5
    const volume = basePrice * (Math.random() * 10000 + 1000)

    data.push({
      timestamp,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Number(volume.toFixed(2)),
    })

    currentPrice = close
  }

  return data
}

/**
 * Simulate a real-time price tick (for use in useEffect intervals)
 */
export function simulatePriceTick(
  currentPrice: number,
  volatility: number = 0.002
): number {
  const change = currentPrice * volatility * (Math.random() - 0.5) * 2
  return Number((currentPrice + change).toFixed(2))
}

/**
 * Update coinsData with real-time prices from the market service
 */
export function updateCoinsWithMarketData(
  coins: Coin[],
  priceUpdates: Record<string, number>
): Coin[] {
  return coins.map((coin) => {
    const newPrice = priceUpdates[coin.symbol]
    if (!newPrice) return coin
    const change24h = ((newPrice - coin.price) / coin.price) * 100
    return {
      ...coin,
      price: newPrice,
      change24h: Number(change24h.toFixed(2)),
      volume: coin.volume * (1 + (Math.random() - 0.5) * 0.1),
    }
  })
}
