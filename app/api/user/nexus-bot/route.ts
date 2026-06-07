import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  acknowledgeProfitCelebration,
  findPendingProfitCelebration,
  getAutoTradeGrantsMap,
  recordAttendanceVisit,
  resolveUserDisplayPhase,
} from "@/lib/server/nexus-bot-session-service"
import { sessionProgressPct } from "@/lib/nexus-bot/session-earnings-ux"
import { userSessionPresentation, TRADE_SESSION_OPEN_STATUSES } from "@/lib/nexus-bot/user-session-messaging"
import { readNexusMainAvailableUsd } from "@/lib/server/nexus-main-enforcement"
import { releaseLegacyContainerSessionsForUser } from "@/lib/server/release-legacy-container-sessions"
import { advanceTradeSessionLifecycle } from "@/lib/server/trade-sessions"
import { NEXUS_AUTO_TRADE_PLANS } from "@/lib/nexus-bot/plans"

function mapTradeSessionForUser(row: Record<string, unknown>) {
  const ts = row.trade_sessions as { start_at?: string; end_at?: string; session_slot?: string } | null
  const startAt = ts?.start_at ? String(ts.start_at) : ""
  const endAt = ts?.end_at ? String(ts.end_at) : String(row.ends_at ?? "")
  const sessionSlot = String(ts?.session_slot ?? "morning")
  const status = String(row.status ?? "")
  const now = new Date()
  const endMs = endAt ? new Date(endAt).getTime() : NaN
  const pastEnd = Number.isFinite(endMs) && now.getTime() >= endMs
  const phaseKey = resolveUserDisplayPhase({
    status,
    startAt,
    endAt,
    displayPhase: row.display_phase ? String(row.display_phase) : null,
    now,
    financiallyResolved: status === "completed" || !pastEnd,
  })
  const presentation = userSessionPresentation(phaseKey)
  const stake = Number(row.stake_usd ?? 0)
  const weight = Number(row.participation_weight ?? 1)
  const isOpen = (TRADE_SESSION_OPEN_STATUSES as readonly string[]).includes(status)
  const earningsWithdrawable = status === "completed"
  return {
    id: String(row.id),
    session_kind: String(row.session_kind ?? "signal"),
    stake_usd: stake,
    status,
    phaseKey,
    headline: presentation.headline,
    detail: presentation.detail,
    participation_weight: weight,
    profit_released_usd: isOpen ? 0 : Number(row.profit_released_usd ?? 0),
    earnings_withdrawable: earningsWithdrawable,
    session_start_at: startAt || null,
    session_end_at: endAt || null,
    session_progress_pct: isOpen && startAt && endAt ? sessionProgressPct({ startAt, endAt }) : 0,
    earnings_locked: isOpen,
  }
}

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()

    await advanceTradeSessionLifecycle(admin, { userId: user.id })

    const streak = await recordAttendanceVisit(admin, user.id)
    const grants = await getAutoTradeGrantsMap(admin, user.id)
    const availableUsd = await readNexusMainAvailableUsd(admin, user.id)
    const pendingProfitCelebration = await findPendingProfitCelebration(admin, user.id)

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
        "id,session_kind,stake_usd,ends_at,created_at,status,display_phase,participation_weight,profit_released_usd,trade_session_id,user_id,trade_sessions(start_at,end_at,session_slot)",
      )
      .eq("user_id", user.id)
      .in("status", [...TRADE_SESSION_OPEN_STATUSES])
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
      activeSessions: (activeSessions ?? []).map((r) =>
        mapTradeSessionForUser(r as Record<string, unknown>),
      ),
      pendingProfitCelebration,
      legacyCopyFixedRetired: true,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      sessionId?: string
    }

    const admin = createAdminClient()

    if (body.action === "ack_profit_celebration") {
      const sessionId = typeof body.sessionId === "string" ? body.sessionId : ""
      if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 })
      await acknowledgeProfitCelebration(admin, user.id, sessionId)
      return NextResponse.json({ ok: true })
    }

    if (body.action !== "release_legacy_container") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

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
