/**
 * Universal Exchange Balance API
 * 
 * Fetches REAL account balances from connected exchanges via their APIs.
 * Supports: Binance, Bybit, Bitget, KuCoin, Blofin, OKX, MEXC, Gate.io
 * 
 * All requests go through server-side API routes to keep API secrets secure.
 * Balances are polled at configurable intervals (default: 1000ms) for real-time accuracy.
 */

// ============================================================
// Types
// ============================================================

export interface ExchangeBalance {
  exchangeId: string
  exchangeName: string
  totalUsd: number
  assets: ExchangeAsset[]
  timestamp: number
  error?: string
}

export interface ExchangeAsset {
  coin: string
  free: string
  locked: string
  usdValue: number
}

export interface ExchangeConfig {
  id: string
  name: string
  apiKey: string
  apiSecret: string
  apiPassphrase?: string // Some exchanges need this (e.g., KuCoin, OKX)
  frozen: boolean // User can freeze/unfreeze an exchange
}

export interface BalanceUpdate {
  exchangeId: string
  totalUsd: number
  assets: ExchangeAsset[]
  timestamp: number
  error?: string
}

// ============================================================
// Balance Fetcher
// ============================================================

const EXCHANGE_API_ROUTES: Record<string, string> = {
  binance: "/api/exchange/balance/binance",
  bybit: "/api/exchange/balance/bybit",
  bitget: "/api/exchange/balance/bitget",
  kucoin: "/api/exchange/balance/kucoin",
  blofin: "/api/exchange/balance/blofin",
  okx: "/api/exchange/balance/okx",
  mexc: "/api/exchange/balance/mexc",
  gateio: "/api/exchange/balance/gateio",
}

/**
 * Fetch real balance from a specific exchange via server-side API
 */
export async function fetchExchangeBalance(
  exchangeId: string,
  apiKey: string,
  apiSecret: string,
  apiPassphrase?: string
): Promise<ExchangeBalance> {
  const route = EXCHANGE_API_ROUTES[exchangeId]
  if (!route) {
    return {
      exchangeId,
      exchangeName: exchangeId,
      totalUsd: 0,
      assets: [],
      timestamp: Date.now(),
      error: `Unsupported exchange: ${exchangeId}`,
    }
  }

  try {
    const response = await fetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        apiSecret,
        apiPassphrase,
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        exchangeId,
        exchangeName: exchangeId,
        totalUsd: 0,
        assets: [],
        timestamp: Date.now(),
        error: errorData.error || `HTTP ${response.status}`,
      }
    }

    const data = await response.json()
    return data as ExchangeBalance
  } catch (error: any) {
    return {
      exchangeId,
      exchangeName: exchangeId,
      totalUsd: 0,
      assets: [],
      timestamp: Date.now(),
      error: error.message || "Network error",
    }
  }
}

/**
 * Fetch balances from ALL connected exchanges simultaneously
 */
export async function fetchAllExchangeBalances(
  exchanges: Array<{
    id: string
    apiKey: string
    apiSecret: string
    apiPassphrase?: string
    frozen: boolean
  }>
): Promise<Record<string, ExchangeBalance>> {
  const activeExchanges = exchanges.filter((ex) => !ex.frozen && ex.apiKey && ex.apiSecret)
  
  if (activeExchanges.length === 0) {
    return {}
  }

  const results = await Promise.allSettled(
    activeExchanges.map((ex) =>
      fetchExchangeBalance(ex.id, ex.apiKey, ex.apiSecret, ex.apiPassphrase)
    )
  )

  const balances: Record<string, ExchangeBalance> = {}
  results.forEach((result, index) => {
    const ex = activeExchanges[index]
    if (result.status === "fulfilled") {
      balances[ex.id] = result.value
    } else {
      balances[ex.id] = {
        exchangeId: ex.id,
        exchangeName: ex.id,
        totalUsd: 0,
        assets: [],
        timestamp: Date.now(),
        error: result.reason?.message || "Unknown error",
      }
    }
  })

  return balances
}

/**
 * Calculate total USD balance across all exchanges
 */
export function calculateTotalBalance(
  balances: Record<string, ExchangeBalance>
): number {
  return Object.values(balances).reduce(
    (sum, b) => sum + (b.error ? 0 : b.totalUsd),
    0
  )
}

/**
 * Get exchange display name from ID
 */
export function getExchangeDisplayName(id: string): string {
  const names: Record<string, string> = {
    binance: "Binance",
    bybit: "Bybit",
    bitget: "Bitget",
    kucoin: "KuCoin",
    blofin: "Blofin",
    okx: "OKX",
    mexc: "MEXC",
    gateio: "Gate.io",
  }
  return names[id] || id
}
