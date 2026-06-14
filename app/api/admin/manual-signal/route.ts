import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { generateTradeCodes, registerTradeSession } from "@/lib/server/trade-sessions"
import { TelegramNotifier } from "@/lib/telegram-notifier"
import { buildCommunityBlock } from "@/lib/nexus-bot/community-links"
import { buildMarketInsight } from "@/lib/nexus-bot/trading-quotes"
import { formatEAT, formatISODate, toEAT } from "@/lib/nexus-bot/signal-schedule"

/**
 * POST /api/admin/manual-signal
 *
 * Admin 5 manual signal override.
 * If admin creates a signal manually, the system skips auto-generation.
 * The auto cron checks if a signal already exists for the slot before creating one.
 *
 * Body:
 *   slot: "morning" | "evening"
 *   sessionName?: string (optional)
 *   startAt?: string (ISO, optional — auto-calculated if omitted)
 *   endAt?: string (ISO, optional — auto-calculated if omitted)
 *   customEarningPercent?: number (optional — override default yield %)
 *   signalCode?: string (optional — use specific code)
 */
export async function POST(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as {
      slot?: string
      sessionName?: string
      startAt?: string
      endAt?: string
      customEarningPercent?: number
      signalCode?: string
      displayLabel?: string
    }

    const slot = body.slot === "evening" ? "evening" : "morning"
    const sessionSlot = slot
    const isMorning = slot === "morning"

    const admin = createAdminClient()
    const now = new Date()
    const eatNow = toEAT(now)

    // Build times based on schedule
    const signalRelease = new Date(eatNow)
    const sessionStart = new Date(eatNow)
    const sessionEnd = new Date(eatNow)

    if (isMorning) {
      signalRelease.setHours(10, 0, 0, 0)
      sessionStart.setHours(13, 0, 0, 0)
      sessionEnd.setHours(17, 30, 0, 0)
    } else {
      signalRelease.setHours(18, 20, 0, 0)
      sessionStart.setHours(0, 10, 0, 0)
      sessionStart.setDate(sessionStart.getDate() + 1)
      sessionEnd.setHours(8, 40, 0, 0)
      sessionEnd.setDate(sessionEnd.getDate() + 1)
    }

    // If custom start/end provided, use those instead
    const startAt = body.startAt
      ? body.startAt
      : new Date(sessionStart.getTime() - 3 * 60 * 60 * 1000).toISOString()  // Convert EAT to UTC
    const endAt = body.endAt
      ? body.endAt
      : new Date(sessionEnd.getTime() - 3 * 60 * 60 * 1000).toISOString()

    // Generate or use provided code
    let code = (body.signalCode ?? "").trim()
    if (!code) {
      const codes = await generateTradeCodes(admin, actor.id, 1)
      if (!codes || codes.length === 0) {
        return NextResponse.json({ error: "Failed to generate trade code" }, { status: 500 })
      }
      code = codes[0]
    }

    const sessionName = body.sessionName ?? (isMorning ? "Morning Signal (Manual Override)" : "Evening Signal (Manual Override)")

    // Register the session
    const registered = await registerTradeSession(admin, {
      actorId: actor.id,
      code,
      sessionName,
      sessionSlot,
      startAt,
      endAt,
      status: "active",
      displayLabel: body.displayLabel,
      ...(body.customEarningPercent != null ? { maxYieldPercent: body.customEarningPercent } : {}),
    })

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nexuspro.it.com").replace(/\/+$/, "")
    const signalUrl = `${siteUrl}/signal/${code}`

    // Build Telegram message
    const emojiHeader = isMorning ? "🌅" : "🌙"
    const headerLabel = isMorning ? "MANUAL TRADE SIGNAL (ADMIN)" : "MANUAL NIGHT SIGNAL (ADMIN)"
    const sessionLabel = isMorning ? "MORNING SIGNAL SESSION" : "EVENING SIGNAL SESSION"
    const quote = buildMarketInsight(now, slot)

    const startDate = new Date(startAt)
    const endDate = new Date(endAt)
    const startTimeStr = startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" })
    const endTimeStr = endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" })
    const dateStr = startDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })

    const message = [
      `🚀 *NEXUS PRO — ${headerLabel}*`,
      ``,
      `${emojiHeader} *${sessionLabel}*`,
      `📅 ${dateStr}`,
      `🕒 Signal Released: Admin Manual Override`,
      `⏰ Trading Window: ${startTimeStr} → ${endTimeStr}`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `📟 *SIGNAL CODE*`,
      `\`${code}\``,
      ``,
      `🔗 *ACTIVATE SIGNAL*`,
      signalUrl,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `🛠 *Admin Note*`,
      ``,
      body.customEarningPercent != null
        ? `This session has a custom earning target of *${body.customEarningPercent}%*.`
        : `This signal was manually released by the administration team. Follow the standard session rules.`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `🔥 *TRADING MOTIVATION*`,
      ``,
      quote,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      buildCommunityBlock(),
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `⚠️ *Important*`,
      ``,
      `This signal remains active only during the session window. Verify and activate before the countdown expires.`,
      ``,
      `🚀 *Nexus Pro Intelligence Engine*`,
      `Powering Smarter Crypto Decisions`,
    ].join("\n")

    // Send to Telegram
    const notifier = new TelegramNotifier()
    const sent = await notifier.sendMessage(message)

    return NextResponse.json({
      ok: true,
      slot,
      code,
      sessionId: registered.sessionId,
      sessionName: registered.sessionName,
      startAt: registered.startAt,
      endAt: registered.endAt,
      telegramDelivered: sent,
      adminOverride: true,
      customEarningPercent: body.customEarningPercent ?? null,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/manual-signal
 * Check if a signal already exists for the current slot (to avoid duplicates).
 */
export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const admin = createAdminClient()
    const { searchParams } = new URL(request.url)
    const slot = searchParams.get("slot") ?? "morning"

    // Check if there's an active session for this slot today
    const now = new Date().toISOString()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStart = today.toISOString()

    const { data: activeSessions } = await admin
      .from("trade_sessions")
      .select("id,code,session_name,session_slot,status,start_at,end_at,created_at")
      .eq("session_slot", slot)
      .gte("created_at", todayStart)
      .order("created_at", { ascending: false })
      .limit(5)

    return NextResponse.json({
      hasActive: (activeSessions ?? []).some(s => s.status === "active"),
      sessions: activeSessions ?? [],
      slot,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
