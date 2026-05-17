import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { MARKET_PRICE_CACHE_REFRESH_MS } from "@/lib/market-price-constants"
import { getMarketPriceAuthorityPayload } from "@/lib/server/market-price-authority"

/**
 * Unified canonical market authority (BTC + live catalog + health revision).
 * All dashboard/container/ticker surfaces should poll this endpoint only.
 */
export async function GET(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  const force = new URL(request.url).searchParams.get("force") === "1"

  try {
    const payload = await getMarketPriceAuthorityPayload({ force })
    return NextResponse.json(
      {
        ok: true,
        ...payload,
        live: {
          source: payload.live.source,
          updatedAt: payload.live.updatedAt,
          stale: payload.live.stale,
          providerChain: payload.live.providerChain,
          gainers: payload.live.gainers,
          volumeLeaders: payload.live.volumeLeaders,
          catalog: payload.live.catalog,
        },
      },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${Math.floor(MARKET_PRICE_CACHE_REFRESH_MS / 1000)}, stale-while-revalidate=30`,
        },
      }
    )
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ ok: false, error: message, updatedAt: Date.now() }, { status: 502 })
  }
}
