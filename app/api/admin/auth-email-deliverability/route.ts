import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { getAuthEmailDeliverabilityDashboard } from "@/lib/server/auth-email-deliverability"

/** Level 5: auth email deliverability — sends, latency proxy, Brevo stats, domain breakdown. */
export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const url = new URL(request.url)
    const hours = Number.parseInt(url.searchParams.get("hours") ?? "24", 10) || 24
    const dashboard = await getAuthEmailDeliverabilityDashboard(hours)

    return NextResponse.json({ ok: true, dashboard })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
