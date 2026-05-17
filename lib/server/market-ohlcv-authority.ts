/**
 * Server-authoritative OHLCV (CoinGecko with authority spot anchor).
 */

import { COINGECKO_SYMBOL_IDS } from "@/lib/coingecko-symbol-map"
import { getSymbolSpotUsd } from "@/lib/server/market-price-authority"
import { recordProviderFailure, recordProviderSuccess } from "@/lib/server/market-price-health"

export type OhlcvBar = {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type OhlcvCacheEntry = { bars: OhlcvBar[]; at: number }
const cache = new Map<string, OhlcvCacheEntry>()
const CACHE_MS = 60_000

function cacheKey(symbol: string, days: number) {
  return `${symbol.toUpperCase()}:${days}`
}

function syntheticBars(anchor: number, days: number): OhlcvBar[] {
  const points = Math.min(48, Math.max(12, days * 4))
  const bars: OhlcvBar[] = []
  let price = anchor * 0.98
  const step = (days * 86_400_000) / points
  const start = Date.now() - days * 86_400_000
  for (let i = 0; i < points; i++) {
    const open = price
    const delta = (Math.random() - 0.48) * anchor * 0.004
    price = Math.max(anchor * 0.92, Math.min(anchor * 1.08, price + delta))
    bars.push({
      timestamp: start + i * step,
      open,
      high: Math.max(open, price) * 1.001,
      low: Math.min(open, price) * 0.999,
      close: price,
      volume: 0,
    })
  }
  if (bars.length) bars[bars.length - 1]!.close = anchor
  return bars
}

export async function getAuthoritativeOhlcv(
  symbol: string,
  days: number = 1
): Promise<{ bars: OhlcvBar[]; source: string; anchorUsd: number; stale: boolean }> {
  const sym = symbol.toUpperCase().trim()
  const d = Math.min(30, Math.max(1, Math.floor(days)))
  const key = cacheKey(sym, d)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) {
    const spot = await getSymbolSpotUsd(sym)
    return { bars: hit.bars, source: "ohlcv-cache", anchorUsd: spot.priceUsd, stale: spot.stale }
  }

  const spot = await getSymbolSpotUsd(sym)
  const coinId = COINGECKO_SYMBOL_IDS[sym]
  if (!coinId) {
    const bars = syntheticBars(spot.priceUsd, d)
    cache.set(key, { bars, at: Date.now() })
    return { bars, source: "synthetic-anchor", anchorUsd: spot.priceUsd, stale: spot.stale }
  }

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${d}`
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`coingecko ohlc HTTP ${res.status}`)
    const data = (await res.json()) as number[][]
    recordProviderSuccess("coingecko-ohlc")

    if (!Array.isArray(data) || !data.length) {
      const bars = syntheticBars(spot.priceUsd, d)
      cache.set(key, { bars, at: Date.now() })
      return { bars, source: "synthetic-fallback", anchorUsd: spot.priceUsd, stale: spot.stale }
    }

    const bars: OhlcvBar[] = data.map((row) => ({
      timestamp: row[0] ?? 0,
      open: row[1] ?? spot.priceUsd,
      high: row[2] ?? spot.priceUsd,
      low: row[3] ?? spot.priceUsd,
      close: row[4] ?? spot.priceUsd,
      volume: 0,
    }))
    if (bars.length) bars[bars.length - 1]!.close = spot.priceUsd
    cache.set(key, { bars, at: Date.now() })
    return { bars, source: "coingecko-ohlc", anchorUsd: spot.priceUsd, stale: spot.stale }
  } catch (e) {
    recordProviderFailure(
      "coingecko-ohlc",
      e instanceof Error ? e.message : "ohlc failed"
    )
    const bars = syntheticBars(spot.priceUsd, d)
    cache.set(key, { bars, at: Date.now() })
    return { bars, source: "synthetic-authority-fallback", anchorUsd: spot.priceUsd, stale: true }
  }
}
