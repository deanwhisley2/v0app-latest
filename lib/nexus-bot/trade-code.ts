const TRADE_CODE_EXTRACT = /NXP-[A-Z0-9]{4}-[A-Z0-9]{4}/i
const INVISIBLE_CHARS = /[\u200B-\u200D\uFEFF\u202A-\u202E]/g

/**
 * Normalize trade session codes (NXP-7A82-X91K).
 * Tolerates messenger link junk: trailing `.` `!` `)`, pasted full URLs, zero-width chars.
 */
export function normalizeTradeCode(raw: string): string {
  let s = String(raw ?? "").replace(INVISIBLE_CHARS, "").trim()
  if (!s) return ""

  try {
    if (/%[0-9A-Fa-f]{2}/.test(s)) {
      s = decodeURIComponent(s)
    }
  } catch {
    /* keep original */
  }

  const fromSignalPath = s.match(/\/signal\/([^/?#\s]+)/i)
  const fromTradeQuery = s.match(/[?&]tradeCode=([^&#\s]+)/i)
  if (fromSignalPath?.[1]) s = fromSignalPath[1]
  else if (fromTradeQuery?.[1]) s = fromTradeQuery[1]

  const extracted = s.match(TRADE_CODE_EXTRACT)
  if (extracted) return extracted[0].toUpperCase()

  return s.toUpperCase().replace(/\s+/g, "").replace(/[.,;:!?)>\]}"']+$/g, "")
}

export const TRADE_CODE_PATTERN = /^NXP-[A-Z0-9]{4}-[A-Z0-9]{4}$/

export function isValidTradeCodeFormat(raw: string): boolean {
  return TRADE_CODE_PATTERN.test(normalizeTradeCode(raw))
}

export function generateTradeCodeCandidate(): string {
  const seg = () =>
    Math.random()
      .toString(36)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .padEnd(4, "X")
      .slice(0, 4)
  return `NXP-${seg()}-${seg()}`
}

export function formatSessionClock(iso: string, locale = "en-US"): string {
  try {
    return new Date(iso).toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  } catch {
    return "—"
  }
}

export const USER_SESSION_PHASES = [
  "Waiting for session",
  "Analyzing market",
  "Preparing entry",
  "Trade active",
  "Managing position",
  "Capturing profit",
  "Trade completed",
  "Profit released",
] as const

export type UserSessionPhase = (typeof USER_SESSION_PHASES)[number]

/** Format for `<input type="datetime-local" />` in local time. */
export function toDatetimeLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Suggested morning (9:00) or evening (17:00) window — 25 minutes. */
export function defaultTradeSessionWindow(slot: "morning" | "evening", now = new Date()): {
  start: Date
  end: Date
} {
  const start = new Date(now)
  start.setSeconds(0, 0)
  start.setMilliseconds(0)
  if (slot === "morning") {
    start.setHours(9, 0, 0, 0)
  } else {
    start.setHours(17, 0, 0, 0)
  }
  if (start.getTime() <= now.getTime()) {
    start.setDate(start.getDate() + 1)
  }
  const end = new Date(start.getTime() + 25 * 60_000)
  return { start, end }
}

export function parseDatetimeLocalInput(raw: string): Date | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  return Number.isFinite(d.getTime()) ? d : null
}
