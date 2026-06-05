/** Customer-facing session activity copy — no payout amounts until settlement. */

export const SESSION_ACTIVE_STATUS_LABELS = [
  "Session in progress",
  "Market analysis active",
  "Monitoring opportunities",
  "Detecting market conditions",
  "Opportunity identified",
  "Position management active",
] as const

export const SESSION_BULLISH_ACTIVITY_STEPS = [
  { id: "started", label: "Session in progress", minProgress: 0 },
  { id: "analysis", label: "Market analysis active", minProgress: 0.04 },
  { id: "monitor", label: "Monitoring opportunities", minProgress: 0.12 },
  { id: "detect", label: "Detecting market conditions", minProgress: 0.22 },
  { id: "opportunity", label: "Opportunity identified", minProgress: 0.35 },
  { id: "position", label: "Position management active", minProgress: 0.48 },
  { id: "hold", label: "Holding position", minProgress: 0.58 },
  { id: "liquidity", label: "Monitoring liquidity", minProgress: 0.68 },
  { id: "confirm", label: "Trend confirmation in progress", minProgress: 0.78 },
  { id: "settlement", label: "Settlement pending", minProgress: 0.9 },
] as const

export function sessionActiveStatusLabel(progressPct: number): string {
  const idx = Math.min(
    SESSION_ACTIVE_STATUS_LABELS.length - 1,
    Math.floor((Math.min(100, Math.max(0, progressPct)) / 100) * SESSION_ACTIVE_STATUS_LABELS.length),
  )
  return SESSION_ACTIVE_STATUS_LABELS[idx]!
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
