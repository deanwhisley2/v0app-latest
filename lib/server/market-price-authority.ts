/**
 * Canonical server-side market pricing authority (ONLY backend source for spot reference).
 * Frontends read /api/market/authority — never external exchange APIs.
 */

import type { Coin } from "@/lib/coins-data"
import { COINGECKO_SYMBOL_IDS, LIVE_MARKET_CORE_SYMBOLS } from "@/lib/coingecko-symbol-map"
import {
  buildLiveMarketFromBinance,
  type LiveMarketBuild,
} from "@/lib/binance-live-market-server"
import {
  MARKET_PRICE_ADMIN_ALERT_MS,
  MARKET_PRICE_CACHE_REFRESH_MS,
  MARKET_PRICE_EMERGENCY_MAX_AGE_MS,
  MARKET_PRICE_PROVIDER_RETRY_COOLDOWN_MS,
  MARKET_PRICE_PROVIDER_TIMEOUT_MS,
  MARKET_PRICE_SOFT_STALE_MS,
} from "@/lib/market-price-constants"
import {
  BTC_PROVIDER_ORDER,
  type MarketPriceProviderId,
} from "@/lib/server/market-price-governance"
import {
  getMarketPriceHealthSnapshot,
  recordProviderFailure,
  recordProviderSuccess,
  updateMarketPriceHealth,
} from "@/lib/server/market-price-health"
import {
  evaluateMarketPriceAlerts,
  recordAuthorityRefreshFailure,
  recordAuthorityRefreshSuccess,
} from "@/lib/server/market-price-alerts"

export type { MarketPriceProviderId } from "@/lib/server/market-price-governance"

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

export type SymbolSpotQuote = {
  symbol: string
  priceUsd: number
  change24hPct: number
  updatedAt: number
  provider: MarketPriceProviderId | string
  stale: boolean
}

export type MarketPriceAuthorityPayload = {
  authorityRevision: number
  refreshedAt: number
  btc: BtcSpotQuote
  live: LiveMarketSnapshot
  pricesBySymbol: Record<string, SymbolSpotQuote>
  health: ReturnType<typeof getMarketPriceHealthSnapshot>
}

type AuthorityCache = {
  btc: BtcSpotQuote
  liveMarket: LiveMarketSnapshot
  pricesBySymbol: Record<string, SymbolSpotQuote>
  refreshedAt: number
  authorityRevision: number
}

let cache: AuthorityCache | null = null
let refreshInFlight: Promise<AuthorityCache> | null = null
let lastProviderFailAt = 0

function symbolHue(symbol: string): number {
  let h = 0
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0
  return h % 360
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    signal: init?.signal ?? AbortSignal.timeout(MARKET_PRICE_PROVIDER_TIMEOUT_MS),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

function isBinanceGeoBlock(status: number): boolean {
  return status === 451 || status === 403
}

async function providerCoinGeckoBtc(): Promise<BtcSpotQuote | null> {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true"
  const data = await fetchJson<{ bitcoin?: { usd?: number; usd_24h_change?: number } }>(url)
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
  const data = await fetchJson<{ data?: Array<{ last?: string; open24h?: string }> }>(
    "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT"
  )
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
    const res = await fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(MARKET_PRICE_PROVIDER_TIMEOUT_MS),
      cache: "no-store",
    })
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

const BTC_RUNNERS: Record<
  (typeof BTC_PROVIDER_ORDER)[number],
  () => Promise<BtcSpotQuote | null>
> = {
  coingecko: providerCoinGeckoBtc,
  kraken: providerKrakenBtc,
  coinbase: providerCoinbaseBtc,
  okx: providerOkxBtc,
  binance: providerBinanceBtc,
}

