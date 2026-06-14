/**
 * TELEGRAM NOTIFIER
 *
 * Sends formatted messages to a Telegram bot.
 * Used to deliver daily coin learning reports.
 *
 * Setup:
 * 1. Create a bot via @BotFather on Telegram
 * 2. Get your bot token (e.g., "123456:ABC-DEF")
 * 3. Get your chat ID (send message to @userinfobot)
 * 4. Add to .env:
 *    TELEGRAM_BOT_TOKEN=your_token
 *    TELEGRAM_CHAT_ID=your_chat_id
 *
 * Usage:
 *   const notifier = new TelegramNotifier()
 *   await notifier.sendReport("📊 DAILY COINS REPORT\n...")
 */

import type { CoinLearningResult } from "./multi-coin-manager";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export class TelegramNotifier {
  private config: TelegramConfig | null = null;
  private enabled: boolean = false;

  constructor() {
    this.loadConfig();
  }

  /**
   * Load Telegram config from environment variables
   */
  private loadConfig(): void {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (botToken && chatId) {
      this.config = { botToken, chatId };
      this.enabled = true;
    } else {
      console.warn(
        "[TelegramNotifier] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Telegram notifications disabled.",
      );
      console.warn("  Add to .env file:");
      console.warn("    TELEGRAM_BOT_TOKEN=your_token");
      console.warn("    TELEGRAM_CHAT_ID=your_chat_id");
      this.enabled = false;
    }
  }

  /**
   * Check if Telegram is configured
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Send a plain text message to Telegram (to configured chatId).
   */
  async sendMessage(text: string): Promise<boolean> {
    return this.sendToChat(text, this.config?.chatId ?? "");
  }

  /**
   * Send a plain text message to a specific chat ID (for webhook replies).
   */
  async sendToChat(text: string, chatId: number | string): Promise<boolean> {
    if (!this.config?.botToken) {
      console.log(
        "[TelegramNotifier] Skipping message (bot token not configured):",
      );
      console.log(text);
      return false;
    }
    if (!chatId) {
      console.log("[TelegramNotifier] Skipping message (no chatId):");
      console.log(text);
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;

      // Try with Markdown first
      const mdResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: String(chatId),
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
      });

      if (mdResponse.ok) {
        console.log("[TelegramNotifier] ✅ Message sent to Telegram (Markdown)");
        return true;
      }

      // If Markdown fails (e.g. unclosed entities), retry as plain text
      const errorText = await mdResponse.text();
      console.warn(`[TelegramNotifier] Markdown failed, falling back to plain text: ${errorText}`);

      const plainResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: String(chatId),
          text,
          disable_web_page_preview: true,
        }),
      });

      if (!plainResponse.ok) {
        const plainError = await plainResponse.text();
        console.error(`[TelegramNotifier] Plain text also failed: ${plainError}`);
        return false;
      }

      console.log("[TelegramNotifier] ✅ Message sent to Telegram (plain text fallback)");
      return true;
    } catch (error) {
      console.error(`[TelegramNotifier] Error sending message:`, error);
      return false;
    }
  }

  /**
   * Send a formatted daily coins report to Telegram
   */
  async sendCoinsReport(
    results: CoinLearningResult[],
    topCoins: CoinLearningResult[],
    worstCoins: CoinLearningResult[],
  ): Promise<boolean> {
    const date = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const lines: string[] = [
      `📊 *DAILY COINS REPORT*`,
      `📅 ${date}`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      "",
    ];

    // Summary header
    const totalCoins = results.length;
    const recommended = results.filter(
      (r) => r.recommendation === "STRONG BUY" || r.recommendation === "BUY",
    ).length;
    const avoided = results.filter((r) => r.recommendation === "AVOID").length;
    const neutral = results.filter(
      (r) => r.recommendation === "NEUTRAL",
    ).length;

    lines.push(`*Summary:* ${totalCoins} coins analyzed`);
    lines.push(
      `🟢 Recommended: ${recommended} | 🟡 Neutral: ${neutral} | 🔴 Avoid: ${avoided}`,
    );
    lines.push("");

    // All coins
    lines.push(`*── All Coins ──*`);
    const sorted = [...results].sort(
      (a, b) => b.confidenceScore - a.confidenceScore,
    );

    for (const r of sorted) {
      const emoji =
        r.recommendation === "STRONG BUY"
          ? "🟢"
          : r.recommendation === "BUY"
            ? "🔵"
            : r.recommendation === "NEUTRAL"
              ? "🟡"
              : r.recommendation === "AVOID"
                ? "🔴"
                : "⚪";

      lines.push(
        `${emoji} *${r.symbol}*: ${r.winRate}% win rate (${r.totalTrades} trades) → ${r.recommendation}`,
      );
      lines.push(
        `   Score: ${r.confidenceScore}/100 | PnL: $${r.avgPnl} | Latency: ${r.avgLatencyMs}ms`,
      );
    }

    lines.push("");

    // Top 3 recommendations
    lines.push(`*── 🏆 Top 3 Recommendations ──*`);
    for (const r of topCoins) {
      lines.push(`🟢 *${r.symbol}*: ${r.confidenceScore}/100 confidence`);
      lines.push(
        `   ${r.winRate}% win rate | ${r.totalTrades} trades | Avg PnL: $${r.avgPnl}`,
      );
    }

    lines.push("");

    // Coins to avoid
    lines.push(`*── ⚠️ Coins to Avoid ──*`);
    for (const r of worstCoins) {
      lines.push(`🔴 *${r.symbol}*: ${r.confidenceScore}/100 confidence`);
      lines.push(
        `   ${r.winRate}% win rate | ${r.totalTrades} trades | Avg PnL: $${r.avgPnl}`,
      );
    }

    lines.push("");

    // Blocked patterns
    const hasBlocked = results.some((r) => r.patternsBlocked > 0);
    if (hasBlocked) {
      lines.push(`*── 🚫 Blocked Patterns ──*`);
      for (const r of sorted) {
        if (r.patternsBlocked > 0) {
          lines.push(`*${r.symbol}*: ${r.patternsBlocked} patterns blocked`);
          for (const p of r.learnedPatterns) {
            if (p.blocked) {
              lines.push(`   • ${p.pattern} (${p.winRate}% win rate)`);
            }
          }
        }
      }
      lines.push("");
    }

    // Footer
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🤖 *NEX Trading Bot* — Self-Learning Engine`);
    lines.push(`🕐 ${new Date().toLocaleTimeString()}`);

    const message = lines.join("\n");
    return this.sendMessage(message);
  }

  /**
   * Send a simple alert message
   */
  async sendAlert(
    title: string,
    message: string,
    severity: "info" | "warning" | "critical" = "info",
  ): Promise<boolean> {
    const emoji =
      severity === "critical" ? "🚨" : severity === "warning" ? "⚠️" : "ℹ️";
    const text = `${emoji} *${title}*\n\n${message}`;
    return this.sendMessage(text);
  }
}
