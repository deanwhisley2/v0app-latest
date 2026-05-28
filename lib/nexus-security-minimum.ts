/**
 * Minimum security required before funding, trading, and withdrawals.
 * Optional: second mobile line, crypto wallet, extra payout methods.
 */

export type SecurityPayoutFields = {
  deposit_number?: string | null
  withdrawal_number?: string | null
  deposit_account_names?: string | null
  withdrawal_account_names?: string | null
  security_code_hash?: string | null
  crypto_wallet?: string | null
}

export function depositPayoutLineReady(row: SecurityPayoutFields): boolean {
  return Boolean(row.deposit_number?.trim() && row.deposit_account_names?.trim())
}

export function withdrawalPayoutLineReady(row: SecurityPayoutFields): boolean {
  return Boolean(row.withdrawal_number?.trim() && row.withdrawal_account_names?.trim())
}

/** At least one mobile-money line with registered owner names. */
export function hasMinimumPayoutLine(row: SecurityPayoutFields): boolean {
  return depositPayoutLineReady(row) || withdrawalPayoutLineReady(row)
}

export function hasMinimumSecurity(row: SecurityPayoutFields): boolean {
  return Boolean(row.security_code_hash) && hasMinimumPayoutLine(row)
}

/** True when minimum is met but optional payout rails are still empty. */
export function suggestsOptionalSecurityEnhancements(row: SecurityPayoutFields): boolean {
  if (!hasMinimumSecurity(row)) return false
  const missingSecondLine = !depositPayoutLineReady(row) || !withdrawalPayoutLineReady(row)
  const missingCrypto = !row.crypto_wallet?.trim()
  return missingSecondLine || missingCrypto
}

export const OPTIONAL_SECURITY_REMINDER =
  "Your account security is active. For better recovery protection, consider adding a backup payout method."
