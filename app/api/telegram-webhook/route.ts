import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { TelegramNotifier } from "@/lib/telegram-notifier"
import { buildCommunityBlock } from "@/lib/nexus-bot/community-links"

/**
 * Telegram bot webhook — responds to incoming user messages.
 *
 * Commands:
 *   /start        — Welcome message
 *   /signal       — Current active signal code + details
 *   current       — Same as /signal
 *   current signal — Same as /signal
 *
 * Setup: Register this URL with Telegram BotFather as the webhook:
 *   POST https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://nexuspro.it.com/api/telegram-webhook
 */

const TRADE_SIGNAL_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nexuspro.it.com").replace(/\/+$/, "")

type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type: string }
    text?: string
    from?: { id: number; first_name?: string; username?: string }
  }
}

async function getActiveSignal(): Promise<{
  code: string
  sessionName: string
  sessionSlot: string
  startAt: string
  endAt: string
} | null> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data } = await admin
    .from("trade_sessions")
    .select("code,session_name,session_slot,start_at,end_at")
    .eq("status", "active")
    .lte("start_at", now)
    .gte("end_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    code: String(data.code),
    sessionName: String(data.session_name),
    sessionSlot: String(data.session_slot),
    startAt: String(data.start_at),
    endAt: String(data.end_at),
  }
}

function formatEAT(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("en-KE", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit", hour12: false })
}

function formatDateEAT(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("en-KE", { timeZone: "Africa/Nairobi", day: "2-digit", month: "short" })
}

export async function POST(request: Request) {
  try {
    const update: TelegramUpdate = await request.json()
    const msg = update.message
    if (!msg?.text || !msg.chat) {
      return NextResponse.json({ ok: true })
    }

    const chatId = msg.chat.id
    const text = msg.text.trim().toLowerCase()
    const firstName = msg.from?.first_name ?? "Trader"
    const notifier = new TelegramNotifier()

    if (text === "/start") {
      await notifier.sendToChat(
        [
          `👋 *Welcome to Nexus Pro, ${firstName}!*`,
          ``,
          `I'm your trading signal bot. Here's what I can do:`,
          ``,
          `📟 \`/signal\` — Get the current active signal`,
          `ℹ️ \`/help\` — Show available commands`,
          ``,
          `Stay connected:`,
          ``,
          buildCommunityBlock(),
        ].join("\n"),
        chatId,
      )
      return NextResponse.json({ ok: true })
    }

    if (text === "/help") {
      await notifier.sendToChat(
        [
          `📟 *Nexus Pro Bot Commands*`,
          ``,
          `\`/signal\` — Current active signal code & details`,
          `\`/start\` — Welcome message`,
          `\`/help\` — This help message`,
          ``,
          `Trade signals are published daily at 5:00 AM and 6:00 PM EAT.`,
          ``,
          buildCommunityBlock(),
        ].join("\n"),
        chatId,
      )
      return NextResponse.json({ ok: true })
    }

    // "current", "current signal", "signal", "/signal" — all return active signal
    if (text === "/signal" || text.includes("current") || text.includes("signal")) {
      const active = await getActiveSignal()

      if (!active) {
        await notifier.sendToChat(
          [
            `🔍 *No Active Signal*`,
            ``,
            `There is no active trading session right now.`,
            ``,
            `📅 Next signals are published at:`,
            `☀️ 5:00 AM EAT (Morning Session — trade 7AM→11AM)`,
            `🌙 6:00 PM EAT (Evening Session — trade 9PM→7AM)`,
            ``,
            `Stay connected for the next opportunity:`,
            ``,
            buildCommunityBlock(),
          ].join("\n"),
          chatId,
        )
      } else {
        const slotLabel = active.sessionSlot === "morning" ? "☀️ Morning Session" : "🌙 Night Session"
        const signalUrl = `${TRADE_SIGNAL_URL}/signal/${active.code}`
        await notifier.sendToChat(
          [
            `🚀 *ACTIVE SIGNAL AVAILABLE*`,
            ``,
            `${slotLabel}`,
            `📅 ${formatDateEAT(active.startAt)}`,
            ``,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            ``,
            `📟 *Signal Code*`,
            `\`${active.code}\``,
            ``,
            `🔗 *Activate Here*`,
            signalUrl,
            ``,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            ``,
            `Session: ${active.sessionName}`,
            `Active: ${formatEAT(active.startAt)} → ${formatEAT(active.endAt)}`,
            ``,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            ``,
            buildCommunityBlock(),
          ].join("\n"),
          chatId,
        )
      }
      return NextResponse.json({ ok: true })
    }

    // Unknown command — polite fallback
    await notifier.sendToChat(
      [
        `Hi ${firstName}! 👋`,
        ``,
        `Use \`/signal\` to check the current active trading signal.`,
        `Use \`/help\` to see all available commands.`,
      ].join("\n"),
      chatId,
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[telegram-webhook] Error:", e)
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 })
  }
}
