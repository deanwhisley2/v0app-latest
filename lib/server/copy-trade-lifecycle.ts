import {
  COPY_TRADE_CYCLE_MS,
  COPY_TRADE_TARGET_PROFIT_RATE,
  COPY_TRADE_SCHEDULED_EARNINGS_FEE_RATE,
} from "@/lib/copy-trade-policy"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { buildExactSumBuckets } from "@/lib/server/target-driven-accrual"

export const COPY_TRADE_LIFECYCLE_META_KEY = "lifecycle" as const
export const COPY_TRADE_LIFECYCLE_VERSION = 2 as const

export type CopyTradeLifecycleMeta = {
  v: typeof COPY_TRADE_LIFECYCLE_VERSION
  policyVersion: 1
  targetGrossProfitUsd: number
  executionFeeOnEarningsRate: number
  bucketCount: number
  bucketMs: number
  bucketUsd: readonly number[]
}

export function canonicalCopyTargetGrossUsd(stakeUsd: number): number {
  return roundUsd2(stakeUsd * COPY_TRADE_TARGET_PROFIT_RATE)
}

export function buildCopyTradeLifecycle(stakeUsd: number, sessionId: string, userId: string): CopyTradeLifecycleMeta {
  const stake = roundUsd2(stakeUsd)
  const target = canonicalCopyTargetGrossUsd(stake)
  const bucketCount = 24
  const bucketMs = Math.floor(COPY_TRADE_CYCLE_MS / bucketCount)
  const seed = `copy-v2|${sessionId}|${userId}|${stake}`
  const bucketUsd = buildExactSumBuckets(seed, bucketCount, target)
  return {
    v: COPY_TRADE_LIFECYCLE_VERSION,
    policyVersion: 1,
    targetGrossProfitUsd: target,
    executionFeeOnEarningsRate: COPY_TRADE_SCHEDULED_EARNINGS_FEE_RATE,
    bucketCount,
    bucketMs,
    bucketUsd,
  }
}

export function parseCopyTradeLifecycle(metadata: Record<string, unknown> | null | undefined): CopyTradeLifecycleMeta | null {
  const raw = metadata?.[COPY_TRADE_LIFECYCLE_META_KEY]
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (Number(o.v) !== COPY_TRADE_LIFECYCLE_VERSION) return null
  const bucketUsd = o.bucketUsd
  if (!Array.isArray(bucketUsd) || bucketUsd.length === 0) return null
  const nums = bucketUsd.map((x) => Number(x)).filter((n) => Number.isFinite(n))
  if (nums.length !== bucketUsd.length) return null
  return {
    v: COPY_TRADE_LIFECYCLE_VERSION,
    policyVersion: 1,
    targetGrossProfitUsd: roundUsd2(Number(o.targetGrossProfitUsd ?? 0)),
    executionFeeOnEarningsRate: Number(o.executionFeeOnEarningsRate ?? COPY_TRADE_SCHEDULED_EARNINGS_FEE_RATE),
    bucketCount: Number(o.bucketCount ?? nums.length),
    bucketMs: Number(o.bucketMs ?? Math.floor(COPY_TRADE_CYCLE_MS / nums.length)),
    bucketUsd: nums.map((n) => roundUsd2(n)),
  }
}

/** Accrued gross profit (no fee) at `now` — reconciles exactly to target at cycle end. */
export function copyTradeAccruedGrossUsd(
  lifecycle: CopyTradeLifecycleMeta,
  createdAtIso: string,
  now = new Date(),
): number {
  const start = new Date(createdAtIso).getTime()
  const elapsed = Math.max(0, Math.min(COPY_TRADE_CYCLE_MS, now.getTime() - start))
  const { bucketUsd, bucketMs } = lifecycle
  if (bucketUsd.length === 0 || !(bucketMs > 0)) return 0
  const full = Math.floor(elapsed / bucketMs)
  const frac = Math.min(1, (elapsed % bucketMs) / bucketMs)
  let sum = 0
  for (let i = 0; i < full && i < bucketUsd.length; i++) {
    sum += bucketUsd[i]!
  }
  if (full < bucketUsd.length && frac > 0) {
    sum += bucketUsd[full]! * frac
  }
  return roundUsd2(sum)
}

/** Legacy / repair: linear accrual to canonical target when lifecycle missing. */
export function copyTradeLegacyLinearAccruedGrossUsd(stakeUsd: number, createdAtIso: string, now = new Date()): number {
  const start = new Date(createdAtIso).getTime()
  const elapsed = Math.max(0, Math.min(COPY_TRADE_CYCLE_MS, now.getTime() - start))
  const target = canonicalCopyTargetGrossUsd(stakeUsd)
  return roundUsd2(target * (elapsed / COPY_TRADE_CYCLE_MS))
}
