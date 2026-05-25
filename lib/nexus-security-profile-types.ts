import type { NexusPayoutMethod } from "@/lib/nexus-payout-methods"

/** Saved payout rail the user may select at withdraw (no manual entry). */
export type RegisteredPayoutOption = {
  id: "deposit_line" | "withdrawal_line" | "crypto"
  label: string
  rail: string
  numberMasked: string
  accountNames: string | null
}

export type PublicSecurityProfile = {
  hasSecurityCode: boolean
  /** PIN + at least one transaction number required for funding/withdraw. */
  needsSetup: boolean
  hasTransactionNumber: boolean
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
