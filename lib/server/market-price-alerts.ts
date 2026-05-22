import {
  MARKET_PRICE_ADMIN_ALERT_MS,
  MARKET_PRICE_EMERGENCY_MAX_AGE_MS,
  MARKET_PRICE_SOFT_STALE_MS,
} from "@/lib/market-price-constants"
import type { BtcSpotQuote } from "@/lib/server/market-price-authority"
import type { MarketPriceHealthSnapshot } from "@/lib/server/market-price-health"

export type MarketPriceAlertLevel = "ok" | "warn" | "critical"

export type MarketPriceAlerts = {
  level: MarketPriceAlertLevel
  codes: string[]
  messages: string[]
}

import { getConsecutiveRefreshFailures } from "@/lib/server/market-price-health"

export function recordAuthorityRefreshSuccess() {
  /* refresh counters live in market-price-health */
}

export function recordAuthorityRefreshFailure() {
  /* refresh counters live in market-price-health */
}

export function evaluateMarketPriceAlerts(input: {
  health: MarketPriceHealthSnapshot
  btc: BtcSpotQuote
  refreshedAt: number
}): MarketPriceAlerts {
  const codes: string[] = []
  const messages: string[] = []
  const now = Date.now()
  const btcAge = now - input.btc.updatedAt
  const refreshAge = now - input.refreshedAt

  if (input.btc.provider === "cache-emergency") {
    codes.push("EMERGENCY_CACHE")
    messages.push("Serving emergency last-good BTC quote")
  }

  if (input.health.emergencyCacheActive) {
    codes.push("EMERGENCY_CACHE_ACTIVE")
  }

  if (input.health.adminAlert || btcAge >= MARKET_PRICE_ADMIN_ALERT_MS) {
    codes.push("STALE_EXCEEDED_ADMIN")
    messages.push("BTC quote age exceeded admin threshold")
  }

  if (input.health.stale || refreshAge > MARKET_PRICE_SOFT_STALE_MS) {
    codes.push("SOFT_STALE")
    messages.push("Authority cache soft-stale")
  }

  if (btcAge >= MARKET_PRICE_EMERGENCY_MAX_AGE_MS) {
    codes.push("EMERGENCY_WINDOW_EXCEEDED")
    messages.push("BTC quote beyond emergency max age")
  }

  const refreshFails = getConsecutiveRefreshFailures()
  if (refreshFails >= 3) {
    codes.push("REFRESH_FAILURES")
    messages.push(`Authority refresh failed ${refreshFails} times in a row`)
  }

  if (input.health.fallbackLevel >= 3) {
    codes.push("DEEP_FAILOVER")
    messages.push(`Provider fallback level ${input.health.fallbackLevel}`)
  }

  const level: MarketPriceAlertLevel =
    codes.includes("EMERGENCY_WINDOW_EXCEEDED") || codes.includes("REFRESH_FAILURES")
      ? "critical"
      : codes.length > 0
        ? "warn"
        : "ok"

  return { level, codes, messages }
}
