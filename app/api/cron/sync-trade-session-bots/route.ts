import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { computeTradeSessionSettlementMonitoring } from "@/lib/server/trade-session-settlement-monitoring"
import { advanceTradeSessionLifecycle } from "@/lib/server/trade-sessions"

/**
 * Promote booked trade sessions to running at scheduled start and settle at end.
 * Guard with `CRON_SECRET`: header `x-cron-secret` or `Authorization: Bearer`.
 */
export async function POST(request: Request) {
  try {
    const configured = process.env.CRON_SECRET?.trim()
    const headerSecret =
      request.headers.get("x-cron-secret")?.trim() ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
    if (!configured || headerSecret !== configured) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = createAdminClient()
    const { expiredTradeSessions, legacyCompleted: completedLegacyBotSessions, repair: repairResult } =
      await advanceTradeSessionLifecycle(admin)
    const settlementMonitoring = await computeTradeSessionSettlementMonitoring(admin)

    if (settlementMonitoring.hasStrandedCapital) {
      console.warn("[sync-trade-session-bots] stranded capital after settlement pass", settlementMonitoring)
    }

    return NextResponse.json({
      ok: !settlementMonitoring.hasStrandedCapital,
      expiredTradeSessions,
      completedLegacyBotSessions,
      repairResult,
      settlementMonitoring,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
