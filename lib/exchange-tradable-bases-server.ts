/**
 * Server-only: tradable spot USDT bases per exchange (public APIs).
 */

import { getBinanceSpotUsdtTradableBases } from "@/lib/binance-live-market-server"

export type TradableBasesResult = {
  exchangeId: string
  bases: string[]
  updatedAt: number
  source: string
}

async function fetchBitgetSpotUsdtBases(): Promise<string[]> {
  const res = await fetch("https://api.bitget.com/api/v2/spot/public/symbols", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`Bitget symbols HTTP ${res.status}`)
  const json = (await res.json()) as {
    code?: string
    data?: Array<{
      baseCoin?: string
      quoteCoin?: string
      status?: string
    }>
  }
  if (json.code && json.code !== "00000") {
    throw new Error(`Bitget symbols code ${json.code}`)
  }
  const bases = new Set<string>()
  for (const row of json.data ?? []) {
    if (String(row.quoteCoin).toUpperCase() !== "USDT") continue
    if (String(row.status).toLowerCase() !== "online") continue
    const b = String(row.baseCoin ?? "").toUpperCase()
    if (b) bases.add(b)
  }
  return Array.from(bases).sort()
}

async function fetchKucoinSpotUsdtBases(): Promise<string[]> {
  const res = await fetch("https://api.kucoin.com/api/v1/symbols", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`KuCoin symbols HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: Array<{
      symbol?: string
      quoteCurrency?: string
      enableTrading?: boolean
    }>
  }
  const bases = new Set<string>()
  for (const row of json.data ?? []) {
    if (String(row.quoteCurrency).toUpperCase() !== "USDT") continue
    if (row.enableTrading === false) continue
    const sym = String(row.symbol ?? "")
    if (!sym.endsWith("-USDT")) continue
    bases.add(sym.replace("-USDT", "").toUpperCase())
  }
  return Array.from(bases).sort()
}

export async function fetchTradableSpotUsdtBases(exchangeId: string): Promise<TradableBasesResult> {
  const id = exchangeId.trim().toLowerCase()
  const now = Date.now()

  if (id === "binance") {
    const bases = await getBinanceSpotUsdtTradableBases()
    return { exchangeId: id, bases, updatedAt: now, source: "binance-exchangeInfo+spot" }
  }

  if (id === "bitget") {
    const bases = await fetchBitgetSpotUsdtBases()
    return { exchangeId: id, bases, updatedAt: now, source: "bitget-spot-public-symbols" }
  }

  if (id === "kucoin") {
    const bases = await fetchKucoinSpotUsdtBases()
    return { exchangeId: id, bases, updatedAt: now, source: "kucoin-symbols" }
  }

  throw new Error(`Unsupported exchangeId for tradable list: ${exchangeId}`)
}
