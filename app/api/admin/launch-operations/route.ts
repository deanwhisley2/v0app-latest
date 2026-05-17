import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { buildLaunchOperationsSnapshot } from "@/lib/server/launch-operations-metrics"

/** Level 5: launch-period operational metrics (24h rolling). */
export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const snapshot = await buildLaunchOperationsSnapshot()
    return NextResponse.json({ ok: true, snapshot, time: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
