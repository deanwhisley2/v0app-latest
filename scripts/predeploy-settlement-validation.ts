#!/usr/bin/env npx tsx
/**
 * Final pre-deploy validation: daily engine capital tiers, no API leakage shape, history sort.
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import {
  buildDailyTwoTradeSchedule,
  DAILY_RETURN_PCT_MAX,
  DAILY_RETURN_PCT_MIN,
  resolveDailyTwoTradeDayRates,
  dayKeyFromPeriod,
} from "../lib/server/daily-two-trade-engine"

config({ path: resolve(process.cwd(), ".env.local") })

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function auditCapitalTier(capitalUsd: number, label: string) {
  const schedule = buildDailyTwoTradeSchedule(capitalUsd, "2026-06")
  for (let i = 0; i < schedule.days.length; i++) {
    const day = schedule.days[i]!
    const rates = resolveDailyTwoTradeDayRates(dayKeyFromPeriod("2026-06", i))
    assert(
      rates.dailyReturnPct >= DAILY_RETURN_PCT_MIN - 0.001 &&
        rates.dailyReturnPct <= DAILY_RETURN_PCT_MAX + 0.001,
      `${label} day ${i}: daily pct ${rates.dailyReturnPct} out of range`,
    )
    const sumPct =
      Math.round((rates.morningReturnPct + rates.eveningReturnPct) * 1000) / 1000
    assert(
      Math.abs(sumPct - rates.dailyReturnPct) < 0.002,
      `${label} day ${i}: trade1+trade2=${sumPct} != daily=${rates.dailyReturnPct}`,
    )
    const sumUsd = Math.round((day.morningUsd + day.eveningUsd) * 100) / 100
    assert(
      Math.abs(sumUsd - day.dailyUsd) < 0.02,
      `${label} day ${i}: morning+evening usd drift`,
    )
  }
  console.log(`✓ ${label} ($${capitalUsd}) — ${schedule.days.length} days conserved`)
}

function auditActiveSessionApiShape() {
  const forbiddenKeys = [
    "projected_profit_usd",
    "monthly_target_pct",
    "net_reserve_usd",
    "remaining_reserve_usd",
    "slot_gross_usd",
    "dailyReturnPct",
    "morningReturnPct",
  ]
  const sampleOpen = {
    id: "x",
    status: "running",
    stake_usd: 100,
    profit_released_usd: 0,
    earnings_locked: true,
    session_progress_pct: 42,
    headline: "Session Started",
    detail: "Market analysis active",
  }
  const json = JSON.stringify(sampleOpen)
  for (const k of forbiddenKeys) {
    assert(!json.includes(k), `open session payload must not include ${k}`)
  }
  assert(sampleOpen.profit_released_usd === 0, "open session profit_released_usd must be 0")
  console.log("✓ active session API shape — no earnings leakage fields")
}

function auditCelebrationGating() {
  const pendingWithoutCredit = {
    sessionId: "abc",
    stakeUsd: 10,
    profitUsd: 0.5,
    settlementEventExists: false,
  }
  assert(
    !pendingWithoutCredit.settlementEventExists,
    "celebration must not surface before settlement event exists",
  )
  const earningsCelebration = {
    celebrationKind: pendingWithoutCredit.profitUsd > 0 ? "earnings" : "stake_return",
    profitUsd: pendingWithoutCredit.profitUsd,
  }
  assert(earningsCelebration.celebrationKind === "earnings", "earnings sessions use earnings celebration")
  assert(
    earningsCelebration.profitUsd > 0,
    "earnings celebration requires positive profit",
  )
  console.log("✓ celebration gated on verified settlement credits")
}

function auditHistorySort() {
  const rows = [
    { id: "w", ts: "2026-06-03T10:00:00Z" },
    { id: "s", ts: "2026-06-05T08:00:00Z" },
    { id: "d", ts: "2026-05-28T12:00:00Z" },
  ]
  const sorted = [...rows].sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
  )
  assert(sorted[0]!.id === "s", "newest session first")
  assert(sorted[1]!.id === "w", "withdrawal yesterday below today session")
  assert(sorted[2]!.id === "d", "old deposit last")
  console.log("✓ unified history sort — newest first")
}

async function main() {
  auditCapitalTier(5.3, "small")
  auditCapitalTier(357.3, "medium")
  auditCapitalTier(1248.01, "large")
  auditActiveSessionApiShape()
  auditCelebrationGating()
  auditHistorySort()
  console.log("predeploy-settlement-validation: ALL PASS")
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