export async function fetchBtcSpotWithFailover(): Promise<{
  quote: BtcSpotQuote
  tried: string[]
  fallbackLevel: number
}> {
  const tried: string[] = []
  let level = 0
  const prevProvider = cache?.btc.provider

  for (const id of BTC_PROVIDER_ORDER) {
    tried.push(id)
    level += 1
    try {
      const q = await BTC_RUNNERS[id]()
      if (q) {
        lastProviderFailAt = 0
        recordProviderSuccess(id)
        if (prevProvider && prevProvider !== id && prevProvider !== "cache-emergency") {
          updateMarketPriceHealth({
            event: `recovery provider=${id} (was ${prevProvider})`,
          })
        }
        return { quote: q, tried, fallbackLevel: level - 1 }
      }
      recordProviderFailure(id, "empty quote")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "provider error"
      recordProviderFailure(id, msg)
    }
  }

  lastProviderFailAt = Date.now()

  if (cache?.btc) {
    const age = Date.now() - cache.btc.updatedAt
    if (age < MARKET_PRICE_EMERGENCY_MAX_AGE_MS) {
      updateMarketPriceHealth({
        event: `emergency-cache ageMs=${age} providers=${tried.join(">")}`,
        emergencyCacheActive: true,
      })
      return {
        quote: {
          ...cache.btc,
          stale: true,
          provider: "cache-emergency",
        },
        tried: [...tried, "cache-emergency"],
        fallbackLevel: BTC_PROVIDER_ORDER.length,
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
    color: `hsl(${hue} 42% 38%)`,
  }
}

function catalogToPricesBySymbol(
  catalog: Coin[],
  btc: BtcSpotQuote,
  provider: string
): Record<string, SymbolSpotQuote> {
  const out: Record<string, SymbolSpotQuote> = {}
  for (const c of catalog) {
    out[c.symbol] = {
      symbol: c.symbol,
      priceUsd: c.price,
      change24hPct: c.change24h,
      updatedAt: Date.now(),
      provider,
      stale: false,
    }
  }
  out.BTC = {
    symbol: "BTC",
    priceUsd: btc.priceUsd,
    change24hPct: btc.change24hPct,
    updatedAt: btc.updatedAt,
    provider: btc.provider,
    stale: btc.stale,
  }
  return out
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

  const data = await fetchJson<Record<string, { usd?: number; usd_24h_change?: number }>>(
    url.toString()
  )

  const coins: Coin[] = []
  for (const [id, row] of Object.entries(data)) {
    const sym = idToSymbol.get(id)
    if (!sym) continue
    const price = row.usd
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue
    coins.push(coinFromQuote(sym, price, Number(row.usd_24h_change ?? 0), sym === "BTC" ? 1e9 : 0))
  }

  if (!coins.some((c) => c.symbol === "BTC")) {
    coins.unshift(coinFromQuote("BTC", btc.priceUsd, btc.change24hPct, 1e9))
  }

  const gainers = [...coins]
    .filter((c) => c.change24h > 0)
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 36)

  const volumeLeaders = [...coins]
    .sort((a, b) => {
      if (a.symbol === "BTC") return -1
      if (b.symbol === "BTC") return 1
      return Math.abs(b.change24h) - Math.abs(a.change24h)
    })
    .slice(0, 36)

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
    recordProviderSuccess("binance-catalog")
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
    recordProviderFailure("binance-catalog", msg)
    updateMarketPriceHealth({ event: `failover catalog→coingecko (${msg})` })
  }

  const cg = await buildLiveMarketFromCoinGecko(btc)
  recordProviderSuccess("coingecko-catalog")
  return {
    ...cg,
    providerChain: [...chain, ...cg.providerChain],
  }
}

async function refreshAuthorityCache(): Promise<AuthorityCache> {
  const prevRevision = cache?.authorityRevision ?? 0
  const now = Date.now()
  if (
    cache &&
    now - lastProviderFailAt < MARKET_PRICE_PROVIDER_RETRY_COOLDOWN_MS &&
    lastProviderFailAt > 0
  ) {
    return { ...cache, authorityRevision: prevRevision }
  }

  let btc: BtcSpotQuote
  let tried: string[]
  let fallbackLevel: number
  try {
    ;({ quote: btc, tried, fallbackLevel } = await fetchBtcSpotWithFailover())
  } catch (e) {
    lastProviderFailAt = Date.now()
    if (cache) return cache
    throw e
  }
  const liveMarket = await buildLiveMarketResilient(btc)
  liveMarket.providerChain = [...tried, ...liveMarket.providerChain]

  const pricesBySymbol = catalogToPricesBySymbol(
    liveMarket.catalog,
    btc,
    liveMarket.source
  )

  const refreshedAt = Date.now()
  const authorityRevision = prevRevision + 1
  const btcAge = refreshedAt - btc.updatedAt
  const stale =
    btc.stale ||
    btcAge > MARKET_PRICE_SOFT_STALE_MS ||
    refreshedAt - liveMarket.updatedAt > MARKET_PRICE_SOFT_STALE_MS

  const adminAlert =
    btc.provider === "cache-emergency" && btcAge >= MARKET_PRICE_ADMIN_ALERT_MS

  if (fallbackLevel > 0 && btc.provider !== "cache-emergency") {
    updateMarketPriceHealth({
      event: `failover level=${fallbackLevel} active=${btc.provider}`,
    })
  }
  if (adminAlert) {
    updateMarketPriceHealth({ event: "admin-alert emergency-cache exceeded soft threshold" })
  }

  const healthBase = {
    activeProvider: btc.provider,
    fallbackLevel,
    authorityRevision,
    lastRefreshAt: refreshedAt,
    lastBtcUpdatedAt: btc.updatedAt,
    stale,
    emergencyCacheActive: btc.provider === "cache-emergency",
    adminAlert,
  }
  updateMarketPriceHealth(healthBase)

  const alerts = evaluateMarketPriceAlerts({
    health: getMarketPriceHealthSnapshot(),
    btc,
    refreshedAt,
  })
  if (alerts.level !== "ok") {
    updateMarketPriceHealth({
      alertLevel: alerts.level,
      alertCodes: alerts.codes,
      event: `alerts level=${alerts.level} codes=${alerts.codes.join(",")}`,
    })
  } else {
    updateMarketPriceHealth({ alertLevel: "ok", alertCodes: [] })
  }

  recordAuthorityRefreshSuccess()

  const next: AuthorityCache = {
    btc,
    liveMarket,
    pricesBySymbol,
    refreshedAt,
    authorityRevision,
  }
  cache = next
  return next
}

