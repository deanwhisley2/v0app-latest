/**
 * Binance Spot signed REST (server-only). MARKET orders + order status polling.
 */
import crypto from "crypto"

const BINANCE = "https://api.binance.com"

function sign(queryString: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex")
}

async function signedGet(path: string, apiKey: string, apiSecret: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams({ ...params, timestamp: String(Date.now()), recvWindow: "5000" })
  const sig = sign(qs.toString(), apiSecret)
  const url = `${BINANCE}${path}?${qs.toString()}&signature=${sig}`
  const res = await fetch(url, {
    method: "GET",
    headers: { "X-MBX-APIKEY": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Binance ${path} HTTP ${res.status}: ${text.slice(0, 400)}`)
  return JSON.parse(text) as unknown
}

async function signedPost(path: string, apiKey: string, apiSecret: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams({ ...params, timestamp: String(Date.now()), recvWindow: "5000" })
  const sig = sign(qs.toString(), apiSecret)
  const url = `${BINANCE}${path}?${qs.toString()}&signature=${sig}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "X-MBX-APIKEY": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Binance ${path} HTTP ${res.status}: ${text.slice(0, 400)}`)
  return JSON.parse(text) as unknown
}

async function signedDelete(path: string, apiKey: string, apiSecret: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams({ ...params, timestamp: String(Date.now()), recvWindow: "5000" })
  const sig = sign(qs.toString(), apiSecret)
  const url = `${BINANCE}${path}?${qs.toString()}&signature=${sig}`
  const res = await fetch(url, {
    method: "DELETE",
    headers: { "X-MBX-APIKEY": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Binance DELETE ${path} HTTP ${res.status}: ${text.slice(0, 400)}`)
  return JSON.parse(text) as unknown
}

export type MarketBuyResult = {
  orderId: number
  status: string
  executedQty: string
  cummulativeQuoteQty: string
  fills?: Array<{ price: string; qty: string; commission: string }>
}

export async function binanceMarketBuyQuote(
  symbol: string,
  quoteOrderQtyUsd: string,
  apiKey: string,
  apiSecret: string
): Promise<MarketBuyResult> {
  const data = (await signedPost("/api/v3/order", apiKey, apiSecret, {
    symbol,
    side: "BUY",
    type: "MARKET",
    quoteOrderQty: quoteOrderQtyUsd,
  })) as MarketBuyResult
  return data
}

export async function binanceMarketSellBase(
  symbol: string,
  quantity: string,
  apiKey: string,
  apiSecret: string
): Promise<MarketBuyResult> {
  const data = (await signedPost("/api/v3/order", apiKey, apiSecret, {
    symbol,
    side: "SELL",
    type: "MARKET",
    quantity,
  })) as MarketBuyResult
  return data
}

export async function binanceGetOrder(symbol: string, orderId: number, apiKey: string, apiSecret: string) {
  return signedGet("/api/v3/order", apiKey, apiSecret, {
    symbol,
    orderId: String(orderId),
  }) as Promise<{ status: string; executedQty: string; cummulativeQuoteQty: string }>
}

export async function binanceAccountInfo(apiKey: string, apiSecret: string) {
  return signedGet("/api/v3/account", apiKey, apiSecret, {}) as Promise<{
    permissions?: string[]
    balances: Array<{ asset: string; free: string; locked: string }>
  }>
}

export async function binanceExchangeInfo(symbol?: string) {
  const params: Record<string, string> = {}
  if (symbol) params.symbol = symbol
  const url = new URL(`${BINANCE}/api/v3/exchangeInfo`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), { cache: "no-store", signal: AbortSignal.timeout(20_000) })
  const text = await res.text()
  if (!res.ok) throw new Error(`Binance /api/v3/exchangeInfo HTTP ${res.status}: ${text.slice(0, 400)}`)
  return JSON.parse(text) as {
    symbols?: Array<{
      symbol: string
      status: string
      filters?: Array<{ filterType: string; minQty?: string; stepSize?: string; minNotional?: string }>
    }>
  }
}

export async function binanceBookTicker(symbol: string) {
  const url = new URL(`${BINANCE}/api/v3/ticker/bookTicker`)
  url.searchParams.set("symbol", symbol)
  const res = await fetch(url.toString(), { cache: "no-store", signal: AbortSignal.timeout(10_000) })
  const text = await res.text()
  if (!res.ok) throw new Error(`Binance /api/v3/ticker/bookTicker HTTP ${res.status}: ${text.slice(0, 400)}`)
  return JSON.parse(text) as { symbol: string; bidPrice: string; askPrice: string }
}

export async function binanceOpenOrders(symbol: string | undefined, apiKey: string, apiSecret: string) {
  const params: Record<string, string> = {}
  if (symbol) params.symbol = symbol
  return signedGet("/api/v3/openOrders", apiKey, apiSecret, params) as Promise<
    Array<{ orderId: number; symbol: string; side: string; type: string; price: string; origQty: string; status: string }>
  >
}

export async function binanceCancelOrder(symbol: string, orderId: number, apiKey: string, apiSecret: string) {
  return signedDelete("/api/v3/order", apiKey, apiSecret, {
    symbol,
    orderId: String(orderId),
  }) as Promise<unknown>
}

/** Poll until FILLED, CANCELED, or REJECTED / timeout. */
export async function waitOrderTerminal(
  symbol: string,
  orderId: number,
  apiKey: string,
  apiSecret: string,
  maxWaitMs = 60_000,
  intervalMs = 800
): Promise<{ status: string; executedQty: string; cummulativeQuoteQty: string }> {
  const deadline = Date.now() + maxWaitMs
  let last: { status: string; executedQty: string; cummulativeQuoteQty: string } = {
    status: "NEW",
    executedQty: "0",
    cummulativeQuoteQty: "0",
  }
  while (Date.now() < deadline) {
    last = (await binanceGetOrder(symbol, orderId, apiKey, apiSecret)) as typeof last
    if (["FILLED", "CANCELED", "REJECTED", "EXPIRED"].includes(last.status)) return last
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  console.warn(`[binance] order ${orderId} still ${last.status} after ${maxWaitMs}ms`)
  return last
}

export function getBinanceCredentialsFromEnv(): { apiKey: string; apiSecret: string } | null {
  const apiKey = process.env.BINANCE_API_KEY?.trim()
  const apiSecret =
    process.env.BINANCE_SECRET_KEY?.trim() || process.env.BINANCE_API_SECRET?.trim() || ""
  if (!apiKey || !apiSecret) return null
  return { apiKey, apiSecret }
}
