"use client"

/**
 * SAFETY NOTIFIER
 *
 * Sends alerts for critical safety events:
 * - Blocked trades (with reason)
 * - Emergency cancellations
 * - Strategy rule changes
 * - Daily loss limit hit
 * - Unusual latency spikes
 *
 * Outputs to:
 * - Console (always)
 * - Log file: logs/safety-YYYY-MM-DD.json
 * - Optional: Webhook to Discord/Slack/Telegram
 */

import * as fs from "fs"
import * as path from "path"

export type SafetyEventType =
  | "TRADE_BLOCKED"
  | "EMERGENCY_CANCEL"
  | "RULE_CHANGE"
  | "DAILY_LOSS_LIMIT"
  | "LATENCY_SPIKE"
  | "PATTERN_BLOCKED"
  | "INFO"

export interface SafetyEvent {
  type: SafetyEventType
  severity: "low" | "medium" | "high" | "critical"
  message: string
  details?: Record<string, unknown>
  timestamp: number
}

export interface WebhookConfig {
  url: string
  type: "discord" | "slack" | "telegram"
  enabled: boolean
}

export class SafetyNotifier {
  private events: SafetyEvent[] = []
  private webhooks: WebhookConfig[] = []
  private logDir: string
  private consoleEnabled: boolean
  private fileLoggingEnabled: boolean

  constructor(options?: {
    logDir?: string
    consoleEnabled?: boolean
    fileLoggingEnabled?: boolean
  }) {
    this.logDir = options?.logDir || path.join(process.cwd(), "logs")
    this.consoleEnabled = options?.consoleEnabled ?? true
    this.fileLoggingEnabled = options?.fileLoggingEnabled ?? true

    // Ensure log directory exists
    if (this.fileLoggingEnabled) {
      this.ensureLogDir()
    }
  }

  /**
   * Ensure the log directory exists
   */
  private ensureLogDir(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true })
      }
    } catch {
      // Silently fail if we can't create the directory
      this.fileLoggingEnabled = false
    }
  }

  /**
   * Add a webhook configuration
   */
  addWebhook(config: WebhookConfig): void {
    this.webhooks.push(config)
  }

  /**
   * Remove a webhook
   */
  removeWebhook(url: string): void {
    this.webhooks = this.webhooks.filter((w) => w.url !== url)
  }

  /**
   * Send a safety notification
   */
  notify(event: SafetyEvent): void {
    this.events.push(event)

    // Console output (always)
    if (this.consoleEnabled) {
      this.consoleOutput(event)
    }

    // File logging
    if (this.fileLoggingEnabled) {
      this.fileOutput(event)
    }

    // Webhook notifications
    if (this.webhooks.length > 0) {
      this.webhookOutput(event)
    }
  }

  /**
   * Format and output to console
   */
  private consoleOutput(event: SafetyEvent): void {
    const icon = this.getSeverityIcon(event.severity)
    const time = new Date(event.timestamp).toLocaleTimeString()

    switch (event.type) {
      case "TRADE_BLOCKED":
        console.log(`\n${icon} [${time}] 🚫 TRADE BLOCKED`)
        console.log(`   ${event.message}`)
        break
      case "EMERGENCY_CANCEL":
        console.log(`\n${icon} [${time}] 🆘 EMERGENCY CANCEL`)
        console.log(`   ${event.message}`)
        break
      case "RULE_CHANGE":
        console.log(`\n${icon} [${time}] 📋 RULE CHANGE`)
        console.log(`   ${event.message}`)
        break
      case "DAILY_LOSS_LIMIT":
        console.log(`\n${icon} [${time}] 🔴 DAILY LOSS LIMIT HIT`)
        console.log(`   ${event.message}`)
        break
      case "LATENCY_SPIKE":
        console.log(`\n${icon} [${time}] ⚡ LATENCY SPIKE`)
        console.log(`   ${event.message}`)
        break
      case "PATTERN_BLOCKED":
        console.log(`\n${icon} [${time}] 🧠 PATTERN BLOCKED`)
        console.log(`   ${event.message}`)
        break
      default:
        console.log(`\n${icon} [${time}] ${event.message}`)
    }

    if (event.details) {
      console.log(`   Details: ${JSON.stringify(event.details, null, 2)}`)
    }
  }

  /**
   * Write event to log file
   */
  private fileOutput(event: SafetyEvent): void {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const logFile = path.join(this.logDir, `safety-${today}.json`)

      let logs: SafetyEvent[] = []
      if (fs.existsSync(logFile)) {
        const content = fs.readFileSync(logFile, "utf-8")
        try {
          logs = JSON.parse(content)
        } catch {
          logs = []
        }
      }

      logs.push(event)
      fs.writeFileSync(logFile, JSON.stringify(logs, null, 2))
    } catch {
      // Silently fail on file write errors
    }
  }

  /**
   * Send webhook notification
   */
  private async webhookOutput(event: SafetyEvent): Promise<void> {
    for (const webhook of this.webhooks) {
      if (!webhook.enabled) continue

      try {
        const payload = this.formatWebhookPayload(event, webhook.type)
        await fetch(webhook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } catch {
        // Silently fail on webhook errors
      }
    }
  }

  /**
   * Format payload for different webhook types
   */
  private formatWebhookPayload(event: SafetyEvent, type: string): Record<string, unknown> {
    const base = {
      timestamp: event.timestamp,
      type: event.type,
      severity: event.severity,
      message: event.message,
    }

    switch (type) {
      case "discord":
        return {
          content: null,
          embeds: [
            {
              title: `🚨 ${event.type}`,
              description: event.message,
              color: this.getDiscordColor(event.severity),
              fields: event.details
                ? Object.entries(event.details).map(([k, v]) => ({
                    name: k,
                    value: String(v),
                    inline: true,
                  }))
                : [],
              timestamp: new Date(event.timestamp).toISOString(),
            },
          ],
        }
      case "slack":
        return {
          text: `*${event.type}*: ${event.message}`,
          attachments: [
            {
              color: this.getSlackColor(event.severity),
              fields: event.details
                ? Object.entries(event.details).map(([k, v]) => ({
                    title: k,
                    value: String(v),
                    short: true,
                  }))
                : [],
              ts: Math.floor(event.timestamp / 1000),
            },
          ],
        }
      case "telegram":
        return {
          text: `🚨 *${event.type}*\n${event.message}\nSeverity: ${event.severity}`,
          parse_mode: "Markdown",
        }
      default:
        return base
    }
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case "critical":
        return "🔴"
      case "high":
        return "🟠"
      case "medium":
        return "🟡"
      case "low":
        return "🟢"
      default:
        return "ℹ️"
    }
  }

  private getDiscordColor(severity: string): number {
    switch (severity) {
      case "critical":
        return 0xff0000
      case "high":
        return 0xff6600
      case "medium":
        return 0xffcc00
      case "low":
        return 0x00ff00
      default:
        return 0x999999
    }
  }

  private getSlackColor(severity: string): string {
    switch (severity) {
      case "critical":
        return "danger"
      case "high":
        return "warning"
      case "medium":
        return "warning"
      case "low":
        return "good"
      default:
        return "#999999"
    }
  }

  /**
   * Get all events
   */
  getEvents(): SafetyEvent[] {
    return [...this.events]
  }

  /**
   * Get events filtered by type
   */
  getEventsByType(type: SafetyEventType): SafetyEvent[] {
    return this.events.filter((e) => e.type === type)
  }

  /**
   * Clear events
   */
  clearEvents(): void {
    this.events.length = 0
  }
}
