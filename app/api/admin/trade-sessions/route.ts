import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import {
  expireDueTradeSessions,
  generateTradeCodes,
  getTradeSessionAdminStats,
  getTradeSessionByCode,
  humanizeTradeSessionError,
  registerTradeSession,
} from "@/lib/server/trade-sessions"
import {
  getTradeSessionParticipantCounts,
  terminateTradeSessionByAdmin,
} from "@/lib/server/nexus-bot-session-service"

export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const admin = createAdminClient()
    await expireDueTradeSessions(admin)
    const { searchParams } = new URL(request.url)
    const view = searchParams.get("view") ?? "all"
    const reviewUserId = searchParams.get("userId")?.trim() || null

    let q = admin
      .from("trade_sessions")
      .select(
        "id,code,session_name,session_slot,start_at,end_at,status,display_label,created_at,expired_at,admin_terminated_at",
      )
      .order("created_at", { ascending: false })
      .limit(80)

    if (view === "active") q = q.eq("status", "active")
    if (view === "expired") q = q.eq("status", "expired")

    const [{ data: sessions, error }, stats, { data: pool }] = await Promise.all([
      q,
      getTradeSessionAdminStats(admin),
      admin
        .from("trade_code_generations")
        .select("id,code,trade_session_id,created_at")
        .is("trade_session_id", null)
        .order("created_at", { ascending: false })
        .limit(40),
    ])
    if (error) throw new Error(error.message)

    const sessionIds = (sessions ?? []).map((s) => String(s.id))
    const participantCounts = await getTradeSessionParticipantCounts(admin, sessionIds)
    const sessionsWithCounts = (sessions ?? []).map((s) => ({
      ...s,
      participants: participantCounts[String(s.id)] ?? { active: 0, completed: 0 },
      adminTerminated: Boolean(s.admin_terminated_at),
    }))

    let memberPoints: {
      points: number
      completedSessions: number
      events: Array<{
        delta: number
        reason: string
        source: string
        session_reference: string | null
        created_at: string
      }>
    } | null = null
    if (reviewUserId) {
      const [{ data: bal }, { data: events }] = await Promise.all([
        admin
          .from("user_performance_points")
          .select("points,completed_sessions")
          .eq("user_id", reviewUserId)
          .maybeSingle(),
        admin
          .from("performance_point_events")
          .select("delta,reason,source,session_reference,created_at")
          .eq("user_id", reviewUserId)
          .order("created_at", { ascending: false })
          .limit(50),
      ])
      memberPoints = {
        points: Number(bal?.points ?? 0),
        completedSessions: Number(bal?.completed_sessions ?? 0),
        events: events ?? [],
      }
    }

    return NextResponse.json({
      sessions: sessionsWithCounts,
      stats,
      unregisteredCodes: pool ?? [],
      memberPoints,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as {
      action?: "generate" | "register" | "terminate"
      count?: number
      code?: string
      sessionName?: string
      sessionSlot?: string
      startAt?: string
      endAt?: string
      status?: "draft" | "active"
      displayLabel?: string
      tradeSessionId?: string
    }

    const admin = createAdminClient()

    if (body.action === "terminate") {
      const tradeSessionId = String(body.tradeSessionId ?? "").trim()
      if (!tradeSessionId) {
        return NextResponse.json({ error: "tradeSessionId required" }, { status: 400 })
      }
      const out = await terminateTradeSessionByAdmin(admin, {
        tradeSessionId,
        actorId: actor.id,
      })
      return NextResponse.json({
        ok: true,
        terminated: true,
        message: `Session ${out.code} closed — ${out.participantsSettled} participant(s) settled at full session target.`,
        ...out,
      })
    }

    if (body.action === "generate") {
      const codes = await generateTradeCodes(admin, actor.id, Math.min(10, Number(body.count) || 3))
      return NextResponse.json({ ok: true, codes })
    }

    if (body.action === "register") {
      const out = await registerTradeSession(admin, {
        actorId: actor.id,
        code: body.code ?? "",
        sessionName: body.sessionName ?? "",
        sessionSlot: body.sessionSlot ?? "morning",
        startAt: body.startAt ?? "",
        endAt: body.endAt ?? "",
        status: body.status === "draft" ? "draft" : "active",
        displayLabel: body.displayLabel,
      })
      const persisted = await getTradeSessionByCode(admin, out.code)
      if (!persisted) {
        return NextResponse.json({ error: "Registration did not persist — retry." }, { status: 500 })
      }
      return NextResponse.json({
        ok: true,
        registered: true,
        session: persisted,
        sessionId: persisted.sessionId,
        code: persisted.code,
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden"
    const friendly = humanizeTradeSessionError(msg)
    const isClient =
      msg.includes("CODE_") ||
      msg.includes("INVALID") ||
      msg.includes("SESSION_NAME") ||
      msg.includes("FORMAT")
    return NextResponse.json({ error: friendly, code: msg }, { status: isClient ? 400 : 403 })
  }
}
