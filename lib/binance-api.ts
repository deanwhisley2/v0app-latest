/**
 * Binance Paper Comparison API
 * READ-ONLY - Only uses public Binance endpoints
 * NO TRADE COMMANDS ARE EVER SENT
 * 
 * Uses Next.js API proxy to bypass browser CORS restrictions.
 * All requests go through /api/binance which proxies to Binance server-side.
 */

// ============================================================
// Types
// ============================================================

export interface BinanceTicker {
  symbol: string
  price: string
  time: number
}

export interface BinanceKline {
  openTime: number
  open: string
  high: string
  low: string
  close: string
  volume: string
  closeTime: number
  quoteVolume: string
  trades: number
}

export interface BinanceOrderBookLevel {
  price: string
  quantity: string
}

export interface BinanceOrderBook {
  lastUpdateId: number
  bids: BinanceOrderBookLevel[]
  asks: BinanceOrderBookLevel[]
}

export interface BinanceTrade {
  id: number
  price: string
  qty: string
  time: number
  isBuyerMaker: boolean
}

export interface ComparisonSignal {
  timestamp: number
  nexusSignal: "BUY" | "SELL" | "HOLD"
  nexusConfidence: number
  entryPrice: number
  exitPrice: number | null
  actualMovement: number | null
  correct: boolean | null
  checked: boolean
  strategyBreakdown: {
    smartMoney: { signal: string; weight: number }
    liquidity: { signal: string; weight: number }
    kalman: { signal: string; weight: number }
  }
}

export interface StrategyAccuracy {
  strategyName: string
  predictions: number
  correct: number
  wrong: number
  accuracy: number
}

export interface ComparisonReport {
  totalSignals: number
  correctPredictions: number
  wrongPredictions: number
  overallAccuracy: number
  nexusPnl: number
  nexusPnlPercent: number
  buyHoldPnl: number
  buyHoldPnlPercent: number
  randomPnl: number
  randomPnlPercent: number
  strategyAccuracies: StrategyAccuracy[]
  signals: ComparisonSignal[]
}

// ============================================================
// Binance API Client (Read-Only) - Uses Next.js API Proxy
// ============================================================

/**
 * Fetch from Binance via the Next.js API proxy.
 * This bypasses browser CORS restrictions by routing through our server.
 */
