import { getAuthorityUsdPriceIndex } from "@/lib/server/authority-price-index"

let cache: Record<string, number> = {}
let cachedAt = 0
const TTL_MS = 60_000

/** USD prices for exchange balance valuation (canonical authority only). */
export async function getExchangeBalanceUsdPrices(): Promise<Record<string, number>> {
  const now = Date.now()
  if (now - cachedAt < TTL_MS && Object.keys(cache).length > 0) return cache
  try {
    cache = await getAuthorityUsdPriceIndex()
    cachedAt = now
  } catch {
    /* keep prior cache if any */
  }
  return cache
}
