/**
 * Nexus operational financial policy — authoritative constants and fee math.
 * Amounts are normalized to USD internally unless noted; UI converts for display via FX helpers.
 */

import type { FixTradeRiskLevel } from "@/lib/fix-trade-access"

/** Minimum deposit in USD (normalized accounting unit). */
export const NEXUS_MIN_DEPOSIT_USD = 5

/** Legacy floor in USD; product minimum is driven by {@link NEXUS_MIN_WITHDRAW_UGX} equivalent via FX. */
export const NEXUS_MIN_WITHDRAW_USD = 3

/**
 * Congo (DRC) Nexus Main minimum retain — not disclosed in UI until a full-balance withdraw is attempted.
 * Ledger remains USD-normalized; enforcement is on withdraw only.
 */
export const NEXUS_CD_MIN_MAIN_RETAIN_USD = 3

/** Minimum cashout in Ugandan shilling (or FX-equivalent in other currencies). */
export const NEXUS_MIN_WITHDRAW_UGX = 20_000

/** Referrer reward as fraction of referee’s first successful deposit (spec). */
export const NEXUS_REFERRAL_RATE_ON_FIRST_DEPOSIT = 0.035

/** Container extract fee (existing product path). */
export const NEXUS_CONTAINER_EXTRACT_FEE_RATE = 0.01

/** Fixed processing fee on successful Nexus Main cashout (treasury / payout routing). */
export const WITHDRAWAL_PROCESSING_FEE_RATE = 0.03

/** Emergency drawdown — soft warning zone (fraction of principal / session baseline). */
export const NEXUS_EMERGENCY_PULLOUT_THRESHOLD = 0.07

/** Hard protection — company policy floor (fraction). */
export const NEXUS_HARD_PROTECTION_THRESHOLD = 0.09

export const PROCESSING_COPY = {
  deposits: "Deposits typically post within minutes after confirmation.",
  withdrawals: "Withdrawals pending review. Timing depends on payout route.",
} as const

export type FixInsuranceWithdrawFees = {
  insuranceFeeRate: number
  /** Withdrawal-from-session fee rate at fix initiation context (not Main→bank). */
  withdrawalFeeRate: number
}

/** Fee bands keyed by user level + trader risk (Batch 1 baseline from spec). */
export function fixInsuranceAndWithdrawFees(
  userLevel: number,
  riskLevel: FixTradeRiskLevel
): FixInsuranceWithdrawFees {
  if (userLevel <= 1 && riskLevel === "Low") {
    return { insuranceFeeRate: 0.02, withdrawalFeeRate: 0.016 }
  }
  if (userLevel === 2 && riskLevel === "Medium") {
    return { insuranceFeeRate: 0.035, withdrawalFeeRate: 0.015 }
  }
  if (riskLevel === "Low") return { insuranceFeeRate: 0.02, withdrawalFeeRate: 0.016 }
  if (riskLevel === "Medium") return { insuranceFeeRate: 0.03, withdrawalFeeRate: 0.015 }
  return { insuranceFeeRate: 0.045, withdrawalFeeRate: 0.014 }
}

export function roundUsd2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Insurance on gross commit (for display / legacy callers). */
export function computeInsuranceFeeUsd(principalUsd: number, insuranceFeeRate: number): number {
  return roundUsd2(principalUsd * insuranceFeeRate)
}

/**
 * Fixed-trade open: user commits `grossCommitUsd` from Nexus Main in one debit.
 * Insurance is carved from that gross (not an extra Main charge); net principal is locked in the session.
 */
export function splitFixedTradeOpenCommitUsd(
  grossCommitUsd: number,
  insuranceFeeRate: number,
): { grossCommitUsd: number; insuranceFeeUsd: number; principalUsd: number } {
  const gross = roundUsd2(grossCommitUsd)
  const insuranceFeeUsd = roundUsd2(gross * insuranceFeeRate)
  const principalUsd = roundUsd2(gross - insuranceFeeUsd)
  return { grossCommitUsd: gross, insuranceFeeUsd, principalUsd }
}

/** Total debited from Nexus Main when opening a fix (equals gross commit). */
export function computeFixedTradeMainDebitUsd(grossCommitUsd: number, _insuranceFeeUsd?: number): number {
  return roundUsd2(grossCommitUsd)
}

/** Early pullout before official lease end: agreement default (fraction of principal). */
export const NEXUS_FIXED_EARLY_EXIT_AGREEMENT_RATE = 0.1

export type EarlyExitSettlementUsd = {
  principalUsd: number
  /**
   * Unreleased schedule earnings only (total modeled − cumulative_earnings_released_usd).
   * Never pass full session gross after freedom / partial releases.
   */
  sessionEarnedUsd: number
  agreementPenaltyUsd: number
  /** Same nominal charge as opening insurance, taken from principal return only — not from earned. */
  insuranceExitFromPrincipalUsd: number
  /** Principal left after penalties (≥ 0). */
  netPrincipalReturnedUsd: number
  /** Credited to Nexus Main (`available_balance`): full earnings + net principal. */
  totalCreditedToMainUsd: number
}

/**
 * Early exit: penalties apply only to the **principal/stake** bucket.
 * `sessionEarnedUsd` must be **unreleased** earnings only (see fixed-trade-earnings-conservation).
 */
export function computeEarlyExitSettlementUsd(
  principalUsd: number,
  openingInsuranceFeeUsd: number,
  sessionEarnedUsd: number
): EarlyExitSettlementUsd {
  const agreementPenaltyUsd = roundUsd2(principalUsd * NEXUS_FIXED_EARLY_EXIT_AGREEMENT_RATE)
  const insuranceExitFromPrincipalUsd = roundUsd2(openingInsuranceFeeUsd)
  const netPrincipalReturnedUsd = Math.max(
    0,
    roundUsd2(principalUsd - agreementPenaltyUsd - insuranceExitFromPrincipalUsd)
  )
  const totalCreditedToMainUsd = roundUsd2(netPrincipalReturnedUsd + sessionEarnedUsd)
  return {
    principalUsd: roundUsd2(principalUsd),
    sessionEarnedUsd: roundUsd2(sessionEarnedUsd),
    agreementPenaltyUsd,
    insuranceExitFromPrincipalUsd,
    netPrincipalReturnedUsd,
    totalCreditedToMainUsd,
  }
}
