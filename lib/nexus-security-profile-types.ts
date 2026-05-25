import type { NexusPayoutMethod } from "@/lib/nexus-payout-methods"

export type PublicSecurityProfile = {
  hasSecurityCode: boolean
  needsSetup: boolean
  payoutMethod: NexusPayoutMethod
  depositNumberMasked: string | null
  withdrawalNumberMasked: string | null
  cryptoWalletMasked: string | null
  cooldownUntil: string | null
  inCooldown: boolean
  canChangeSensitive: boolean
}

export type SecurityAppealRow = {
  id: string
  request_type: string
  status: string
  new_value_masked: string
  thread_id: string | null
  created_at: string
}
