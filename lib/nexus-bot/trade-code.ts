/** Normalize trade session codes (NXP-7A82-X91K). */
export function normalizeTradeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "")
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