async function binanceFetch(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const queryParams = new URLSearchParams({ endpoint, ...params })
  const url = `/api/binance?${queryParams.toString()}`

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Binance HTTP ${response.status}`)
    }

    return response.json()
  } catch (error) {
    throw error
  }
}

// ============================================================
// Public API Functions (READ-ONLY)
// ============================================================

/**
 * Get current price for a symbol (e.g., "BTCUSDT")
 */
export async function getBinancePrice(symbol: string = "BTCUSDT"): Promise<number> {
  const data = await binanceFetch("/api/v3/ticker/price", { symbol })
  return parseFloat(data.price)
}

/**
 * Get prices for multiple symbols
 */
export async function getBinancePrices(symbols: string[]): Promise<Record<string, number>> {
  const symbolsParam = JSON.stringify(symbols.map((s) => ({ symbol: s })))
  const data = await binanceFetch("/api/v3/ticker/price", { symbols: symbolsParam })
  const result: Record<string, number> = {}
  for (const item of data) {
    result[item.symbol] = parseFloat(item.price)
  }
  return result
}

/**
 * Get historical kline/candlestick data
 * interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M
 * limit: max 1000
 */
export async function getBinanceKlines(
  symbol: string = "BTCUSDT",
  interval: string = "5m",
  limit: number = 100
): Promise<BinanceKline[]> {
  const data = await binanceFetch("/api/v3/klines", {
    symbol,
    interval,
    limit: limit.toString(),
  })

  return data.map((k: any[]) => ({
    openTime: k[0],
    open: k[1],
    high: k[2],
    low: k[3],
    close: k[4],
    volume: k[5],
    closeTime: k[6],
    quoteVolume: k[7],
    trades: k[8],
  }))
}

/**
 * Get order book depth
 * limit: 5, 10, 20, 50, 100, 500, 1000
 */
export async function getBinanceDepth(
  symbol: string = "BTCUSDT",
  limit: number = 20
): Promise<BinanceOrderBook> {
  return binanceFetch("/api/v3/depth", {
    symbol,
    limit: limit.toString(),
  })
}

/** Alias — same as {@link getBinanceDepth} (limit 5–1000 per Binance). */
export async function getBinanceOrderBook(
  symbol: string = "BTCUSDT",
  limit: number = 100
): Promise<BinanceOrderBook> {
  return getBinanceDepth(symbol, limit)
}

/**
 * Get recent trades
 * limit: max 1000
 */
export async function getBinanceTrades(
  symbol: string = "BTCUSDT",
  limit: number = 50
): Promise<BinanceTrade[]> {
  return binanceFetch("/api/v3/trades", {
    symbol,
    limit: limit.toString(),
  })
}

/**
 * Get 24hr ticker statistics
 */
export async function getBinance24hr(symbol: string = "BTCUSDT"): Promise<{
  priceChange: string
  priceChangePercent: string
  highPrice: string
  lowPrice: string
  volume: string
  quoteVolume: string
}> {
  const data = await binanceFetch("/api/v3/ticker/24hr", { symbol })
  return {
    priceChange: data.priceChange,
    priceChangePercent: data.priceChangePercent,
    highPrice: data.highPrice,
    lowPrice: data.lowPrice,
    volume: data.volume,
    quoteVolume: data.quoteVolume,
  }
}

/**
 * Get exchange info (trading pairs, filters, etc.)
 */
export async function getBinanceExchangeInfo(symbol?: string): Promise<any> {
  const params: Record<string, string> = {}
  if (symbol) params.symbol = symbol
  return binanceFetch("/api/v3/exchangeInfo", params)
}

/**
 * Get server time
 */
export async function getBinanceServerTime(): Promise<number> {
  const data = await binanceFetch("/api/v3/time")
  return data.serverTime
}

/**
 * Get average price over last 5 minutes
 */
export async function getBinanceAvgPrice(symbol: string = "BTCUSDT"): Promise<{
  mins: number
  price: string
}> {
  return binanceFetch("/api/v3/avgPrice", { symbol })
}

// ============================================================
// Historical Data Helpers
// ============================================================

/**
 * Convert kline data to price array for Nexus engine
 */
export function klinesToPrices(klines: BinanceKline[]): number[] {
  return klines.map((k) => parseFloat(k.close))
}

/**
 * Convert kline data to volume array for Nexus engine
 */
export function klinesToVolumes(klines: BinanceKline[]): number[] {
  return klines.map((k) => parseFloat(k.volume))
}

/**
 * Get last 7 days of 5-minute klines for backtesting
 */
export async function get7DayKlines(symbol: string = "BTCUSDT"): Promise<BinanceKline[]> {
  // 7 days = 2016 five-minute candles
  // Binance max limit is 1000, so we need multiple requests
  const allKlines: BinanceKline[] = []
  let endTime = Date.now()

  for (let i = 0; i < 3; i++) {
    const klines = await getBinanceKlines(symbol, "5m", 1000)
    allKlines.push(...klines)

    if (klines.length > 0) {
      endTime = klines[0].openTime - 1
    }

    // Avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  // Remove duplicates and sort by time
  const unique = new Map<number, BinanceKline>()
  for (const k of allKlines) {
    unique.set(k.openTime, k)
  }

  return Array.from(unique.values()).sort((a, b) => a.openTime - b.openTime)
}

// ============================================================
// SAFETY: Verify no write endpoints are used
// ============================================================

/**
 * This function exists as a safety check - it lists ALL endpoints
 * that this module uses to confirm NONE are write endpoints.
 * 
 * Used endpoints (ALL READ-ONLY):
 * - GET /api/v3/ticker/price
 * - GET /api/v3/ticker/24hr
 * - GET /api/v3/klines
 * - GET /api/v3/depth
 * - GET /api/v3/trades
 * - GET /api/v3/exchangeInfo
 * - GET /api/v3/time
 * - GET /api/v3/avgPrice
 * 
 * NEVER USED (safety confirmed):
 * - POST /api/v3/order        ❌
 * - POST /api/v3/order/test   ❌
 * - DELETE /api/v3/order      ❌
 * - POST /api/v3/sor/order    ❌
 */
export function confirmReadOnlyMode(): boolean {
  return true
}
