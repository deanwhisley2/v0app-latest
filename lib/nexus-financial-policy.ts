/**
 * Nexus operational financial policy — authoritative constants and fee math.
 * Amounts are normalized to USD internally unless noted; UI converts for display via FX helpers.
 */

import type { FixTradeRiskLevel } from "@/lib/fix-trade-access"

/** Minimum deposit in USD (normalized accounting unit). */
export const NEXUS_MIN_DEPOSIT_USD = 5

/** Legacy floor in USD; product minimum is driven by {@link NEXUS_MIN_WITHDRAW_UGX} equivalent via FX. */
export const NEXUS_MIN_WITHDRAW_USD = 3

/** Minimum cashout in Ugandan shilling (or FX-equivalent in other currencies). */
export const NEXUS_MIN_WITHDRAW_UGX = 20_000

/** Referrer reward as fraction of referee’s first successful deposit (spec). */
export const NEXUS_REFERRAL_RATE_ON_FIRST_DEPOSIT = 0.035

/** Container extract fee (existing product path). */
export const NEXUS_CONTAINER_EXTRACT_FEE_RATE = 0.01

/** Emergency drawdown — soft warning zone (fraction of principal / session baseline). */
export const NEXUS_EMERGENCY_PULLOUT_THRESHOLD = 0.07

/** Hard protection — company policy floor (fraction). */
export const NEXUS_HARD_PROTECTION_THRESHOLD = 0.09

export const PROCESSING_COPY = {
  deposits: "Most of the time this is a few minutes. Busy banks or networks can make it slower.",
  withdrawals: "Often within a few hours. It depends on your country and how we send the money.",
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

/** Total debited from Nexus Main when opening a fix: principal + insurance (immediate). */
export function computeFixedTradeMainDebitUsd(principalUsd: number, insuranceFeeUsd: number): number {
  return roundUsd2(principalUsd + insuranceFeeUsd)
}

export function computeInsuranceFeeUsd(principalUsd: number, insuranceFeeRate: number): number {
  return roundUsd2(principalUsd * insuranceFeeRate)
}

/** Early pullout before official lease end: agreement default (fraction of principal). */
export const NEXUS_FIXED_EARLY_EXIT_AGREEMENT_RATE = 0.1

export type EarlyExitSettlementUsd = {
  principalUsd: number
  /** Schedule-based earnings accrued during the active session (never reduced by exit penalties). */
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
 * **Session earned funds are added in full** to the amount returned outside the fix.
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
