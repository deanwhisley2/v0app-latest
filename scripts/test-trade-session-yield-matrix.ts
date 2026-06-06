#!/usr/bin/env npx tsx
import {
  assertYieldMatrixMonthlyCap,
  getYieldMatrixDayRates,
  resolveMatrixYieldPercent,
  sumYieldMatrixTotalPercent,
  TRADE_SESSION_YIELD_MATRIX_30D,
  yieldMatrixDayIndex,
} from "../lib/nexus-bot/trade-session-yield-matrix"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function testMonthlyCap() {
  assertYieldMatrixMonthlyCap()
  const total = sumYieldMatrixTotalPercent()
  assert(total >= 21 && total <= 28, `total ${total} within 21-28%`)
  console.log(`✓ matrix monthly total ${total.toFixed(5)}% (21–28% cap)`)
}

function testDayPairsConservation() {
  for (let i = 0; i < TRADE_SESSION_YIELD_MATRIX_30D.length; i++) {
    const rates = getYieldMatrixDayRates(i)
    const raw = TRADE_SESSION_YIELD_MATRIX_30D[i]!
    const sum = raw.morningPercent + raw.eveningPercent
    assert(Math.abs(rates.dailyPercent - sum) < 0.0001, `day ${i + 1} conservation`)
    assert(rates.morningPercent > 0 && rates.eveningPercent > 0, `day ${i + 1} positive slots`)
  }
  console.log("✓ each day morning + evening = daily percent")
}

function testSlotLookup() {
  const start = "2026-06-15T09:00:00.000Z"
  const dayIndex = yieldMatrixDayIndex(start)
  const morning = resolveMatrixYieldPercent(start, "morning")
  const evening = resolveMatrixYieldPercent(start, "evening")
  const rates = getYieldMatrixDayRates(dayIndex)
  assert(morning === rates.morningPercent, "morning slot matches matrix")
  assert(evening === rates.eveningPercent, "evening slot matches matrix")
  console.log(`✓ slot lookup day ${dayIndex + 1}: morning ${morning}% evening ${evening}%`)
}

function testSpecDays1to5() {
  const expected = [
    [0.45, 0.28333],
    [0.6, 0.23333],
    [0.25, 0.45],
    [0.55, 0.35],
    [0.7, 0.23333],
  ]
  expected.forEach(([m, e], i) => {
    const day = TRADE_SESSION_YIELD_MATRIX_30D[i]!
    assert(Math.abs(day.morningPercent - m) < 0.00001, `day ${i + 1} morning`)
    assert(Math.abs(day.eveningPercent - e) < 0.00001, `day ${i + 1} evening`)
  })
  console.log("✓ days 1–5 match spec pairs")
}

function testMonthWrap() {
  const day31 = yieldMatrixDayIndex("2026-01-31T09:00:00.000Z")
  const day1 = yieldMatrixDayIndex("2026-01-01T09:00:00.000Z")
  assert(day31 === 0, "Jan 31 wraps to matrix day 0")
  assert(day1 === 0, "Jan 1 is matrix day 0")
  const feb28 = yieldMatrixDayIndex("2026-02-28T09:00:00.000Z")
  assert(feb28 >= 0 && feb28 < 30, "Feb 28 in range")
  const rates31 = getYieldMatrixDayRates(31)
  const rates1 = getYieldMatrixDayRates(1)
  assert(rates31.morningPercent === rates1.morningPercent, "index 31 wraps same as 1")
  console.log("✓ month length wrap (31-day month → modulo 30)")
}

async function main() {
  testMonthlyCap()
  testDayPairsConservation()
  testSlotLookup()
  testSpecDays1to5()
  testMonthWrap()
  console.log("test-trade-session-yield-matrix: OK")
}

void main()
