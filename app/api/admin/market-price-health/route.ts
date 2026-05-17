import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { getMarketPriceHealthSnapshot } from "@/lib/server/market-price-health"
import { getMarketPriceAuthorityPayload } from "@/lib/server/market-price-authority"

/** Level 5: provider diagnostics for market price authority. */
export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const payload = await getMarketPriceAuthorityPayload()
    const health = getMarketPriceHealthSnapshot()
    return NextResponse.json({
      ok: true,
      health,
      alerts: {
        level: health.alertLevel,
        codes: health.alertCodes,
      },
      authorityRevision: payload.authorityRevision,
      refreshedAt: payload.refreshedAt,
      btc: payload.btc,
      liveSource: payload.live.source,
      catalogSymbols: payload.live.catalog.map((c) => c.symbol),
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
