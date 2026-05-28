import type { PublicSecurityProfile, RegisteredPayoutOption } from "@/lib/nexus-security-profile-types"
import type { PayoutLineId } from "@/lib/nexus-mobile-money-lines"

/** Withdraw UI/API options — prefers server-built list, falls back for older cached profiles. */
export function withdrawPayoutOptionsFromProfile(
  profile: PublicSecurityProfile | null,
): RegisteredPayoutOption[] {
  if (!profile) return []
  if (profile.withdrawPayoutOptions?.length) return profile.withdrawPayoutOptions
  const all = profile.payoutOptions ?? []
  const withdrawal = all.filter((o) => o.id.includes("withdrawal") || o.id === "withdrawal_line")
  if (withdrawal.length > 0) return withdrawal
  return all.filter((o) => o.id !== "crypto")
}

export function defaultWithdrawPayoutOptionId(
  profile: PublicSecurityProfile | null,
): PayoutLineId | null {
  const opts = withdrawPayoutOptionsFromProfile(profile)
  const preferred = opts.find((o) => o.id.includes("withdrawal") || o.id === "withdrawal_line")
  if (preferred) return preferred.id
  const deposit = opts.find((o) => o.id.includes("deposit") || o.id === "deposit_line")
  if (deposit) return deposit.id
  return opts[0]?.id ?? null
}
