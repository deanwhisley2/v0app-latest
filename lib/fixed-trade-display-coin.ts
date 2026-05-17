import { stringSeed } from "@/lib/container-earnings-schedule"

const DISPLAY_COIN_SYMBOLS = ["BTC", "ETH", "SOL", "AVAX", "BNB"] as const

/** Deterministic desk coin symbol for a session seed (price comes from market authority). */
export function displayCoinSymbolForFixedSession(seedKey: string): string {
  const idx = stringSeed(seedKey) % DISPLAY_COIN_SYMBOLS.length
  return DISPLAY_COIN_SYMBOLS[idx]!
}

/**
 * @deprecated Use displayCoinSymbolForFixedSession + market authority spot at open.
 * Kept for backward-compatible fallbacks when authority is temporarily unavailable.
 */
export function displayCoinForFixedSession(seedKey: string): {
  coinSymbol: string
  fixedPriceUsd: number
} {
  const coinSymbol = displayCoinSymbolForFixedSession(seedKey)
  const legacyPrices: Record<string, number> = {
    BTC: 67_500,
    ETH: 3_450,
    SOL: 142,
    AVAX: 35,
    BNB: 580,
  }
  return { coinSymbol, fixedPriceUsd: legacyPrices[coinSymbol] ?? 100 }
}
