/**
 * Canonical server-side BTC + live-market pricing (multi-provider failover).
 * Frontend must read /api/market/btc and /api/market/live — never external exchanges.
 */

import type { Coin } from "@/lib/coins-data"
import { COINGECKO_SYMBOL_IDS, LIVE_MARKET_CORE_SYMBOLS } from "@/lib/coingecko-symbol-map"
import {
  buildLiveMarketFromBinance,
  type LiveMarketBuild,
} from "@/lib/binance-live-market-server"

export type MarketPriceProviderId =
  | "coingecko"
  | "kraken"
  | "coinbase"
  | "okx"
  | "binance"
  | "cache-emergency"

export type BtcSpotQuote = {
  symbol: "BTC"
  priceUsd: number
  change24hPct: number
  updatedAt: number
  provider: MarketPriceProviderId
  stale: boolean
}

export type LiveMarketSnapshot = LiveMarketBuild & {
  source: string
  updatedAt: number
  stale: boolean
  providerChain: string[]
}

const REFRESH_INTERVAL_MS = 20_000
const STALE_AFTER_MS = 90_000
const EMERGENCY_MAX_AGE_MS = 15 * 60_000
const PROVIDER_TIMEOUT_MS = 8_000

type AuthorityCache = {
  btc: BtcSpotQuote
  liveMarket: LiveMarketSnapshot
  refreshedAt: number
}

let cache: AuthorityCache | null = null
let refreshInFlight: Promise<AuthorityCache> | null = null

function symbolHue(symbol: string): number {
  let h = 0
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0
  return h % 360
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    signal: init?.signal ?? AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return (await res.json()) as T
}

function isBinanceGeoBlock(status: number): boolean {
  return status === 451 || status === 403
}

async function providerCoinGeckoBtc(): Promise<BtcSpotQuote | null> {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true"
  const data = await fetchJson<{
    bitcoin?: { usd?: number; usd_24h_change?: number }
  }>(url)
  const row = data.bitcoin
  const price = row?.usd
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null
  return {
    symbol: "BTC",
    priceUsd: price,
    change24hPct: Number(row?.usd_24h_change ?? 0),
    updatedAt: Date.now(),
    provider: "coingecko",
    stale: false,
  }
}

async function providerKrakenBtc(): Promise<BtcSpotQuote | null> {
  const data = await fetchJson<{
    result?: { XXBTZUSD?: { c?: [string, string]; p?: [string, string] } }
  }>("https://api.kraken.com/0/public/Ticker?pair=XBTUSD")
  const row = data.result?.XXBTZUSD
  const price = parseFloat(row?.c?.[0] ?? "")
  const open = parseFloat(row?.p?.[1] ?? row?.c?.[0] ?? "")
  if (!Number.isFinite(price) || price <= 0) return null
  const change24hPct =
    Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : 0
  return {
    symbol: "BTC",
    priceUsd: price,
    change24hPct,
    updatedAt: Date.now(),
    provider: "kraken",
    stale: false,
  }
}

async function providerCoinbaseBtc(): Promise<BtcSpotQuote | null> {
  const data = await fetchJson<{ data?: { amount?: string } }>(
    "https://api.coinbase.com/v2/prices/BTC-USD/spot"
  )
  const price = parseFloat(data.data?.amount ?? "")
  if (!Number.isFinite(price) || price <= 0) return null
  return {
    symbol: "BTC",
    priceUsd: price,
    change24hPct: 0,
    updatedAt: Date.now(),
    provider: "coinbase",
    stale: false,
  }
}

async function providerOkxBtc(): Promise<BtcSpotQuote | null> {
  const data = await fetchJson<{
    data?: Array<{ last?: string; open24h?: string }>
  }>("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT")
  const row = data.data?.[0]
  const price = parseFloat(row?.last ?? "")
  const open = parseFloat(row?.open24h ?? "")
  if (!Number.isFinite(price) || price <= 0) return null
  const change24hPct =
    Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : 0
  return {
    symbol: "BTC",
    priceUsd: price,
    change24hPct,
    updatedAt: Date.now(),
    provider: "okx",
    stale: false,
  }
}

