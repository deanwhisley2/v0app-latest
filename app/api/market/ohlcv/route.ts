import { NextRequest, NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { getAuthoritativeOhlcv } from "@/lib/server/market-ohlcv-authority"

/** Server-authoritative OHLCV for charts (anchored to market-price-authority spot). */
export async function GET(request: NextRequest) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get("symbol") || "BTC").toUpperCase()
  const days = Number(searchParams.get("days") || "1")

  try {
    const out = await getAuthoritativeOhlcv(symbol, days)
    return NextResponse.json(
      {
        ok: true,
        symbol,
        days,
        source: out.source,
        anchorUsd: out.anchorUsd,
        stale: out.stale,
        bars: out.bars,
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
    )
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
