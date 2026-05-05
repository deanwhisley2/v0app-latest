import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { buildLiveMarketFromBinance } from "@/lib/binance-live-market-server"

/**
 * Aggregated Binance spot USDT market snapshot (public API + exchangeInfo validation).
 * No API keys required.
 */
export async function GET() {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  try {
    const { gainers, volumeLeaders, catalog } = await buildLiveMarketFromBinance()
    return NextResponse.json(
      {
        ok: true,
        source: "binance-spot-usdt",
        updatedAt: Date.now(),
        gainers,
        volumeLeaders,
        catalog,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
        },
      }
    )
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json(
      { ok: false, source: "binance", error: message, updatedAt: Date.now() },
      { status: 502 }
    )
  }
}
