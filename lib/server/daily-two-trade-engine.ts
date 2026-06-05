import { createHmac } from "node:crypto"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

/** Internal policy — never expose in customer UI or API payloads. */
export const DAILY_RETURN_PCT_MIN = 0.8
export const DAILY_RETURN_PCT_MAX = 1.167
export const DAILY_TRADE_SPLIT_MIN = 0.35
export const DAILY_TRADE_SPLIT_MAX = 0.65
export const DAILY_TWO_TRADE_POLICY_DAYS = 30

export type DailyTwoTradeDayRates = {
  dailyReturnPct: number
  morningShare: number
  eveningShare: number
  morningReturnPct: number
  eveningReturnPct: number
}

export type DailyTwoTradeScheduleDay = {
  dailyReturnPct: number
  morningReturnPct: number
  eveningReturnPct: number
  morningUsd: number
  eveningUsd: number
  dailyUsd: number
}

export type DailyTwoTradeSchedulePayload = {
  v: 2
  source: "daily_two_trade_v1"
  days: DailyTwoTradeScheduleDay[]
}

function rngSecret(): string {
  const s =
    process.env.TRADE_SESSION_RNG_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!s) throw new Error("TRADE_SESSION_RNG_SECRET_OR_CRON_REQUIRED")
  return s
}

/** Cryptographically keyed unit interval in [0, 1) — server-only, not reversible from UI. */
export function secureUnitInterval(scope: string, label: string): number {
  const digest = createHmac("sha256", rngSecret()).update(`${scope}|${label}`).digest()
  return digest.readUInt32BE(0) / 0x1_0000_0000
}

export function dayKeyFromPeriod(periodKey: string, dayIndex: number): string {
  return `${periodKey}|d${dayIndex}`
}

export function selectDailyReturnPct(dayKey: string): number {
  const u = secureUnitInterval(dayKey, "daily_return_pct")
  const pct = DAILY_RETURN_PCT_MIN + u * (DAILY_RETURN_PCT_MAX - DAILY_RETURN_PCT_MIN)
  return Math.round(pct * 1000) / 1000
}

export function selectMorningShare(dayKey: string): number {
  const u = secureUnitInterval(dayKey, "morning_share")
  const share = DAILY_TRADE_SPLIT_MIN + u * (DAILY_TRADE_SPLIT_MAX - DAILY_TRADE_SPLIT_MIN)
  return Math.round(share * 10000) / 10000
}

export function resolveDailyTwoTradeDayRates(dayKey: string): DailyTwoTradeDayRates {
  const dailyReturnPct = selectDailyReturnPct(dayKey)
  const morningShare = selectMorningShare(dayKey)
  const eveningShare = roundUsd2(Math.max(0, 1 - morningShare))
  const morningReturnPct = Math.round(dailyReturnPct * morningShare * 1000) / 1000
  const eveningReturnPct = Math.round((dailyReturnPct - morningReturnPct) * 1000) / 1000
  return {
    dailyReturnPct,
    morningShare,
    eveningShare,
    morningReturnPct,
    eveningReturnPct,
  }
}

export function slotReturnPctFromDayRates(
  rates: DailyTwoTradeDayRates,
  sessionSlot: string,
): number {
  return String(sessionSlot).toLowerCase() === "evening"
    ? rates.eveningReturnPct
    : rates.morningReturnPct
}

export function slotGrossUsdFromCapital(
  capitalUsd: number,
  returnPct: number,
): number {
  return roundUsd2(capitalUsd * (returnPct / 100))
}

export function buildDailyTwoTradeSchedule(
  capitalUsd: number,
  periodKey: string,
): DailyTwoTradeSchedulePayload {
  const capital = roundUsd2(capitalUsd)
  const days: DailyTwoTradeSchedulePayload["days"] = []
  for (let i = 0; i < DAILY_TWO_TRADE_POLICY_DAYS; i++) {
    const dayKey = dayKeyFromPeriod(periodKey, i)
    const rates = resolveDailyTwoTradeDayRates(dayKey)
    const morningUsd = slotGrossUsdFromCapital(capital, rates.morningReturnPct)
    const eveningUsd = slotGrossUsdFromCapital(capital, rates.eveningReturnPct)
    days.push({
      dailyReturnPct: rates.dailyReturnPct,
      morningReturnPct: rates.morningReturnPct,
      eveningReturnPct: rates.eveningReturnPct,
      morningUsd,
      eveningUsd,
      dailyUsd: roundUsd2(morningUsd + eveningUsd),
    })
  }
  return { v: 2, source: "daily_two_trade_v1", days }
}

export function scheduleSlotTotalUsd(schedule: DailyTwoTradeSchedulePayload): number {
  let sum = 0
  for (const d of schedule.days) sum += d.morningUsd + d.eveningUsd
  return roundUsd2(sum)
}
