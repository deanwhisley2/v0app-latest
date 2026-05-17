import { getMarketPriceAuthorityPayload } from "@/lib/server/market-price-authority"

/** USD spot index from canonical authority (server routes only). */
export async function getAuthorityUsdPriceIndex(): Promise<Record<string, number>> {
  const payload = await getMarketPriceAuthorityPayload()
  const out: Record<string, number> = {}
  for (const [sym, row] of Object.entries(payload.pricesBySymbol)) {
    if (row.priceUsd > 0) out[sym] = row.priceUsd
  }
  if (payload.btc.priceUsd > 0) out.BTC = payload.btc.priceUsd
  return out
}
