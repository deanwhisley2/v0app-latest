import { displayCoinSymbolForFixedSession } from "@/lib/fixed-trade-display-coin"
import { getSymbolSpotUsd } from "@/lib/server/market-price-authority"

export type FixedTradeMarketLock = {
  coinSymbol: string
  fixedPriceUsd: number
  liveAtOpen: boolean
  provider: string
}

/** Authoritative lock reference at fixed-trade open (real spot from market authority). */
export async function resolveFixedTradeMarketLock(seedKey: string): Promise<FixedTradeMarketLock> {
  const coinSymbol = displayCoinSymbolForFixedSession(seedKey)
  try {
    const spot = await getSymbolSpotUsd(coinSymbol)
    return {
      coinSymbol,
      fixedPriceUsd: Math.round(spot.priceUsd),
      liveAtOpen: !spot.stale,
      provider: String(spot.provider),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "authority unavailable"
    console.warn(`[fixed-trade-market-lock] fallback seed=${seedKey} ${msg}`)
    const { displayCoinForFixedSession } = await import("@/lib/fixed-trade-display-coin")
    const legacy = displayCoinForFixedSession(seedKey)
    return {
      coinSymbol: legacy.coinSymbol,
      fixedPriceUsd: legacy.fixedPriceUsd,
      liveAtOpen: false,
      provider: "legacy-fallback",
    }
  }
}
