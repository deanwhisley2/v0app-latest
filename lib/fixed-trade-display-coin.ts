import { stringSeed } from "@/lib/container-earnings-schedule"

const DISPLAY_OPTIONS = [
  { coinSymbol: "BTC", fixedPriceUsd: 67_500 },
  { coinSymbol: "ETH", fixedPriceUsd: 3_450 },
  { coinSymbol: "SOL", fixedPriceUsd: 142 },
  { coinSymbol: "AVAX", fixedPriceUsd: 35 },
  { coinSymbol: "BNB", fixedPriceUsd: 580 },
] as const

/** Deterministic desk display (not spot oracle) — stable across refresh for a given seed. */
export function displayCoinForFixedSession(seedKey: string): { coinSymbol: string; fixedPriceUsd: number } {
  const idx = stringSeed(seedKey) % DISPLAY_OPTIONS.length
  const row = DISPLAY_OPTIONS[idx]!
  return { coinSymbol: row.coinSymbol, fixedPriceUsd: row.fixedPriceUsd }
}
