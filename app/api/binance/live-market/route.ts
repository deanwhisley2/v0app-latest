import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { getMarketPriceAuthorityPayload } from "@/lib/server/market-price-authority"

/**
 * Live market snapshot — resilient multi-provider (legacy path; prefer /api/market/live).
 */
export async function GET(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  const force = new URL(request.url).searchParams.get("force") === "1"

  try {
    const payload = await getMarketPriceAuthorityPayload({ force })
    const snap = payload.live
    return NextResponse.json(
      {
        ok: true,
        source: snap.source,
        updatedAt: snap.updatedAt,
        authorityRevision: payload.authorityRevision,
        refreshedAt: payload.refreshedAt,
        stale: snap.stale || payload.btc.stale,
        providerChain: snap.providerChain,
        btc: payload.btc,
        gainers: snap.gainers,
        volumeLeaders: snap.volumeLeaders,
        catalog: snap.catalog,
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
      { ok: false, source: "authority", error: message, updatedAt: Date.now() },
      { status: 502 }
    )
  }
}
