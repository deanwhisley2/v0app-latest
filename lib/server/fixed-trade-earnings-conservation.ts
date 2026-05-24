/**
 * Fixed-trade earnings conservation — single source for unreleased accrual at settlement.
 * Applies to early exit, maturity, and any final credit path (all corridors; USD-normalized ledger).
 *
 * Prior freedom releases / pocket transfers increment `cumulative_earnings_released_usd`
 * (gross accrual realized). Final settlement must never credit that gross again.
 */

import { roundUsd2 } from "@/lib/nexus-financial-policy"
import {
  computeFixedSessionPolicyGrossUsd,
  type FixedSessionEarnedRow,
} from "@/lib/server/fixed-trade-earnings-snapshot"

export type FixedEarningsConservationSnapshot = {
  /** Policy gross accrued through `asOf` (schedule or lifecycle v2). */
  totalModeledEarnedUsd: number
  /** Gross already released via freedom window / prior partial paths (DB column). */
  cumulativeReleasedUsd: number
  /** Earnings still eligible for a final settlement credit. */
  unreleasedEarnedUsd: number
}

export type SettlementConservationAudit = FixedEarningsConservationSnapshot & {
  settlementEarnedUsd: number
  context: string
}

const CONSERVATION_EPSILON_USD = 0.02

/**
 * Compute unreleased earnings for final settlement.
 * `priorMainCredits` / `priorPocketRealizations` are represented by `cumulative_earnings_released_usd`
 * (gross accrual marked realized before pocket→main transfer).
 */
export function computeFixedTradeEarningsConservation(
  row: FixedSessionEarnedRow,
  asOf: Date = new Date(),
): FixedEarningsConservationSnapshot {
  const totalModeledEarnedUsd = computeFixedSessionPolicyGrossUsd(row, asOf)
  const cumulativeReleasedUsd = roundUsd2(Number(row.cumulative_earnings_released_usd ?? 0))
  const unreleasedEarnedUsd = roundUsd2(Math.max(0, totalModeledEarnedUsd - cumulativeReleasedUsd))
  return {
    totalModeledEarnedUsd,
    cumulativeReleasedUsd,
    unreleasedEarnedUsd,
  }
}

/** Alias matching product language in settlement specs. */
export function computeUnreleasedEarnedUsd(row: FixedSessionEarnedRow, asOf: Date = new Date()): number {
  return computeFixedTradeEarningsConservation(row, asOf).unreleasedEarnedUsd
}

export function assertCumulativeReleaseNotAboveModeled(
  snap: FixedEarningsConservationSnapshot,
  context: string,
): void {
  if (snap.cumulativeReleasedUsd > snap.totalModeledEarnedUsd + CONSERVATION_EPSILON_USD) {
    throw new Error(
      `${context}: CUMULATIVE_RELEASE_EXCEEDS_MODELED (cum=${snap.cumulativeReleasedUsd} modeled=${snap.totalModeledEarnedUsd})`,
    )
  }
}

/**
 * Pre-close hook: settlement may only credit unreleased earnings, never full modeled gross.
 */
export function assertSettlementEarnedWithinUnreleased(
  snap: FixedEarningsConservationSnapshot,
  settlementEarnedUsd: number,
  context: string,
): void {
  assertCumulativeReleaseNotAboveModeled(snap, context)
  const earned = roundUsd2(settlementEarnedUsd)
  if (earned > snap.unreleasedEarnedUsd + CONSERVATION_EPSILON_USD) {
    throw new Error(
      `${context}: SETTLEMENT_EARNINGS_EXCEEDS_UNRELEASED (credit=${earned} unreleased=${snap.unreleasedEarnedUsd} cum=${snap.cumulativeReleasedUsd} modeled=${snap.totalModeledEarnedUsd})`,
    )
  }
}

/** Ledger conservation: after settlement, cumulative should equal total modeled (all accrual accounted). */
export function assertReleaseLedgerReconciles(
  snap: FixedEarningsConservationSnapshot,
  remainderSettlementGrossUsd: number,
  context: string,
): void {
  assertCumulativeReleaseNotAboveModeled(snap, context)
  const remainder = roundUsd2(remainderSettlementGrossUsd)
  const sum = roundUsd2(snap.cumulativeReleasedUsd + remainder)
  if (Math.abs(sum - snap.totalModeledEarnedUsd) > CONSERVATION_EPSILON_USD) {
    throw new Error(
      `${context}: RELEASE_RECONCILE_MISMATCH (cum=${snap.cumulativeReleasedUsd} + remainder=${remainder} != modeled=${snap.totalModeledEarnedUsd})`,
    )
  }
}

export function buildSettlementConservationAudit(
  snap: FixedEarningsConservationSnapshot,
  settlementEarnedUsd: number,
  context: string,
): SettlementConservationAudit {
  assertSettlementEarnedWithinUnreleased(snap, settlementEarnedUsd, context)
  return { ...snap, settlementEarnedUsd: roundUsd2(settlementEarnedUsd), context }
}

export function conservationMetadataForLedger(audit: SettlementConservationAudit): Record<string, unknown> {
  return {
    conservation: {
      context: audit.context,
      totalModeledEarnedUsd: audit.totalModeledEarnedUsd,
      cumulativeReleasedUsd: audit.cumulativeReleasedUsd,
      unreleasedEarnedUsd: audit.unreleasedEarnedUsd,
      settlementEarnedUsd: audit.settlementEarnedUsd,
    },
  }
}
