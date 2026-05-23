import { roundUsd2 } from "@/lib/nexus-financial-policy"

/** Monthly return band on yield base (principal minus opening insurance). */
export const CONTAINER_PERIOD_RETURN_MONTHLY_PCT_MIN = 27
export const CONTAINER_PERIOD_RETURN_MONTHLY_PCT_MAX = 30

/** Midpoint for copy-trade cycle sizing and display defaults. */
export const CONTAINER_PERIOD_RETURN_MONTHLY_PCT =
  (CONTAINER_PERIOD_RETURN_MONTHLY_PCT_MIN + CONTAINER_PERIOD_RETURN_MONTHLY_PCT_MAX) / 2

const MS_PER_POLICY_MONTH = 30 * 86_400_000

/** Deterministic monthly % in [MIN, MAX] from session seed (legacy schedule path). */
export function resolveContainerPeriodReturnMonthlyPct(seedKey: string): number {
  const rnd = mulberry32(stringSeed(`monthly-pct|${seedKey}`))
  const pct = CONTAINER_PERIOD_RETURN_MONTHLY_PCT_MIN + rnd() * (CONTAINER_PERIOD_RETURN_MONTHLY_PCT_MAX - CONTAINER_PERIOD_RETURN_MONTHLY_PCT_MIN)
  return Math.round(pct * 100) / 100
}

/** 24h copy cycle gross profit rate aligned to a monthly policy %. */
export function copyTradeCycleProfitRateFromMonthlyPct(monthlyPct: number, cycleMs = 24 * 60 * 60 * 1000): number {
  return Math.round((monthlyPct / 100) * (cycleMs / MS_PER_POLICY_MONTH) * 1_000_000) / 1_000_000
}

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
 * Deterministic daily accrual buckets that sum to:
 *   (principal − opening insurance) × resolveContainerPeriodReturnMonthlyPct(seed) × periodMonths
 * (falls back to full principal if the net base would be non-positive).
 * Weights are tightly banded (~±12% around the equal-per-day mean) so the curve feels “alive”
 * day to day while reconciling exactly to the policy total (ledger-aligned targets on the server).
 */
export function buildContainerDailySchedule(
  principalUsd: number,
  periodMonths: FixPeriodMonths,
  seedKey: string,
  insuranceFeeUsd = 0
): number[] {
  const days = fixPeriodDayCount(periodMonths)
  const ins = Math.max(0, roundUsd2(insuranceFeeUsd))
  const netForYield = roundUsd2(principalUsd - ins)
  const baseUsd = netForYield > 0 ? netForYield : roundUsd2(principalUsd)
  const monthlyPct = resolveContainerPeriodReturnMonthlyPct(seedKey)
  const target = roundUsd2(baseUsd * (monthlyPct / 100) * periodMonths)

  const rnd = mulberry32(stringSeed(seedKey))
  const weights: number[] = []
  let sumW = 0
  for (let i = 0; i < days; i++) {
    const w = 0.88 + rnd() * 0.24
    weights.push(w)
    sumW += w
  }
  const scale = target / sumW
  const daily = weights.map((w) => Math.round(w * scale * 100) / 100)
  const drift = Math.round((target - daily.reduce((a, b) => a + b, 0)) * 100) / 100
  if (daily.length > 0) daily[daily.length - 1] = Math.round((daily[daily.length - 1]! + drift) * 100) / 100
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

/** Sum of daily policy buckets (full-period target accrual in USD). */
export function totalScheduleTargetUsd(schedule: readonly number[] | undefined): number {
  if (!schedule?.length) return 0
  return Math.round(schedule.reduce((a, b) => a + b, 0) * 100) / 100
}

const MS_PER_DAY = 86_400_000

/**
 * Intra-day linear accrual on top of the deterministic daily schedule (same buckets as `buildContainerDailySchedule`).
 * Bounded by schedule total — not random; suitable for live UI that should move on Day 1 without changing settlement rules.
 */
export function scheduledEarnedUsdSmooth(
  schedule: readonly number[] | undefined,
  startTime: Date,
  now = new Date()
): number {
  if (!schedule?.length) return 0
  const cap = totalScheduleTargetUsd(schedule)
  const elapsed = now.getTime() - startTime.getTime()
  if (elapsed <= 0) return 0
  const fullDays = Math.floor(elapsed / MS_PER_DAY)
  const partial = (elapsed % MS_PER_DAY) / MS_PER_DAY
  if (fullDays >= schedule.length) return cap
  const base = cumulativeThroughDay(schedule, fullDays)
  const dayBucket = schedule[fullDays] ?? 0
  return Math.round(Math.min(cap, base + dayBucket * partial) * 100) / 100
}
