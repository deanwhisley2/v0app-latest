import { isValidTradeCodeFormat, normalizeTradeCode } from "@/lib/nexus-bot/trade-code"
import { SITE_BRAND } from "@/lib/site-branding"

/** Public share states — extensible for Telegram, QR, PNG cards later. */
export type TradeSignalPublicState = "active" | "unregistered" | "expired" | "unavailable"

export type TradeSignalPublicView = {
  code: string
  state: TradeSignalPublicState
  sessionSlot: "morning" | "evening" | null
  sessionLabel: string | null
  statusLabel: string | null
  headline: string
  detail: string
  shareUrl: string
  copyHint: string
}

const STATE_COPY: Record<
  TradeSignalPublicState,
  { headline: string; detail: string; statusLabel: string | null }
> = {
  active: {
    headline: "Trade Signal Ready",
    detail: "Verify your code, choose capital, and activate Nexus Bot before the session begins.",
    statusLabel: "Signal Active",
  },
  unregistered: {
    headline: "Signal Not Available",
    detail: "This signal has not been registered or is no longer available.",
    statusLabel: null,
  },
  expired: {
    headline: "Signal Closed",
    detail: "This trading session has ended.",
    statusLabel: null,
  },
  unavailable: {
    headline: "Signal Unavailable",
    detail: "This signal is no longer accepting new participants.",
    statusLabel: null,
  },
}

export function formatTradeSignalSessionLabel(slot: string | null | undefined): string | null {
  if (slot === "morning") return "Morning Session"
  if (slot === "evening") return "Evening Session"
  return null
}

export function buildTradeSignalShareUrl(codeRaw: string, origin?: string): string {
  const code = normalizeTradeCode(codeRaw)
  const base = (origin ?? SITE_BRAND.siteUrl).replace(/\/+$/, "")
  return `${base}/signal/${encodeURIComponent(code)}`
}

export function buildDashboardTradeCodeUrl(codeRaw: string): string {
  const code = normalizeTradeCode(codeRaw)
  return `/dashboard?tradeCode=${encodeURIComponent(code)}`
}

export function buildLoginWithTradeCodeReturn(codeRaw: string): string {
  const next = buildDashboardTradeCodeUrl(codeRaw)
  return `/auth/login?next=${encodeURIComponent(next)}`
}

/** Safe internal redirect — dashboard paths only. */
export function sanitizeInternalRedirect(raw: string | null | undefined): string | null {
  const path = raw?.trim()
  if (!path || !path.startsWith("/dashboard")) return null
  if (path.includes("://") || path.startsWith("//")) return null
  return path
}

export function buildWhatsAppShareTemplate(params: {
  code: string
  sessionSlot: "morning" | "evening"
}): string {
  const code = normalizeTradeCode(params.code)
  const sessionLabel = formatTradeSignalSessionLabel(params.sessionSlot) ?? "Trade Session"
  const shareUrl = buildTradeSignalShareUrl(code)
  return [
    "🚀 Nexus Pro Trade Signal",
    "",
    `Today's ${sessionLabel} is now available.`,
    "",
    "Trade Code:",
    code,
    "",
    "Open Signal:",
    shareUrl,
    "",
    "Verify your code, choose capital, and activate Nexus Bot before the session begins.",
    "",
    "Nexus Pro Crypto Intelligence",
  ].join("\n")
}

export function tradeSignalFailureCopy(reason: string): { headline: string; detail: string } {
  switch (reason) {
    case "invalid_format":
      return {
        headline: "Invalid Signal Link",
        detail:
          "The link may be broken (extra characters from WhatsApp). Copy the trade code NXP-XXXX-XXXX manually into Nexus Bot.",
      }
    case "not_found":
      return {
        headline: "Code Not Registered",
        detail: "This code was generated but never registered as an active session. Ask for today's live signal.",
      }
    case "draft":
      return {
        headline: "Signal Not Published",
        detail: "This session is still a draft and is not open for participants yet.",
      }
    case "expired":
      return STATE_COPY.expired
    case "terminated":
      return {
        headline: "Signal Ended Early",
        detail: "This session was closed by admin and is no longer accepting participants.",
      }
    case "no_yield_config":
      return {
        headline: "Signal Unavailable",
        detail: "This session is not fully configured. Contact support for today's active code.",
      }
    case "not_active":
      return STATE_COPY.unregistered
    default:
      return STATE_COPY.unregistered
  }
}

export function buildTradeSignalPublicView(params: {
  codeRaw: string
  state: TradeSignalPublicState
  sessionSlot?: string | null
  origin?: string
  headline?: string
  detail?: string
}): TradeSignalPublicView {
  const code = normalizeTradeCode(params.codeRaw)
  const copy = STATE_COPY[params.state]
  const sessionLabel = formatTradeSignalSessionLabel(params.sessionSlot)
  return {
    code,
    state: params.state,
    sessionSlot:
      params.sessionSlot === "morning" || params.sessionSlot === "evening" ? params.sessionSlot : null,
    sessionLabel,
    statusLabel: params.state === "active" ? copy.statusLabel : null,
    headline: params.headline ?? copy.headline,
    detail: params.detail ?? copy.detail,
    shareUrl: buildTradeSignalShareUrl(code, params.origin),
    copyHint: "Paste this code into Nexus Bot",
  }
}

export function isPublicTradeSignalCodeParam(raw: string): boolean {
  return isValidTradeCodeFormat(normalizeTradeCode(raw))
}
