/**
 * Canonical reference assets for market-price-authority (expand here for new symbols).
 * USDT is unit-of-account; FX overlays are future work.
 */
export const MARKET_REFERENCE_ASSETS = [
  "BTC",
  "ETH",
  "SOL",
  "BNB",
  "XRP",
  "ADA",
  "DOGE",
  "AVAX",
  "LINK",
  "DOT",
  "MATIC",
  "LTC",
  "UNI",
  "ATOM",
  "NEAR",
] as const

export type MarketReferenceAsset = (typeof MARKET_REFERENCE_ASSETS)[number]

export function isMarketReferenceAsset(symbol: string): symbol is MarketReferenceAsset {
  return (MARKET_REFERENCE_ASSETS as readonly string[]).includes(symbol.toUpperCase())
}