function withStaleFlags(entry: AuthorityCache): AuthorityCache {
  const age = Date.now() - entry.refreshedAt
  const stale = age > MARKET_PRICE_SOFT_STALE_MS
  return {
    ...entry,
    btc: { ...entry.btc, stale: stale || entry.btc.stale },
    liveMarket: { ...entry.liveMarket, stale: stale || entry.liveMarket.stale },
    pricesBySymbol: Object.fromEntries(
      Object.entries(entry.pricesBySymbol).map(([k, v]) => [
        k,
        { ...v, stale: stale || v.stale },
      ])
    ),
  }
}

export async function getMarketPriceAuthority(opts?: {
  force?: boolean
}): Promise<AuthorityCache> {
  const force = opts?.force === true
  const now = Date.now()

  if (!force && cache && now - cache.refreshedAt < MARKET_PRICE_CACHE_REFRESH_MS) {
    return withStaleFlags(cache)
  }

  if (!force && refreshInFlight) {
    return withStaleFlags(await refreshInFlight)
  }

  refreshInFlight = refreshAuthorityCache()
    .then((c) => c)
    .catch((e) => {
      recordAuthorityRefreshFailure()
      throw e
    })
    .finally(() => {
      refreshInFlight = null
    })

  return withStaleFlags(await refreshInFlight)
}

export async function getMarketPriceAuthorityPayload(opts?: {
  force?: boolean
}): Promise<MarketPriceAuthorityPayload> {
  const entry = await getMarketPriceAuthority(opts)
  return {
    authorityRevision: entry.authorityRevision,
    refreshedAt: entry.refreshedAt,
    btc: entry.btc,
    live: entry.liveMarket,
    pricesBySymbol: entry.pricesBySymbol,
    health: getMarketPriceHealthSnapshot(),
  }
}

export async function getAuthoritativeBtcQuote(opts?: { force?: boolean }): Promise<BtcSpotQuote> {
  return (await getMarketPriceAuthority(opts)).btc
}

export async function getAuthoritativeLiveMarket(opts?: {
  force?: boolean
}): Promise<LiveMarketSnapshot> {
  return (await getMarketPriceAuthority(opts)).liveMarket
}

/** Live spot for a symbol from the unified authority cache (future multi-asset ready). */
export async function getSymbolSpotUsd(symbol: string): Promise<SymbolSpotQuote> {
  const sym = symbol.toUpperCase().trim()
  const entry = await getMarketPriceAuthority()
  const hit = entry.pricesBySymbol[sym]
  if (hit && hit.priceUsd > 0) return hit

  if (sym === "BTC") return entry.btc

  const id = COINGECKO_SYMBOL_IDS[sym]
  if (id) {
    try {
      const data = await fetchJson<Record<string, { usd?: number; usd_24h_change?: number }>>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`
      )
      const row = data[id]
      const price = row?.usd
      if (typeof price === "number" && Number.isFinite(price) && price > 0) {
        recordProviderSuccess("coingecko-symbol")
        return {
          symbol: sym,
          priceUsd: price,
          change24hPct: Number(row?.usd_24h_change ?? 0),
          updatedAt: Date.now(),
          provider: "coingecko",
          stale: false,
        }
      }
    } catch (e) {
      recordProviderFailure(
        "coingecko-symbol",
        e instanceof Error ? e.message : "symbol fetch failed"
      )
    }
  }

  if (cache?.pricesBySymbol[sym]) {
    return { ...cache.pricesBySymbol[sym], stale: true }
  }

  throw new Error(`No authority price for ${sym}`)
}