async function providerBinanceBtc(): Promise<BtcSpotQuote | null> {
  try {
    const res = await fetch(
      "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        cache: "no-store",
      }
    )
    if (!res.ok) {
      if (isBinanceGeoBlock(res.status)) return null
      throw new Error(`Binance BTC HTTP ${res.status}`)
    }
    const row = (await res.json()) as { lastPrice?: string; priceChangePercent?: string }
    const price = parseFloat(row.lastPrice ?? "")
    const change24hPct = parseFloat(row.priceChangePercent ?? "0")
    if (!Number.isFinite(price) || price <= 0) return null
    return {
      symbol: "BTC",
      priceUsd: price,
      change24hPct: Number.isFinite(change24hPct) ? change24hPct : 0,
      updatedAt: Date.now(),
      provider: "binance",
      stale: false,
    }
  } catch {
    return null
  }
}

const BTC_PROVIDER_CHAIN: Array<{
  id: MarketPriceProviderId
  run: () => Promise<BtcSpotQuote | null>
}> = [
  { id: "coingecko", run: providerCoinGeckoBtc },
  { id: "kraken", run: providerKrakenBtc },
  { id: "coinbase", run: providerCoinbaseBtc },
  { id: "okx", run: providerOkxBtc },
  { id: "binance", run: providerBinanceBtc },
]

export async function fetchBtcSpotWithFailover(): Promise<{
  quote: BtcSpotQuote
  tried: string[]
}> {
  const tried: string[] = []
  for (const { id, run } of BTC_PROVIDER_CHAIN) {
    tried.push(id)
    try {
      const q = await run()
      if (q) return { quote: q, tried }
    } catch {
      /* next provider */
    }
  }

  if (cache?.btc) {
    const age = Date.now() - cache.btc.updatedAt
    if (age < EMERGENCY_MAX_AGE_MS) {
      return {
        quote: {
          ...cache.btc,
          stale: true,
          provider: "cache-emergency",
          updatedAt: cache.btc.updatedAt,
        },
        tried: [...tried, "cache-emergency"],
      }
    }
  }

  throw new Error("All BTC price providers failed and no emergency cache")
}

function coinFromQuote(symbol: string, price: number, change24h: number, volume = 0): Coin {
  const hue = symbolHue(symbol)
  return {
    symbol,
    name: `${symbol}/USDT`,
    price,
    change24h,
    change7d: change24h,
    volume,
    marketCap: 0,
    color: `hsl(${hue} 58% 46%)`,
  }
}

