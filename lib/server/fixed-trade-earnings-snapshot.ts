import { buildContainerDailySchedule, scheduledEarnedUsdSmooth, totalScheduleTargetUsd } from "@/lib/container-earnings-schedule"
import type { FixPeriodMonths } from "@/lib/container-earnings-schedule"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { fixedTradeV2AccruedGrossUsd, parseFixedTradeLifecycleV2 } from "@/lib/server/fixed-trade-lifecycle-v2"

export type FixedSessionEarnedRow = {
  id: string
  principal_amount: string | number
  insurance_fee_amount: string | number
  fix_period_months: number
  seed_key: string | null
  created_at: string
  metadata: Record<string, unknown> | null
  cumulative_earnings_released_usd?: string | number | null
  last_earnings_release_at?: string | null
}

export function computeFixedSessionPolicyGrossUsd(row: FixedSessionEarnedRow, now = new Date()): number {
  const md = row.metadata as Record<string, unknown> | null | undefined
  const v2 = parseFixedTradeLifecycleV2(md)
  if (v2) {
    return fixedTradeV2AccruedGrossUsd(v2, row.created_at, now)
  }
  const principalUsd = roundUsd2(Number(row.principal_amount ?? 0))
  const months = Number(row.fix_period_months) as FixPeriodMonths
  const seedKey =
    (row.seed_key && String(row.seed_key).trim()) ||
    `${row.id}-${principalUsd}-${months}-${row.created_at}`
  const insuranceFee = roundUsd2(Number(row.insurance_fee_amount ?? 0))
  const schedule = buildContainerDailySchedule(principalUsd, months, seedKey, insuranceFee)
  const startAt = new Date(row.created_at)
  const smoothGross = scheduledEarnedUsdSmooth(schedule, startAt, now)
  const cap = totalScheduleTargetUsd(schedule)
  return roundUsd2(Math.min(cap, smoothGross))
}

export function fixedSessionWithdrawPercent(months: FixPeriodMonths): number {
  return months === 1 ? 30 : months === 3 ? 50 : 70
}

export function fixedSessionSeedKey(row: FixedSessionEarnedRow): string {
  const principalUsd = roundUsd2(Number(row.principal_amount ?? 0))
  const months = Number(row.fix_period_months) as FixPeriodMonths
  return (
    (row.seed_key && String(row.seed_key).trim()) ||
    `${row.id}-${principalUsd}-${months}-${row.created_at}`
  )
}
