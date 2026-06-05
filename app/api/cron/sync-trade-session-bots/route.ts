import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  completeDueNexusBotSessions,
  syncTradeSessionBotStates,
} from "@/lib/server/nexus-bot-session-service"
import { repairUnsettledCompletedSessions } from "@/lib/server/nexus-bot-settlement-integrity"
import { expireDueTradeSessions } from "@/lib/server/trade-sessions"

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
    await syncTradeSessionBotStates(admin)
    const completedLegacyBotSessions = await completeDueNexusBotSessions(admin)
    const expiredTradeSessions = await expireDueTradeSessions(admin)
    const repairedSettlementCredits = await repairUnsettledCompletedSessions(admin)

    return NextResponse.json({
      ok: true,
      expiredTradeSessions,
      completedLegacyBotSessions,
      repairedSettlementCredits,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
