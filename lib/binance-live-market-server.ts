/**
 * Server-only: Binance spot USDT tickers → app Coin shape.
 * Symbols are validated against exchangeInfo (TRADING + SPOT + USDT).
 */

import type { Coin } from "@/lib/coins-data"

export interface Binance24hTicker {
  symbol: string
  lastPrice: string
  priceChangePercent: string
  quoteVolume: string
  volume: string
}

let validUsdtSpotSymbols: { set: Set<string>; at: number } | null = null
const SYMBOL_CACHE_MS = 60 * 60 * 1000

async function loadValidSpotUsdtSymbols(): Promise<Set<string>> {
  const now = Date.now()
  if (validUsdtSpotSymbols && now - validUsdtSpotSymbols.at < SYMBOL_CACHE_MS) {
    return validUsdtSpotSymbols.set
  }

  const res = await fetch("https://api.binance.com/api/v3/exchangeInfo", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) {
    throw new Error(`Binance exchangeInfo HTTP ${res.status}`)
  }
  const data = (await res.json()) as {
    symbols: Array<{
      symbol: string
      status: string
      quoteAsset: string
      permissions?: string[]
      permissionSets?: string[][]
    }>
  }

  const hasSpot = (s: {
    permissions?: string[]
    permissionSets?: string[][]
  }): boolean => {
    if (s.permissions?.includes("SPOT")) return true
    return Boolean(
      s.permissionSets?.some((set) => Array.isArray(set) && set.includes("SPOT"))
    )
  }

  const set = new Set<string>()
  for (const s of data.symbols) {
    if (s.status !== "TRADING") continue
    if (s.quoteAsset !== "USDT") continue
    if (!hasSpot(s)) continue
    set.add(s.symbol)
  }
  validUsdtSpotSymbols = { set, at: now }
  return set
}

/** Binance leveraged / structured products we exclude from “coin” lists. */
function isExcludedUsdtSymbol(symbol: string): boolean {
  if (/(UP|DOWN|BEAR|BULL)USDT$/.test(symbol)) return true
  return false
}

const STABLE_BASES = new Set([
  "USDC",
  "USDT",
  "FDUSD",
  "TUSD",
  "BUSD",
  "DAI",
  "USDP",
  "EUR",
  "GBP",
  "AEUR",
  "USDE",
])

function baseAssetFromPair(symbol: string): string {
  if (symbol.endsWith("USDT")) return symbol.slice(0, -4)
  return symbol
}

function symbolHue(symbol: string): number {
  let h = 0
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0
  return h % 360
}

export function tickerRowToCoin(t: Binance24hTicker): Coin {
  const base = baseAssetFromPair(t.symbol)
  const price = parseFloat(t.lastPrice)
  const change24h = parseFloat(t.priceChangePercent)
  const volume = parseFloat(t.quoteVolume)
  const hue = symbolHue(t.symbol)
  return {
    symbol: base,
    name: `${base}/USDT`,
    price: Number.isFinite(price) ? price : 0,
    change24h: Number.isFinite(change24h) ? change24h : 0,
    change7d: change24h,
    volume: Number.isFinite(volume) ? volume : 0,
    marketCap: 0,
    color: `hsl(${hue} 58% 46%)`,
  }
}

export type LiveMarketBuild = {
  gainers: Coin[]
  volumeLeaders: Coin[]
  catalog: Coin[]
}

const MIN_QUOTE_VOL_USDT = 250_000

export async function buildLiveMarketFromBinance(): Promise<LiveMarketBuild> {
  const valid = await loadValidSpotUsdtSymbols()

  const res = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) {
    throw new Error(`Binance ticker/24hr HTTP ${res.status}`)
  }
  const rows = (await res.json()) as Binance24hTicker[]

  const filtered = rows.filter((t) => {
    if (!valid.has(t.symbol)) return false
    if (isExcludedUsdtSymbol(t.symbol)) return false
    const qv = parseFloat(t.quoteVolume)
    if (!Number.isFinite(qv) || qv < MIN_QUOTE_VOL_USDT) return false
    const base = baseAssetFromPair(t.symbol)
    if (STABLE_BASES.has(base)) return false
    return true
  })

  const coins = filtered.map(tickerRowToCoin)
  const byVol = [...coins].sort((a, b) => b.volume - a.volume)
  const volumeLeaders = byVol.slice(0, 36)

  const gainers = [...coins]
    .filter((c) => c.change24h > 0)
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 36)

  const catalogMap = new Map<string, Coin>()
  for (const c of volumeLeaders) catalogMap.set(c.symbol, c)
  for (const c of gainers) {
    const existing = catalogMap.get(c.symbol)
    if (!existing || c.volume > existing.volume) catalogMap.set(c.symbol, c)
  }
  for (const sym of ["BTC", "ETH", "SOL", "BNB", "XRP"]) {
    if (!catalogMap.has(sym)) {
      const row = filtered.find((t) => baseAssetFromPair(t.symbol) === sym)
      if (row) catalogMap.set(sym, tickerRowToCoin(row))
    }
  }

  const catalog = Array.from(catalogMap.values()).sort((a, b) => b.volume - a.volume)

  return { gainers, volumeLeaders, catalog }
}

/**
 * Spot USDT base symbols (e.g. BTC) that are TRADING + SPOT on Binance.
 * Shares the same exchangeInfo cache as live market builds.
 */
export async function getBinanceSpotUsdtTradableBases(): Promise<string[]> {
  const valid = await loadValidSpotUsdtSymbols()
  const bases = new Set<string>()
  for (const sym of valid) {
    if (!sym.endsWith("USDT")) continue
    if (isExcludedUsdtSymbol(sym)) continue
    const b = baseAssetFromPair(sym)
    if (STABLE_BASES.has(b)) continue
    bases.add(b)
  }
  return Array.from(bases).sort()
}
