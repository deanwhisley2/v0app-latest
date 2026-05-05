/** Total return over the full fixed period: 22% × principal × number of months (container / platform deposit). */
export const CONTAINER_PERIOD_RETURN_MONTHLY_PCT = 22

export type FixPeriodMonths = 1 | 3 | 6

export function fixPeriodDayCount(periodMonths: FixPeriodMonths): number {
  return periodMonths * 30
}

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function stringSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Random positive daily amounts that sum to principal × 22% × periodMonths.
 * Deterministic from `seedKey` so the same trade always gets the same curve.
 */
export function buildContainerDailySchedule(
  principalUsd: number,
  periodMonths: FixPeriodMonths,
  seedKey: string
): number[] {
  const days = fixPeriodDayCount(periodMonths)
  const target = principalUsd * (CONTAINER_PERIOD_RETURN_MONTHLY_PCT / 100) * periodMonths
  const rnd = mulberry32(stringSeed(seedKey))
  const weights: number[] = []
  let sumW = 0
  for (let i = 0; i < days; i++) {
    const w = 0.15 + rnd() * 0.85
    weights.push(w)
    sumW += w
  }
  const scale = target / sumW
  const daily = weights.map((w) => Math.round(w * scale * 100) / 100)
  const drift = Math.round((target - daily.reduce((a, b) => a + b, 0)) * 100) / 100
  if (daily.length > 0) daily[daily.length - 1] = Math.round((daily[daily.length - 1] + drift) * 100) / 100
  return daily
}

export function cumulativeThroughDay(schedule: readonly number[], completedDays: number): number {
  const n = Math.max(0, Math.min(schedule.length, completedDays))
  let s = 0
  for (let i = 0; i < n; i++) s += schedule[i]!
  return Math.round(s * 100) / 100
}

export function completedFixDaysSince(start: Date, now = new Date()): number {
  const ms = now.getTime() - start.getTime()
  if (ms <= 0) return 0
  return Math.floor(ms / 86_400_000)
}

export function scheduledEarnedUsd(
  schedule: readonly number[] | undefined,
  startTime: Date,
  now = new Date()
): number {
  if (!schedule?.length) return 0
  const days = completedFixDaysSince(startTime, now)
  return cumulativeThroughDay(schedule, days)
}
