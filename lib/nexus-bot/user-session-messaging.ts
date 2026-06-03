/** Canonical internal phase keys — never shown verbatim to users. */
export type TradeSessionPhaseKey =
  | "verify"
  | "capital_pending"
  | "ready"
  | "booked"
  | "waiting_window"
  | "active_analysing"
  | "active_strategy"
  | "capturing"
  | "completed"
  | "profit_released"

export const TRADE_SESSION_OPEN_STATUSES = [
  "booked",
  "ready",
  "pending",
  "running",
  "active",
] as const

export const VERIFY_STEPS_USER = [
  "Verifying trade code",
  "Session located",
  "Capital allocation pending",
] as const

export function userSessionPresentation(phase: TradeSessionPhaseKey): {
  headline: string
  detail: string
} {
  switch (phase) {
    case "verify":
      return { headline: "Verification", detail: "Verifying trade code" }
    case "capital_pending":
      return { headline: "Code Verified", detail: "Select capital to continue" }
    case "ready":
      return { headline: "Trade Booked", detail: "Waiting for session start" }
    case "booked":
      return { headline: "Trade Booked", detail: "Waiting for session start" }
    case "waiting_window":
      return { headline: "Trade Booked", detail: "Waiting for session start" }
    case "active_analysing":
      return { headline: "Session Started", detail: "Nexus Bot analysing market conditions" }
    case "active_strategy":
      return { headline: "Bot Trading", detail: "Strategy active" }
    case "capturing":
      return { headline: "Bot Trading", detail: "Capturing session results" }
    case "completed":
      return { headline: "Session Completed", detail: "Session completed" }
    case "profit_released":
      return { headline: "Profits Released", detail: "Profits transferred to available earnings" }
    default:
      return { headline: "Trade Session", detail: "Processing" }
  }
}

export function resolveTradeSessionPhaseKey(params: {
  status: string
  startAt: string
  endAt: string
  now?: Date
}): TradeSessionPhaseKey {
  const now = params.now ?? new Date()
  const start = new Date(params.startAt).getTime()
  const end = new Date(params.endAt).getTime()
  const t = now.getTime()

  if (params.status === "completed") return "profit_released"
  if (params.status === "expired" || params.status === "cancelled") return "completed"
  if (params.status === "booked" || params.status === "ready" || params.status === "pending") {
    return "booked"
  }
  if (t >= end) return "capturing"
  if (t < start) return "booked"

  const progress = (t - start) / Math.max(1, end - start)
  if (progress < 0.35) return "active_analysing"
  if (progress < 0.7) return "active_strategy"
  return "capturing"
}

export function closedTradeHistorySummary(profitUsd: number): string {
  const amount = profitUsd.toFixed(2)
  return `Closed trade earned $${amount}`
}
