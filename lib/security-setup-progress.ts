import type { SecuritySetupProgressItem } from "@/lib/nexus-security-profile-types"
import { lineReady, type MobileMoneyLineFields } from "@/lib/nexus-mobile-money-lines"

export function buildSecuritySetupProgress(input: {
  row: MobileMoneyLineFields & { security_code_hash?: string | null; crypto_wallet?: string | null }
  phone?: string | null
  emailVerified?: boolean
}): SecuritySetupProgressItem[] {
  const { row, phone, emailVerified } = input
  const mtnComplete =
    lineReady(row.mtn_deposit_number, row.mtn_deposit_account_names) ||
    lineReady(row.mtn_withdrawal_number, row.mtn_withdrawal_account_names)
  const airtelComplete =
    lineReady(row.airtel_deposit_number, row.airtel_deposit_account_names) ||
    lineReady(row.airtel_withdrawal_number, row.airtel_withdrawal_account_names)
  const walletComplete = Boolean(row.crypto_wallet?.trim())

  return [
    { key: "phone", label: "Phone number", complete: Boolean(phone?.trim()) },
    { key: "pin", label: "Security PIN", complete: Boolean(row.security_code_hash) },
    { key: "email", label: "Email verified", complete: emailVerified === true },
    { key: "mtn", label: "MTN number", complete: mtnComplete },
    { key: "airtel", label: "Airtel number", complete: airtelComplete },
    { key: "wallet", label: "Wallet address", complete: walletComplete },
  ]
}
