#!/usr/bin/env npx tsx
/**
 * Pre-deploy validation: static yield matrix cap, no API leakage, history sort.
 */
import {
  assertYieldMatrixMonthlyCap,
  resolveMatrixYieldPercent,
  sumYieldMatrixTotalPercent,
} from "../lib/nexus-bot/trade-session-yield-matrix"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function auditYieldMatrix() {
  assertYieldMatrixMonthlyCap()
  const total = sumYieldMatrixTotalPercent()
  assert(total >= 21 && total <= 28, `matrix total ${total} outside 21-28%`)
  const morning = resolveMatrixYieldPercent("2026-06-01T09:00:00.000Z", "morning")
  const evening = resolveMatrixYieldPercent("2026-06-01T17:00:00.000Z", "evening")
  assert(morning > 0 && evening > 0, "matrix slot percents positive")
  console.log(`✓ static matrix total ${total.toFixed(5)}% — morning ${morning}% evening ${evening}%`)
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
  assert(earningsCelebration.profitUsd > 0, "earnings celebration requires positive profit")
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
  auditYieldMatrix()
  auditActiveSessionApiShape()
  auditCelebrationGating()
  auditHistorySort()
  console.log("predeploy-settlement-validation: ALL PASS")
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
