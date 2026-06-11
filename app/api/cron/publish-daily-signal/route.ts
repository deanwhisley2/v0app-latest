import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
  generateTradeCodes,
  registerTradeSession,
} from "@/lib/server/trade-sessions";
import { TelegramNotifier } from "@/lib/telegram-notifier";
import { buildCommunityBlock } from "@/lib/nexus-bot/community-links";
import {
  buildMarketInsight,
  buildSessionResultQuote,
} from "@/lib/nexus-bot/trading-quotes";
import {
  buildSessionWindow,
  detectSlot,
  fromEAT,
  formatEAT,
  formatISODate,
  toEAT,
} from "@/lib/nexus-bot/signal-schedule";

/**
 * CRON: Publish one trade signal to Telegram channel.
 * Called by VPS crontab at ~5:00 AM EAT (morning) and ~6:00 PM EAT (evening).
 *
 * Schedule (Africa / EAT = UTC+3):
 *   ☀️ Morning:   Signal 05:00  → Trade 07:00–11:00 (same day)
 *   🌙 Evening:   Signal 18:00  → Trade 21:00–07:00 (next day)
 *
 * Guard: `CRON_SECRET` in header `x-cron-secret` or `Authorization: Bearer`.
 */
export async function POST(request: Request) {
  try {
    // ── Auth ──────────────────────────────────────────────
    const configured = process.env.CRON_SECRET?.trim();
    const headerSecret =
      request.headers.get("x-cron-secret")?.trim() ||
      request.headers
        .get("authorization")
        ?.replace(/^Bearer\s+/i, "")
        .trim();
    if (!configured || headerSecret !== configured) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const slot = detectSlot();
    const admin = createAdminClient();
    const actorId = process.env.NEXUS_EXPERT_FALLBACK_USER_ID?.trim();

    if (!actorId) {
      return NextResponse.json(
        { error: "NEXUS_EXPERT_FALLBACK_USER_ID not configured" },
        { status: 500 },
      );
    }

    const notifier = new TelegramNotifier();
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://nexuspro.it.com"
    ).replace(/\/+$/, "");
    const now = new Date();
    let sessionClosedMessage: string | null = null;

    // ── Check for recently expired sessions → send close notification ──
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { data: expiredSessions } = await admin
      .from("trade_sessions")
      .select("id,code,session_name,session_slot,status,expired_at,end_at")
      .eq("status", "expired")
      .gte("expired_at", oneHourAgo)
      .lt("expired_at", now.toISOString())
      .order("expired_at", { ascending: false })
      .limit(2);

    if (expiredSessions && expiredSessions.length > 0) {
      for (const expired of expiredSessions) {
        const expiredSlot =
          expired.session_slot === "evening" ? "evening" : "morning";
        const slotLabel =
          expiredSlot === "morning" ? "Morning Session" : "Night Session";
        const resultQuote = buildSessionResultQuote(
          new Date(expired.expired_at ?? now),
        );

        const closeMsg = [
          `🏁 *NEXUS PRO — SESSION CLOSED*`,
          ``,
          `📅 ${formatISODate(expired.end_at)}`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ``,
          `📟 Signal Code: \`${expired.code}\``,
          `📋 Session: ${expired.session_name ?? slotLabel}`,
          `✅ Status: *CLOSED*`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ``,
          `🔥 *PERFORMANCE MESSAGE*`,
          ``,
          resultQuote,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ``,
          `🚀 *Preparing Next Signal Session...*`,
          ``,
          `The Nexus Pro Intelligence Engine is currently analyzing live market conditions and generating the next opportunity.`,
          ``,
          `⏳ Next Signal Release: ${slot === "morning" ? "Today at 6:00 PM EAT" : "Tomorrow at 5:00 AM EAT"}`,
          ``,
          `Stay connected:`,
          ``,
          buildCommunityBlock(),
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ``,
          `Nexus Pro — Crypto Intelligence`,
        ].join("\n");

        await notifier.sendMessage(closeMsg);
        sessionClosedMessage = closeMsg;
      }
    }

    // ── Generate 1 trade code ─────────────────────────────
    const codes = await generateTradeCodes(admin, actorId, 1);
    if (!codes || codes.length === 0) {
      return NextResponse.json(
        { error: "Failed to generate trade code" },
        { status: 500 },
      );
    }
    const code = codes[0];

    // ── Build session window (EAT) ────────────────────────
    const window = buildSessionWindow(slot);
    // Convert back to UTC for DB storage
    const startUtc = fromEAT(window.sessionStart);
    const endUtc = fromEAT(window.sessionEnd);

    // ── Register as active session ────────────────────────
    const sessionName =
      slot === "morning"
        ? `Morning Signal · ${formatISODate(window.sessionStart.toISOString())}`
        : `Evening Signal · ${formatISODate(window.sessionStart.toISOString())}`;
    const registered = await registerTradeSession(admin, {
      actorId,
      code,
      sessionName,
      sessionSlot: slot,
      startAt: startUtc.toISOString(),
      endAt: endUtc.toISOString(),
      status: "active",
    });

    // ── Build premium Telegram message ────────────────────
    const signalUrl = `${siteUrl}/signal/${code}`;

    const isMorning = slot === "morning";
    const emojiHeader = isMorning ? "🌅" : "🌙";
    const headerLabel = isMorning
      ? "PREMIUM TRADE SIGNAL"
      : "NIGHT SESSION SIGNAL";
    const sessionLabel = isMorning
      ? "MORNING SIGNAL SESSION"
      : "EVENING SIGNAL SESSION";
    const startTimeEAT = formatEAT(window.sessionStart);
    const endTimeEAT = formatEAT(window.sessionEnd);

    // Motivational quote (unique per slot)
    const quote = buildMarketInsight(now, slot);

    // Build the session time string (handle overnight)
    const dateStr = formatISODate(window.sessionStart.toISOString());
    let timeWindowStr: string;
    if (window.crossesMidnight) {
      timeWindowStr = `${startTimeEAT} → ${endTimeEAT} (next day)`;
    } else {
      timeWindowStr = `${startTimeEAT} → ${endTimeEAT}`;
    }

    const message = [
      `🚀 *NEXUS PRO — ${headerLabel}*`,
      ``,
      `${emojiHeader} *${sessionLabel}*`,
      `📅 ${dateStr}`,
      `🕒 Signal Released: ${formatEAT(window.signalRelease)}`,
      `⏰ Trading Window: ${timeWindowStr}`,
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
      `📌 *HOW TO JOIN THIS SESSION*`,
      ``,
      `✅ Copy the Signal Code`,
      `✅ Open Your Nexus Pro Dashboard`,
      `✅ Paste the Code`,
      `✅ Verify Signal`,
      `✅ Allocate Capital`,
      `✅ Activate Trade`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      isMorning ? `🔥 *TODAY'S MARKET INSIGHT*` : `🚀 *TONIGHT'S OPPORTUNITY*`,
      ``,
      quote,
      ``,
      isMorning
        ? `"The market rewards discipline, not emotion. Every signal is an opportunity, but consistency creates wealth."`
        : `"Markets never sleep. While others are watching, intelligent traders are positioning themselves for tomorrow."`,
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
    ].join("\n");

    // ── Send to Telegram ──────────────────────────────────
    const sent = await notifier.sendMessage(message);

    // ── Response ──────────────────────────────────────────
    return NextResponse.json({
      ok: sent,
      slot,
      code,
      sessionId: registered.sessionId,
      sessionName: registered.sessionName,
      startAt: registered.startAt,
      endAt: registered.endAt,
      signalReleaseEAT: formatEAT(window.signalRelease),
      sessionStartEAT: formatEAT(window.sessionStart),
      sessionEndEAT: formatEAT(window.sessionEnd),
      crossesMidnight: window.crossesMidnight,
      telegramDelivered: sent,
      quoteUsed: quote,
      previousSessionClosed: sessionClosedMessage !== null,
    });
  } catch (e) {
    console.error("[publish-daily-signal] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
