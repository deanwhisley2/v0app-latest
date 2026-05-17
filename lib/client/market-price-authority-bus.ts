"use client"

import { MARKET_PRICE_CLIENT_POLL_MS } from "@/lib/market-price-constants"
import type { Coin } from "@/lib/coins-data"

export type MarketAuthorityBtc = {
  priceUsd: number
  change24hPct: number
  updatedAt: number
  provider: string
  stale: boolean
}

export type MarketAuthorityClientState = {
  status: "idle" | "loading" | "live" | "degraded"
  authorityRevision: number
  refreshedAt: number
  btc: MarketAuthorityBtc | null
  catalog: Coin[]
  gainers: Coin[]
  volumeLeaders: Coin[]
  pricesBySymbol: Record<string, { priceUsd: number; change24hPct: number; updatedAt: number }>
  source?: string
}

type Listener = () => void

let state: MarketAuthorityClientState = {
  status: "idle",
  authorityRevision: 0,
  refreshedAt: 0,
  btc: null,
  catalog: [],
  gainers: [],
  volumeLeaders: [],
  pricesBySymbol: {},
}

let subscribers = 0
let pollTimer: ReturnType<typeof setInterval> | null = null
let inFlight: Promise<void> | null = null
let started = false

const listeners = new Set<Listener>()

function emit() {
  for (const fn of listeners) fn()
}

function mergeCatalog(payload: {
  catalog?: Coin[]
  gainers?: Coin[]
  volumeLeaders?: Coin[]
}): void {
  const catalog = payload.catalog ?? []
  state = {
    ...state,
    catalog,
    gainers: payload.gainers ?? catalog,
    volumeLeaders: payload.volumeLeaders ?? catalog,
    status: catalog.length > 0 ? "live" : state.status === "live" ? "live" : "degraded",
  }
}

async function fetchAuthority(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    if (state.status === "idle") {
      state = { ...state, status: "loading" }
      emit()
    }
    try {
      const res = await fetch("/api/market/authority", { cache: "no-store" })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        authorityRevision?: number
        refreshedAt?: number
        btc?: {
          priceUsd?: number
          change24hPct?: number
          updatedAt?: number
          provider?: string
          stale?: boolean
        }
        live?: {
          source?: string
          catalog?: Coin[]
          gainers?: Coin[]
          volumeLeaders?: Coin[]
        }
        pricesBySymbol?: Record<
          string,
          { priceUsd: number; change24hPct: number; updatedAt: number }
        >
      }

      if (!res.ok || !data.ok || typeof data.btc?.priceUsd !== "number") {
        state = {
          ...state,
          status: state.btc ? "degraded" : state.status,
        }
        emit()
        return
      }

      const prevBtc = state.btc?.priceUsd
      const btc: MarketAuthorityBtc = {
        priceUsd: data.btc.priceUsd,
        change24hPct: data.btc.change24hPct ?? 0,
        updatedAt: data.btc.updatedAt ?? Date.now(),
        provider: data.btc.provider ?? "authority",
        stale: Boolean(data.btc.stale),
      }

      state = {
        status: btc.stale && !prevBtc ? "degraded" : "live",
        authorityRevision: data.authorityRevision ?? state.authorityRevision,
        refreshedAt: data.refreshedAt ?? Date.now(),
        btc,
        catalog: data.live?.catalog ?? state.catalog,
        gainers: data.live?.gainers ?? state.gainers,
        volumeLeaders: data.live?.volumeLeaders ?? state.volumeLeaders,
        pricesBySymbol: data.pricesBySymbol ?? state.pricesBySymbol,
        source: data.live?.source,
      }
      mergeCatalog(data.live ?? {})
      emit()
    } catch {
      state = { ...state, status: state.btc ? "degraded" : "loading" }
      emit()
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

function startPolling() {
  if (started) return
  started = true
  void fetchAuthority()
  pollTimer = setInterval(() => void fetchAuthority(), MARKET_PRICE_CLIENT_POLL_MS)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  started = false
}

export function subscribeMarketPriceAuthority(listener: Listener): () => void {
  listeners.add(listener)
  subscribers += 1
  if (subscribers === 1) startPolling()
  listener()
  return () => {
    listeners.delete(listener)
    subscribers = Math.max(0, subscribers - 1)
    if (subscribers === 0) stopPolling()
  }
}

export function getMarketPriceAuthorityClientState(): MarketAuthorityClientState {
  return state
}

export function getLiveSymbolPrice(symbol: string): number | null {
  const sym = symbol.toUpperCase()
  const row = state.pricesBySymbol[sym]
  if (row?.priceUsd > 0) return row.priceUsd
  if (sym === "BTC" && state.btc) return state.btc.priceUsd
  const coin = state.catalog.find((c) => c.symbol === sym)
  return coin?.price ?? null
}
