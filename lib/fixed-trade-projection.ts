/**
 * Fixed-trade projections aligned with `container-earnings-schedule` (policy curve).
 * UI must not imply intraday spot leverage — earnings follow the scheduled curve.
 */

import {
  buildContainerDailySchedule,
  cumulativeThroughDay,
  fixPeriodDayCount,
  type FixPeriodMonths,
} from "@/lib/container-earnings-schedule"

export type FixedTradeProjection = {
  schedule: number[]
  totalTargetUsd: number
  dayOneUsd: number
  weekOneUsd: number
  dailyAvgUsd: number
  dayCount: number
}

export function fixedTradeScheduleProjection(
  principalUsd: number,
  periodMonths: FixPeriodMonths,
  seedKey: string,
  insuranceFeeUsd = 0
): FixedTradeProjection {
  const schedule = buildContainerDailySchedule(principalUsd, periodMonths, seedKey, insuranceFeeUsd)
  const totalTargetUsd = Math.round(schedule.reduce((a, b) => a + b, 0) * 100) / 100
  const dayOneUsd = schedule[0] ?? 0
  const weekOneUsd = cumulativeThroughDay(schedule, Math.min(7, schedule.length))
  const dayCount = fixPeriodDayCount(periodMonths)
  const dailyAvgUsd = dayCount > 0 ? Math.round((totalTargetUsd / dayCount) * 100) / 100 : 0
  return { schedule, totalTargetUsd, dayOneUsd, weekOneUsd, dailyAvgUsd, dayCount }
}
