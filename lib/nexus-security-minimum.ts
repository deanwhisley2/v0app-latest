/**
 * Minimum security required before funding, trading, and withdrawals.
 * Optional: second mobile line, crypto wallet, extra payout methods.
 */

import { hasAnyNetworkPayoutLine, lineReady, type MobileMoneyLineFields } from "@/lib/nexus-mobile-money-lines"

export type SecurityPayoutFields = MobileMoneyLineFields & {
  security_code_hash?: string | null
  crypto_wallet?: string | null
}

export function depositPayoutLineReady(row: SecurityPayoutFields): boolean {
  return (
    lineReady(row.mtn_deposit_number, row.mtn_deposit_account_names) ||
    lineReady(row.airtel_deposit_number, row.airtel_deposit_account_names) ||
    lineReady(row.deposit_number, row.deposit_account_names)
  )
}

export function withdrawalPayoutLineReady(row: SecurityPayoutFields): boolean {
  return (
    lineReady(row.mtn_withdrawal_number, row.mtn_withdrawal_account_names) ||
    lineReady(row.airtel_withdrawal_number, row.airtel_withdrawal_account_names) ||
    lineReady(row.withdrawal_number, row.withdrawal_account_names)
  )
}

/** At least one mobile-money line with registered owner names. */
export function hasMinimumPayoutLine(row: SecurityPayoutFields): boolean {
  return hasAnyNetworkPayoutLine(row)
}

export function hasSecurityPin(row: SecurityPayoutFields): boolean {
  return Boolean(row.security_code_hash)
}

/** Deposits and withdrawals require at least one payout line with number + registered name. */
export function hasFundingPayoutDetails(row: SecurityPayoutFields): boolean {
  return hasMinimumPayoutLine(row)
}

/** Full funding gate: PIN plus complete payout line(s). */
export function hasMinimumSecurity(row: SecurityPayoutFields): boolean {
  return hasSecurityPin(row) && hasFundingPayoutDetails(row)
}

/** True when minimum is met but optional payout rails are still empty. */
export function suggestsOptionalSecurityEnhancements(row: SecurityPayoutFields): boolean {
  if (!hasMinimumSecurity(row)) return false
  const hasMtnDeposit = lineReady(row.mtn_deposit_number, row.mtn_deposit_account_names)
  const hasAirtelDeposit = lineReady(row.airtel_deposit_number, row.airtel_deposit_account_names)
  const hasMtnWithdraw = lineReady(row.mtn_withdrawal_number, row.mtn_withdrawal_account_names)
  const hasAirtelWithdraw = lineReady(row.airtel_withdrawal_number, row.airtel_withdrawal_account_names)
  const missingSecondNetwork =
    !(hasMtnDeposit && hasAirtelDeposit) || !(hasMtnWithdraw && hasAirtelWithdraw)
  const missingCrypto = !row.crypto_wallet?.trim()
  return missingSecondNetwork || missingCrypto
}

export const OPTIONAL_SECURITY_REMINDER =
  "Your account security is active. For better recovery protection, consider adding a backup payout method."

export const EMAIL_VERIFICATION_REMINDER =
  "Verify your email address to improve account security and recovery options."
