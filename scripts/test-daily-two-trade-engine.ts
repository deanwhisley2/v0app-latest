#!/usr/bin/env npx tsx
import { config } from "dotenv"
import { resolve } from "node:path"
import {
  buildDailyTwoTradeSchedule,
  DAILY_RETURN_PCT_MAX,
  DAILY_RETURN_PCT_MIN,
  DAILY_TRADE_SPLIT_MAX,
  DAILY_TRADE_SPLIT_MIN,
  resolveDailyTwoTradeDayRates,
  dayKeyFromPeriod,
} from "../lib/server/daily-two-trade-engine"

config({ path: resolve(process.cwd(), ".env.local") })

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function testDailyRatesInRange() {
  for (let i = 0; i < 12; i++) {
    const key = dayKeyFromPeriod("2026-06", i)
    const rates = resolveDailyTwoTradeDayRates(key)
    assert(
      rates.dailyReturnPct >= DAILY_RETURN_PCT_MIN - 0.001 &&
        rates.dailyReturnPct <= DAILY_RETURN_PCT_MAX + 0.001,
      `daily pct in range day ${i}`,
    )
    assert(
      rates.morningShare >= DAILY_TRADE_SPLIT_MIN - 0.0001 &&
        rates.morningShare <= DAILY_TRADE_SPLIT_MAX + 0.0001,
      `morning share in range day ${i}`,
    )
    const sum = Math.round((rates.morningReturnPct + rates.eveningReturnPct) * 1000) / 1000
    assert(Math.abs(sum - rates.dailyReturnPct) < 0.002, `trade1+trade2=daily day ${i}`)
  }
  console.log("✓ daily return + split conservation")
}

function testScheduleUsesCapital() {
  const s100 = buildDailyTwoTradeSchedule(100, "2026-06")
  const s200 = buildDailyTwoTradeSchedule(200, "2026-06")
  const d0m100 = s100.days[0]!.morningUsd
  const d0m200 = s200.days[0]!.morningUsd
  assert(d0m200 > d0m100, "higher capital → higher slot usd")
  assert(s100.days[0]!.morningReturnPct === s200.days[0]!.morningReturnPct, "same day same pct")
  console.log("✓ schedule scales with capital, same daily pct per day")
}

function testDeterministicPerDay() {
  const a = resolveDailyTwoTradeDayRates(dayKeyFromPeriod("2026-06", 3))
  const b = resolveDailyTwoTradeDayRates(dayKeyFromPeriod("2026-06", 3))
  assert(a.dailyReturnPct === b.dailyReturnPct, "deterministic daily pct")
  assert(a.morningShare === b.morningShare, "deterministic morning share")
  console.log("✓ deterministic per UTC day key")
}

async function main() {
  testDailyRatesInRange()
  testScheduleUsesCapital()
  testDeterministicPerDay()
  console.log("test-daily-two-trade-engine: OK")
}

void main()
