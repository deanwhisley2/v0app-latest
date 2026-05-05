/**
 * Bitget public REST via Next.js `/api/bitget` proxy (read-only, no keys).
 * Responses follow Bitget: { code, msg, data, requestTime? }.
 */

async function bitgetFetch(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const query = new URLSearchParams({ endpoint, ...params })
  const url = `/api/bitget?${query.toString()}`
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error?: string }).error)
        : `Bitget proxy HTTP ${response.status}`
    throw new Error(err)
  }
  return data
}

export async function fetchBitgetServerTime(): Promise<unknown> {
  return bitgetFetch("/api/v2/public/time")
}

/** Spot ticker(s). Pass symbol e.g. BTCUSDT, or omit for full book (heavy). */
export async function fetchBitgetSpotTickers(symbol?: string): Promise<unknown> {
  return symbol
    ? bitgetFetch("/api/v2/spot/market/tickers", { symbol })
    : bitgetFetch("/api/v2/spot/market/tickers")
}

/**
 * Spot candles. Common params: symbol=BTCUSDT, granularity=1min (see Bitget docs), limit=100
 */
export async function fetchBitgetSpotCandles(params: Record<string, string>): Promise<unknown> {
  return bitgetFetch("/api/v2/spot/market/candles", params)
}

/** Order book: symbol, type=step0|step1… */
export async function fetchBitgetSpotOrderbook(params: Record<string, string>): Promise<unknown> {
  return bitgetFetch("/api/v2/spot/market/orderbook", params)
}
