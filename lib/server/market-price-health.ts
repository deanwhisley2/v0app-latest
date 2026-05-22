import type { MarketPriceProviderId } from "@/lib/server/market-price-governance"

export type ProviderHealthRow = {
  id: MarketPriceProviderId | string
  successCount: number
  failureCount: number
  lastSuccessAt: number | null
  lastFailureAt: number | null
  lastError: string | null
  lastLatencyMs: number | null
  avgLatencyMs: number | null
}

export type MarketPriceObservability = {
  cacheAgeMs: number
  btcQuoteAgeMs: number
  staleSinceMs: number | null
  totalFailoverEvents: number
  authorityUptimeMs: number
  lastRefreshOkAt: number | null
  consecutiveRefreshFailures: number
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
  alertLevel: "ok" | "warn" | "critical"
  alertCodes: string[]
  observability: MarketPriceObservability
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
  alertLevel: "ok",
  alertCodes: [],
  observability: {
    cacheAgeMs: 0,
    btcQuoteAgeMs: 0,
    staleSinceMs: null,
    totalFailoverEvents: 0,
    authorityUptimeMs: 0,
    lastRefreshOkAt: null,
    consecutiveRefreshFailures: 0,
  },
  providers: [],
  recentEvents: [],
}

const AUTHORITY_STARTED_AT = Date.now()
let totalFailoverEvents = 0
let staleSince: number | null = null
let lastRefreshOkAt: number | null = null
let consecutiveRefreshFailures = 0

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
      lastLatencyMs: null,
      avgLatencyMs: null,
    }
    providerStats.set(id, r)
  }
  return r
}

export function recordProviderLatency(id: string, latencyMs: number) {
  const r = row(id)
  r.lastLatencyMs = latencyMs
  if (r.avgLatencyMs == null) r.avgLatencyMs = latencyMs
  else r.avgLatencyMs = Math.round(r.avgLatencyMs * 0.7 + latencyMs * 0.3)
}

export function recordFailoverEvent() {
  totalFailoverEvents += 1
}

export function setStaleState(stale: boolean) {
  if (stale && staleSince == null) staleSince = Date.now()
  if (!stale) staleSince = null
}

export function recordRefreshOk() {
  lastRefreshOkAt = Date.now()
  consecutiveRefreshFailures = 0
}

export function recordRefreshFail() {
  consecutiveRefreshFailures += 1
}

export function getConsecutiveRefreshFailures() {
  return consecutiveRefreshFailures
}

function buildObservability(): MarketPriceObservability {
  const now = Date.now()
  return {
    cacheAgeMs: health.lastRefreshAt ? now - health.lastRefreshAt : 0,
    btcQuoteAgeMs: health.lastBtcUpdatedAt ? now - health.lastBtcUpdatedAt : 0,
    staleSinceMs: staleSince ? now - staleSince : null,
    totalFailoverEvents,
    authorityUptimeMs: now - AUTHORITY_STARTED_AT,
    lastRefreshOkAt,
    consecutiveRefreshFailures,
  }
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
  if (patch.stale !== undefined) setStaleState(patch.stale)
  health = {
    ...health,
    ...patch,
    observability: buildObservability(),
    providers: Array.from(providerStats.values()),
  }
  if (patch.event) pushEvent(patch.event)
}

export function getMarketPriceHealthSnapshot(): MarketPriceHealthSnapshot {
  return {
    ...health,
    observability: buildObservability(),
    providers: Array.from(providerStats.values()),
    recentEvents: [...health.recentEvents],
  }
}
