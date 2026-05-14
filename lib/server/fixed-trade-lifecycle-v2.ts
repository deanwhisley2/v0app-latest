import type { FixPeriodMonths } from "@/lib/container-earnings-schedule"
import { fixPeriodDayCount } from "@/lib/container-earnings-schedule"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { buildExactSumBuckets, stringSeed } from "@/lib/server/target-driven-accrual"

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const FIXED_LIFECYCLE_META_KEY = "lifecycle" as const
export const FIXED_LIFECYCLE_V2 = 2 as const

export type FixedTradeLifecycleV2 = {
  v: typeof FIXED_LIFECYCLE_V2
  engine: "target_profit_v1"
  targetProfitRate: number
  targetProfitUsd: number
  termDays: number
  dailyUsd: readonly number[]
}

export function buildFixedTradeLifecycleV2(
  principalUsd: number,
  fixPeriodMonths: FixPeriodMonths,
  sessionId: string,
  userId: string,
): FixedTradeLifecycleV2 {
  const principal = roundUsd2(principalUsd)
  const rnd = mulberry32(stringSeed(`fixed-rate|${sessionId}|${userId}`))
  const targetProfitRate = Math.round((0.19 + rnd() * 0.06) * 1_000_000) / 1_000_000
  const targetProfitUsd = roundUsd2(principal * targetProfitRate)
  const termDays = fixPeriodDayCount(fixPeriodMonths)
  const seed = `fixed-buckets|${sessionId}|${principal}|${termDays}|${fixPeriodMonths}`
  const dailyUsd = buildExactSumBuckets(seed, termDays, targetProfitUsd)
  return {
    v: FIXED_LIFECYCLE_V2,
    engine: "target_profit_v1",
    targetProfitRate,
    targetProfitUsd,
    termDays,
    dailyUsd,
  }
}

export function parseFixedTradeLifecycleV2(metadata: Record<string, unknown> | null | undefined): FixedTradeLifecycleV2 | null {
  const raw = metadata?.[FIXED_LIFECYCLE_META_KEY]
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (Number(o.v) !== FIXED_LIFECYCLE_V2 || o.engine !== "target_profit_v1") return null
  const daily = o.dailyUsd
  if (!Array.isArray(daily) || daily.length === 0) return null
  const dailyUsd = daily.map((x) => roundUsd2(Number(x))).filter((n) => Number.isFinite(n))
  if (dailyUsd.length !== daily.length) return null
  return {
    v: FIXED_LIFECYCLE_V2,
    engine: "target_profit_v1",
    targetProfitRate: Number(o.targetProfitRate ?? 0),
    targetProfitUsd: roundUsd2(Number(o.targetProfitUsd ?? 0)),
    termDays: Number(o.termDays ?? dailyUsd.length),
    dailyUsd,
  }
}

/** Gross profit accrued in-session (not yet released to liquid) — capped by target. */
export function fixedTradeV2AccruedGrossUsd(lc: FixedTradeLifecycleV2, createdAtIso: string, now = new Date()): number {
  const start = new Date(createdAtIso).getTime()
  const elapsed = Math.max(0, now.getTime() - start)
  const dayMs = 86_400_000
  const leaseTermMs = lc.termDays * dayMs
  const capped = Math.min(elapsed, leaseTermMs)
  const fullDays = Math.floor(capped / dayMs)
  const frac = Math.min(1, (capped % dayMs) / dayMs)
  let sum = 0
  for (let i = 0; i < fullDays && i < lc.dailyUsd.length; i++) {
    sum += lc.dailyUsd[i]!
  }
  if (fullDays < lc.dailyUsd.length && frac > 0) {
    sum += lc.dailyUsd[fullDays]! * frac
  }
  return roundUsd2(Math.min(lc.targetProfitUsd, sum))
}
