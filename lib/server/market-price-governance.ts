/**
 * Canonical market-price governance (server).
 * Constants live in lib/market-price-constants.ts for client parity.
 */

export {
  MARKET_PRICE_CACHE_REFRESH_MS,
  MARKET_PRICE_CLIENT_POLL_MS,
  MARKET_PRICE_PROVIDER_TIMEOUT_MS,
  MARKET_PRICE_PROVIDER_RETRY_COOLDOWN_MS,
  MARKET_PRICE_SOFT_STALE_MS,
  MARKET_PRICE_EMERGENCY_MAX_AGE_MS,
  MARKET_PRICE_ADMIN_ALERT_MS,
  MARKET_PRICE_DISPLAY_BLEND_MS,
} from "@/lib/market-price-constants"

/** Deterministic provider order for BTC spot (first success wins). */
export const BTC_PROVIDER_ORDER = [
  "coingecko",
  "kraken",
  "coinbase",
  "okx",
  "binance",
] as const

export type MarketPriceProviderId =
  | (typeof BTC_PROVIDER_ORDER)[number]
  | "cache-emergency"
