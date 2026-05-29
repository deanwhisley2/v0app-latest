import { isDrcOperatingCountry } from "@/lib/customer-corridor-money"
import {
  NEXUS_CD_MIN_MAIN_RETAIN_USD,
  NEXUS_MIN_MAIN_RETAIN_USD,
  roundUsd2,
  WITHDRAWAL_COOLDOWN_MS,
} from "@/lib/nexus-financial-policy"

export { WITHDRAWAL_COOLDOWN_MS }

export type ProfileWithdrawEconomyRow = {
  startup_bonus_received_at?: string | null
  startup_capital_locked_usd?: unknown
  startup_capital_granted_at?: string | null
  funding_country_code?: string | null
}

/**
 * New-member welcome principal (`startup_capital_locked_usd`) is tradable but never withdrawable.
 * Legacy referral-milestone grants (`startup_capital_granted_at` only) do not lock main balance.
 */
export function effectiveStartupCapitalLockUsd(row: ProfileWithdrawEconomyRow | null | undefined): number {
  if (!row?.startup_bonus_received_at) return 0
  return roundUsd2(Math.max(0, Number(row.startup_capital_locked_usd ?? 0)))
}

/** Minimum Nexus Main that must remain after a withdrawal (USD-normalized). */
export function mainMinimumRetainUsd(row: ProfileWithdrawEconomyRow | null | undefined): number {
  if (row?.startup_bonus_received_at) {
    return isDrcOperatingCountry(row.funding_country_code) ? NEXUS_CD_MIN_MAIN_RETAIN_USD : 0
  }
  if (isDrcOperatingCountry(row?.funding_country_code)) {
    return Math.max(NEXUS_MIN_MAIN_RETAIN_USD, NEXUS_CD_MIN_MAIN_RETAIN_USD)
  }
  return NEXUS_MIN_MAIN_RETAIN_USD
}

export function withdrawalCooldownError(nextEligibleAtIso: string): string {
  return `Withdrawal limit: one per 12 hours. Next window: ${nextEligibleAtIso}.`
}
