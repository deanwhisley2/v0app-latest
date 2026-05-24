#!/usr/bin/env npx tsx
/**
 * Regression: fixed-trade earnings conservation (no double credit on final settlement).
 * Run: npm run test:fixed-trade-earnings-conservation
 */

import {
  computeEarlyExitSettlementUsd,
  roundUsd2,
} from "../lib/nexus-financial-policy"
import {
  assertReleaseLedgerReconciles,
  assertSettlementEarnedWithinUnreleased,
  computeFixedTradeEarningsConservation,
} from "../lib/server/fixed-trade-earnings-conservation"
import type { FixedSessionEarnedRow } from "../lib/server/fixed-trade-earnings-snapshot"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function row(partial: Partial<FixedSessionEarnedRow> & Pick<FixedSessionEarnedRow, "id" | "created_at">): FixedSessionEarnedRow {
  return {
    principal_amount: 1000,
    insurance_fee_amount: 20,
    fix_period_months: 1,
    seed_key: "test-seed",
    metadata: { v: 1 },
    cumulative_earnings_released_usd: 0,
    ...partial,
  }
}

function testUnreleasedAfterFreedomRelease() {
  const r = row({
    id: "sess-kisumu-style",
    created_at: "2026-05-15T22:27:53.321Z",
    principal_amount: 1386.67,
    insurance_fee_amount: 27.73,
    cumulative_earnings_released_usd: 93.69,
  })
  const snap = computeFixedTradeEarningsConservation(r, new Date("2026-05-24T14:02:35.701Z"))
  assert(snap.cumulativeReleasedUsd === 93.69, "cumulative from prior releases")
  assert(snap.unreleasedEarnedUsd < snap.totalModeledEarnedUsd, "must have partial release")
  assert(snap.unreleasedEarnedUsd < 105.91, "unreleased must be less than full modeled (Kisumu case shape)")

  const wrongCredit = snap.totalModeledEarnedUsd
  let threw = false
  try {
    assertSettlementEarnedWithinUnreleased(snap, wrongCredit, "test-double-credit")
  } catch {
    threw = true
  }
  assert(threw, "full modeled gross must be rejected at settlement")

  const settlement = computeEarlyExitSettlementUsd(
    1386.67,
    27.73,
    snap.unreleasedEarnedUsd,
  )
  assert(settlement.sessionEarnedUsd === snap.unreleasedEarnedUsd, "early exit uses unreleased only")
  assert(
    settlement.totalCreditedToMainUsd === roundUsd2(settlement.netPrincipalReturnedUsd + snap.unreleasedEarnedUsd),
    "total credit = net principal + unreleased",
  )
  console.log("✓ freedom release → early exit (no double credit)")
}

function testMultiplePartialReleasesMaturity() {
  const r = row({
    id: "sess-partial",
    created_at: "2026-05-01T00:00:00.000Z",
    cumulative_earnings_released_usd: 80,
  })
  const snap = computeFixedTradeEarningsConservation(r, new Date("2026-05-20T00:00:00.000Z"))
  assert(snap.cumulativeReleasedUsd === 80, "cumulative")
  const remainder = snap.unreleasedEarnedUsd
  assertReleaseLedgerReconciles(snap, remainder, "maturity-remainder")
  assert(remainder <= snap.totalModeledEarnedUsd, "remainder bounded")
  console.log("✓ multiple partial releases → maturity remainder reconciles")
}

function testZeroUnreleasedOnlyPrincipal() {
  const r = row({
    id: "sess-exhausted",
    created_at: "2026-05-01T00:00:00.000Z",
    cumulative_earnings_released_usd: 0,
  })
  const asOf = new Date("2026-05-10T00:00:00.000Z")
  const snap0 = computeFixedTradeEarningsConservation(r, asOf)
  const rFull = row({
    id: "sess-exhausted",
    created_at: r.created_at,
    cumulative_earnings_released_usd: snap0.totalModeledEarnedUsd,
  })
  const snap = computeFixedTradeEarningsConservation(rFull, asOf)
  assert(snap.unreleasedEarnedUsd === 0, "no unreleased when all gross already released")
  const settlement = computeEarlyExitSettlementUsd(1000, 20, 0)
  assert(settlement.sessionEarnedUsd === 0, "zero earned credit")
  assert(settlement.totalCreditedToMainUsd === settlement.netPrincipalReturnedUsd, "principal only")
  console.log("✓ zero unreleased → principal-only early exit")
}

function testCumulativeAboveModeledFails() {
  const r = row({
    id: "sess-corrupt",
    created_at: "2026-05-01T00:00:00.000Z",
    cumulative_earnings_released_usd: 99999,
  })
  const snap = computeFixedTradeEarningsConservation(r, new Date("2026-05-10T00:00:00.000Z"))
  let threw = false
  try {
    assertSettlementEarnedWithinUnreleased(snap, 1, "corrupt-cum")
  } catch {
    threw = true
  }
  assert(threw, "cumulative > modeled must throw")
  console.log("✓ cumulative above modeled blocked")
}

function main() {
  testUnreleasedAfterFreedomRelease()
  testMultiplePartialReleasesMaturity()
  testZeroUnreleasedOnlyPrincipal()
  testCumulativeAboveModeledFails()
  console.log("test-fixed-trade-earnings-conservation: OK")
}

main()
