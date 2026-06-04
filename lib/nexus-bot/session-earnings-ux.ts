/** Customer-facing session activity copy — no payout amounts until settlement. */

export const SESSION_BULLISH_ACTIVITY_STEPS = [
  { id: "started", label: "Session started", minProgress: 0 },
  { id: "scan", label: "Scanning opportunities", minProgress: 0.05 },
  { id: "entry", label: "First entry opened", minProgress: 0.12 },
  { id: "monitor", label: "Monitoring market", minProgress: 0.22 },
  { id: "buy", label: "Buy cycle recorded", minProgress: 0.35 },
  { id: "hold", label: "Holding position", minProgress: 0.48 },
  { id: "sell", label: "Sell cycle recorded", minProgress: 0.58 },
  { id: "bullish", label: "Bullish trades updated", minProgress: 0.68 },
  { id: "liquidity", label: "Monitoring liquidity", minProgress: 0.76 },
  { id: "reserve", label: "Profit reserve updated", minProgress: 0.86 },
  { id: "settlement", label: "Settlement pending", minProgress: 0.94 },
] as const

export const SESSION_EARNINGS_LOCKED_LABELS = [
  "Settlement pending",
  "Earnings locked",
  "Profit reserve updating",
] as const

export function sessionEarningsLockedLabel(progressPct: number): string {
  const idx = Math.min(
    SESSION_EARNINGS_LOCKED_LABELS.length - 1,
    Math.floor((Math.min(100, Math.max(0, progressPct)) / 100) * SESSION_EARNINGS_LOCKED_LABELS.length),
  )
  return SESSION_EARNINGS_LOCKED_LABELS[idx]!
}

export function sessionProgressPct(params: {
  startAt?: string | null
  endAt?: string | null
  now?: Date
}): number {
  const startMs = params.startAt ? new Date(params.startAt).getTime() : NaN
  const endMs = params.endAt ? new Date(params.endAt).getTime() : NaN
  const nowMs = (params.now ?? new Date()).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0
  if (nowMs <= startMs) return 0
  if (nowMs >= endMs) return 100
  return Math.round(((nowMs - startMs) / (endMs - startMs)) * 100)
}

export function visibleSessionActivities(progressPct: number): string[] {
  const p = Math.min(100, Math.max(0, progressPct)) / 100
  return SESSION_BULLISH_ACTIVITY_STEPS.filter((s) => p >= s.minProgress).map((s) => s.label)
}

export function sessionProgressMeterBlocks(progressPct: number, blocks = 10): {
  filled: number
  label: string
} {
  const pct = Math.min(100, Math.max(0, progressPct))
  const filled = Math.min(blocks, Math.max(0, Math.round((pct / 100) * blocks)))
  return {
    filled,
    label: `${"█".repeat(filled)}${"░".repeat(blocks - filled)} ${pct}%`,
  }
}
