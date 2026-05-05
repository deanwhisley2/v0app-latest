import { NextRequest, NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { fetchTradableSpotUsdtBases } from "@/lib/exchange-tradable-bases-server"

/**
 * GET ?exchangeId=binance|bitget|kucoin
 * Returns USDT spot base symbols tradable on that venue (public API; no user keys).
 */
export async function GET(request: NextRequest) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get("exchangeId")?.trim() || "binance"

  try {
    const result = await fetchTradableSpotUsdtBases(raw)
    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json(
      { ok: false, error: message, exchangeId: raw.toLowerCase() },
      { status: 502 }
    )
  }
}
