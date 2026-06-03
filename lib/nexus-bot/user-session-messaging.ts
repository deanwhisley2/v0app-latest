/** Canonical internal phase keys — never shown verbatim to users. */
export type TradeSessionPhaseKey =
  | "verify"
  | "capital_pending"
  | "ready"
  | "waiting_window"
  | "active_analysing"
  | "active_strategy"
  | "capturing"
  | "completed"
  | "profit_released"

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
      return { headline: "Trade Session Ready", detail: "Code verified · Strategy verified" }
    case "ready":
      return { headline: "Ready", detail: "Trade allocation confirmed" }
    case "waiting_window":
      return { headline: "Trade Session Ready", detail: "Waiting for execution window" }
    case "active_analysing":
      return { headline: "Trade Session Active", detail: "Nexus Bot analysing market conditions" }
    case "active_strategy":
      return { headline: "Trade Session Active", detail: "Strategy active" }
    case "capturing":
      return { headline: "Trade Session Active", detail: "Capturing session results" }
    case "completed":
      return { headline: "Completed", detail: "Session completed" }
    case "profit_released":
      return { headline: "Completed", detail: "Profits transferred to available earnings" }
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
  if (params.status === "ready" || params.status === "pending") return "waiting_window"
  if (t >= end) return "capturing"
  if (t < start) return "waiting_window"

  const progress = (t - start) / Math.max(1, end - start)
  if (progress < 0.35) return "active_analysing"
  if (progress < 0.7) return "active_strategy"
  return "capturing"
}

export function closedTradeHistorySummary(profitUsd: number): string {
  const amount = profitUsd.toFixed(2)
  return `Closed trade earned $${amount}`
}
