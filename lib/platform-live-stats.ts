/** Deterministic daily-growing platform stats for marketing banner (display only). */

const LAUNCH_EPOCH_MS = Date.UTC(2024, 0, 15)
/** Marketing banner: never show fewer than this many community members. */
export const PLATFORM_PROMO_MIN_MEMBERS = 1372
const BASE_USERS = 12_400
const BASE_FIX_TRADES = 2_860
const BASE_EARNED_USD = 118_000

function dayIndex(now = Date.now()): number {
  return Math.max(0, Math.floor((now - LAUNCH_EPOCH_MS) / 86_400_000))
}

function dailyJoins(day: number): number {
  const spread = 30 + (day % 41)
  return spread
}

export type PlatformLiveStats = {
  totalUsers: number
  todayJoins: number
  activeFixTrades: number
  totalEarnedUsd: number
}

export function computePlatformLiveStats(now = Date.now()): PlatformLiveStats {
  const day = dayIndex(now)
  let userGrowth = 0
  let fixGrowth = 0
  let earnedGrowth = 0
  for (let d = 0; d <= day; d++) {
    const joins = dailyJoins(d)
    userGrowth += joins
    fixGrowth += Math.round(joins * 0.42 + (d % 7) * 3)
    earnedGrowth += joins * (180 + (d % 5) * 40)
  }
  return {
    totalUsers: BASE_USERS + userGrowth,
    todayJoins: dailyJoins(day),
    activeFixTrades: BASE_FIX_TRADES + fixGrowth,
    totalEarnedUsd: BASE_EARNED_USD + earnedGrowth,
  }
}
