import type { NexusPayoutMethod } from "@/lib/nexus-payout-methods"
import type { MobileMoneyNetwork, PayoutLineId } from "@/lib/nexus-mobile-money-lines"

/** Saved payout rail the user may select at withdraw (no manual entry). */
/** Owner-only prefill for setup forms (full numbers — never expose to other users). */
export type SecurityProfileSetupFields = {
  hasSecurityCode: boolean
  mtnDepositNumber: string | null
  mtnDepositAccountNames: string | null
  airtelDepositNumber: string | null
  airtelDepositAccountNames: string | null
  mtnWithdrawalNumber: string | null
  mtnWithdrawalAccountNames: string | null
  airtelWithdrawalNumber: string | null
  airtelWithdrawalAccountNames: string | null
  cryptoWallet: string | null
}

export type RegisteredPayoutOption = {
  id: PayoutLineId
  label: string
  rail: string
  network: MobileMoneyNetwork | null
  numberMasked: string
  accountNames: string | null
}

export type SecuritySetupProgressItem = {
  key: string
  label: string
  complete: boolean
}

export type PublicSecurityProfile = {
  hasSecurityCode: boolean
  /** PIN + at least one mobile-money line with registered names. */
  hasMinimumSecurity: boolean
  /** True when payout lines are incomplete — blocks Add Funds / Withdraw only. */
  needsSetup: boolean
  /** True when 6-digit PIN is not set. */
  needsSecurityPin: boolean
  /** True when no complete payout line (number + registered name). */
  needsFundingSetup: boolean
  setupProgress: SecuritySetupProgressItem[]
  setupCompletedCount: number
  setupTotalCount: number
  fundingReminder: string | null
  /** Non-blocking — shown when email is not verified. */
  emailVerificationReminder: string | null
  /** Legacy email accounts missing phone and/or PIN for phone-first login. */
  legacyEmailLoginReminder: string | null
  /** @deprecated Use hasMinimumPayoutLine — kept for API compat. */
  hasTransactionNumber: boolean
  hasMinimumPayoutLine: boolean
  /** Gentle reminder only — never blocks dashboard or funding. */
  suggestsOptionalEnhancements: boolean
  payoutMethod: NexusPayoutMethod
  depositNumberMasked: string | null
  withdrawalNumberMasked: string | null
  depositAccountNames: string | null
  withdrawalAccountNames: string | null
  cryptoWalletMasked: string | null
  payoutOptions: RegisteredPayoutOption[]
  /** Withdraw modal / API — withdrawal lines, or deposit lines when shared-number setup. */
  withdrawPayoutOptions: RegisteredPayoutOption[]
  hasWithdrawalPayoutLine: boolean
  cooldownUntil: string | null
  inCooldown: boolean
  canChangeSensitive: boolean
  cryptoNotice: string
}

export type SecurityAppealRow = {
  id: string
  request_type: string
  status: string
  new_value_masked: string
  thread_id: string | null
  created_at: string
}
