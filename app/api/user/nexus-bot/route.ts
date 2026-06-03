import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { NEXUS_AUTO_TRADE_PLANS } from "@/lib/nexus-bot/plans"
import {
  completeDueNexusBotSessions,
  getAutoTradeGrantsMap,
  recordAttendanceVisit,
} from "@/lib/server/nexus-bot-session-service"
import { readNexusMainAvailableUsd } from "@/lib/server/nexus-main-enforcement"
import { releaseLegacyContainerSessionsForUser } from "@/lib/server/release-legacy-container-sessions"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()

    await completeDueNexusBotSessions(admin, user.id)
    const streak = await recordAttendanceVisit(admin, user.id)
    const grants = await getAutoTradeGrantsMap(admin, user.id)
    const availableUsd = await readNexusMainAvailableUsd(admin, user.id)

    const now = new Date().toISOString()
    const { data: signals } = await admin
      .from("nexus_signal_codes")
      .select("id,slot,code,strategy_title,confidence,duration_hours,window_opens_at,window_closes_at")
      .lte("window_opens_at", now)
      .gte("window_closes_at", now)
      .order("window_opens_at", { ascending: false })
      .limit(4)

    const { data: activeSessions } = await admin
      .from("nexus_bot_sessions")
      .select(
        "id,session_kind,plan_key,stake_usd,strategy_title,confidence,ends_at,created_at,signal_code_id",
      )
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(3)

    const { data: streakRow } = await admin
      .from("user_attendance_streaks")
      .select("current_streak,longest_streak,total_visits,last_visit_date")
      .eq("user_id", user.id)
      .maybeSingle()

    return NextResponse.json({
      availableUsd,
      attendance: streakRow ?? streak,
      autoTradePlans: NEXUS_AUTO_TRADE_PLANS.map((p) => ({
        ...p,
        granted: Boolean(grants[p.key]),
      })),
      openSignals: (signals ?? []).map((s) => ({
        id: s.id,
        slot: s.slot,
        code: s.code,
        strategyTitle: s.strategy_title,
        confidence: s.confidence,
        durationHours: s.duration_hours,
        windowOpensAt: s.window_opens_at,
        windowClosesAt: s.window_closes_at,
      })),
      activeSessions: activeSessions ?? [],
      legacyCopyFixedRetired: true,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}

/** One-time per user: release copy/fixed locks into Nexus Main before Nexus Bot sessions. */
export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as { action?: string }
    if (body.action !== "release_legacy_container") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const admin = createAdminClient()
    const summary = await releaseLegacyContainerSessionsForUser(admin, user.id)
    const availableUsd = await readNexusMainAvailableUsd(admin, user.id)
    return NextResponse.json({ ok: true, summary, availableUsd })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
