import type { NexusPayoutMethod } from "@/lib/nexus-payout-methods"

/** Saved payout rail the user may select at withdraw (no manual entry). */
/** Owner-only prefill for setup forms (full numbers — never expose to other users). */
export type SecurityProfileSetupFields = {
  hasSecurityCode: boolean
  depositNumber: string | null
  withdrawalNumber: string | null
  depositAccountNames: string | null
  withdrawalAccountNames: string | null
  cryptoWallet: string | null
}

export type RegisteredPayoutOption = {
  id: "deposit_line" | "withdrawal_line" | "crypto"
  label: string
  rail: string
  numberMasked: string
  accountNames: string | null
}

export type PublicSecurityProfile = {
  hasSecurityCode: boolean
  /** PIN + at least one mobile-money line with registered names. */
  hasMinimumSecurity: boolean
  /** True when minimum security is not yet complete (blocks funding/trade/withdraw). */
  needsSetup: boolean
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