async function buildLiveMarketFromCoinGecko(btc: BtcSpotQuote): Promise<LiveMarketSnapshot> {
  const symbols = [...LIVE_MARKET_CORE_SYMBOLS]
  const idToSymbol = new Map<string, string>()
  const ids: string[] = []
  for (const sym of symbols) {
    const id = COINGECKO_SYMBOL_IDS[sym]
    if (!id) continue
    if (!idToSymbol.has(id)) {
      idToSymbol.set(id, sym)
      ids.push(id)
    }
  }
  if (!ids.includes("bitcoin")) {
    ids.unshift("bitcoin")
    idToSymbol.set("bitcoin", "BTC")
  }

  const url = new URL("https://api.coingecko.com/api/v3/simple/price")
  url.searchParams.set("ids", ids.join(","))
  url.searchParams.set("vs_currencies", "usd")
  url.searchParams.set("include_24hr_change", "true")

  const data = await fetchJson<
    Record<string, { usd?: number; usd_24h_change?: number }>
  >(url.toString())

  const coins: Coin[] = []
  for (const [id, row] of Object.entries(data)) {
    const sym = idToSymbol.get(id)
    if (!sym) continue
    const price = row.usd
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue
    coins.push(
      coinFromQuote(sym, price, Number(row.usd_24h_change ?? 0), sym === "BTC" ? 1e9 : 0)
    )
  }

  if (!coins.some((c) => c.symbol === "BTC")) {
    coins.unshift(
      coinFromQuote("BTC", btc.priceUsd, btc.change24hPct, 1e9)
    )
  }

  const gainers = [...coins]
    .filter((c) => c.change24h > 0)
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 36)

  const volumeLeaders = [...coins].sort((a, b) => {
    if (a.symbol === "BTC") return -1
    if (b.symbol === "BTC") return 1
    return Math.abs(b.change24h) - Math.abs(a.change24h)
  }).slice(0, 36)

  const catalogMap = new Map<string, Coin>()
  for (const c of volumeLeaders) catalogMap.set(c.symbol, c)
  for (const c of gainers) catalogMap.set(c.symbol, c)
  const catalog = Array.from(catalogMap.values()).sort((a, b) => {
    if (a.symbol === "BTC") return -1
    if (b.symbol === "BTC") return 1
    return b.volume - a.volume
  })

  return {
    gainers,
    volumeLeaders,
    catalog,
    source: "coingecko-simple-multi",
    updatedAt: Date.now(),
    stale: false,
    providerChain: ["coingecko-catalog", `btc:${btc.provider}`],
  }
}

async function buildLiveMarketResilient(btc: BtcSpotQuote): Promise<LiveMarketSnapshot> {
  const chain: string[] = []
  try {
    const binance = await buildLiveMarketFromBinance()
    chain.push("binance-spot-usdt")
    return {
      ...binance,
      source: "binance-spot-usdt",
      updatedAt: Date.now(),
      stale: false,
      providerChain: chain,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "binance-failed"
    chain.push(`binance-failed:${msg}`)
  }

  const cg = await buildLiveMarketFromCoinGecko(btc)
  return {
    ...cg,
    providerChain: [...chain, ...cg.providerChain],
  }
}

async function refreshAuthorityCache(): Promise<AuthorityCache> {
  const { quote: btc, tried } = await fetchBtcSpotWithFailover()
  const liveMarket = await buildLiveMarketResilient(btc)
  liveMarket.providerChain = [...tried, ...liveMarket.providerChain]

  const next: AuthorityCache = {
    btc,
    liveMarket,
    refreshedAt: Date.now(),
  }
  cache = next
  return next
}

function withStaleFlags(entry: AuthorityCache): AuthorityCache {
  const age = Date.now() - entry.refreshedAt
  const stale = age > STALE_AFTER_MS
  return {
    ...entry,
    btc: { ...entry.btc, stale: stale || entry.btc.stale },
    liveMarket: { ...entry.liveMarket, stale: stale || entry.liveMarket.stale },
  }
}

export async function getMarketPriceAuthority(opts?: {
  force?: boolean
}): Promise<AuthorityCache> {
  const force = opts?.force === true
  const now = Date.now()

  if (!force && cache && now - cache.refreshedAt < REFRESH_INTERVAL_MS) {
    return withStaleFlags(cache)
  }

  if (!force && refreshInFlight) {
    return withStaleFlags(await refreshInFlight)
  }

  refreshInFlight = refreshAuthorityCache()
    .then((c) => c)
    .finally(() => {
      refreshInFlight = null
    })

  return withStaleFlags(await refreshInFlight)
}

export async function getAuthoritativeBtcQuote(opts?: { force?: boolean }): Promise<BtcSpotQuote> {
  const entry = await getMarketPriceAuthority(opts)
  return entry.btc
}

export async function getAuthoritativeLiveMarket(opts?: {
  force?: boolean
}): Promise<LiveMarketSnapshot> {
  const entry = await getMarketPriceAuthority(opts)
  return entry.liveMarket
}
