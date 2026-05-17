import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { getMarketPriceAuthorityPayload } from "@/lib/server/market-price-authority"

/**
 * Canonical BTC/USDT reference quote (multi-provider failover, server cache).
 */
export async function GET(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  const force = new URL(request.url).searchParams.get("force") === "1"

  try {
    const payload = await getMarketPriceAuthorityPayload({ force })
    const quote = payload.btc
    return NextResponse.json(
      {
        ok: true,
        symbol: quote.symbol,
        priceUsd: quote.priceUsd,
        change24hPct: quote.change24hPct,
        updatedAt: quote.updatedAt,
        authorityRevision: payload.authorityRevision,
        refreshedAt: payload.refreshedAt,
        provider: quote.provider,
        stale: quote.stale,
        source: `authority:${quote.provider}`,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
        },
      }
    )
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json(
      { ok: false, error: message, updatedAt: Date.now() },
      { status: 502 }
    )
  }
}
