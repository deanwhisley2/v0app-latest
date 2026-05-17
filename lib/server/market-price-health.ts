import type { MarketPriceProviderId } from "@/lib/server/market-price-governance"

export type ProviderHealthRow = {
  id: MarketPriceProviderId | string
  successCount: number
  failureCount: number
  lastSuccessAt: number | null
  lastFailureAt: number | null
  lastError: string | null
}

export type MarketPriceHealthSnapshot = {
  activeProvider: MarketPriceProviderId | null
  fallbackLevel: number
  authorityRevision: number
  lastRefreshAt: number
  lastBtcUpdatedAt: number
  stale: boolean
  emergencyCacheActive: boolean
  adminAlert: boolean
  providers: ProviderHealthRow[]
  recentEvents: string[]
}

const MAX_EVENTS = 24

let health: MarketPriceHealthSnapshot = {
  activeProvider: null,
  fallbackLevel: 0,
  authorityRevision: 0,
  lastRefreshAt: 0,
  lastBtcUpdatedAt: 0,
  stale: false,
  emergencyCacheActive: false,
  adminAlert: false,
  providers: [],
  recentEvents: [],
}

const providerStats = new Map<string, ProviderHealthRow>()

function row(id: string): ProviderHealthRow {
  let r = providerStats.get(id)
  if (!r) {
    r = {
      id,
      successCount: 0,
      failureCount: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
    }
    providerStats.set(id, r)
  }
  return r
}

function pushEvent(msg: string) {
  const line = `${new Date().toISOString()} ${msg}`
  health.recentEvents = [line, ...health.recentEvents].slice(0, MAX_EVENTS)
  if (msg.includes("admin-alert") || msg.includes("emergency-cache")) {
    console.warn(`[market-price-authority] ${msg}`)
  } else if (msg.includes("failover") || msg.includes("recovery")) {
    console.log(`[market-price-authority] ${msg}`)
  }
}

export function recordProviderSuccess(id: string) {
  const r = row(id)
  r.successCount += 1
  r.lastSuccessAt = Date.now()
  r.lastError = null
}

export function recordProviderFailure(id: string, error: string) {
  const r = row(id)
  r.failureCount += 1
  r.lastFailureAt = Date.now()
  r.lastError = error.slice(0, 200)
}

export function updateMarketPriceHealth(patch: Partial<MarketPriceHealthSnapshot> & { event?: string }) {
  health = {
    ...health,
    ...patch,
    providers: Array.from(providerStats.values()),
  }
  if (patch.event) pushEvent(patch.event)
}

export function getMarketPriceHealthSnapshot(): MarketPriceHealthSnapshot {
  return {
    ...health,
    providers: Array.from(providerStats.values()),
    recentEvents: [...health.recentEvents],
  }
}
