import type { PublicSecurityProfile } from "@/lib/nexus-security-profile-types"
import type { PayoutLineId } from "@/lib/nexus-mobile-money-lines"

export type FundPayerSource = PayoutLineId | "manual"

export type FundPayerBinding = {
  source: FundPayerSource
  displayName: string
  displayPhone: string
  networkLabel: string | null
  hasRegisteredLine: boolean
}

function optionForFunding(
  profile: PublicSecurityProfile,
  network: string | null,
): (typeof profile.payoutOptions)[number] | null {
  const n = network?.trim().toUpperCase()
  if (n === "MTN" || n === "AIRTEL") {
    const net = n === "MTN" ? "MTN" : "Airtel"
    const dep = profile.payoutOptions.find(
      (o) => o.network === net && (o.id === "mtn_deposit" || o.id === "airtel_deposit"),
    )
    if (dep) return dep
  }
  return (
    profile.payoutOptions.find((o) => o.id === "mtn_deposit") ??
    profile.payoutOptions.find((o) => o.id === "airtel_deposit") ??
    profile.payoutOptions.find((o) => o.id === "deposit_line") ??
    profile.payoutOptions.find((o) => o.id === "mtn_withdrawal") ??
    profile.payoutOptions.find((o) => o.id === "airtel_withdrawal") ??
    profile.payoutOptions.find((o) => o.id === "withdrawal_line") ??
    null
  )
}

/** Pick registered line for Add Funds (prefers deposit lines for the selected network). */
export function bindFundPayerFromProfile(
  profile: PublicSecurityProfile | null,
  fundingNetwork?: string | null,
): FundPayerBinding {
  if (!profile) {
    return {
      source: "manual",
      displayName: "",
      displayPhone: "",
      networkLabel: null,
      hasRegisteredLine: false,
    }
  }
  const opt = optionForFunding(profile, fundingNetwork ?? null)
  if (opt) {
    return {
      source: opt.id,
      displayName: opt.accountNames ?? "",
      displayPhone: opt.numberMasked,
      networkLabel: opt.network,
      hasRegisteredLine: true,
    }
  }
  return {
    source: "manual",
    displayName: "",
    displayPhone: "",
    networkLabel: null,
    hasRegisteredLine: false,
  }
}

export function addFundsPayerIsReady(
  payerSource: FundPayerSource,
  profile: PublicSecurityProfile | null,
  manualName: string,
  manualPhone: string,
): boolean {
  if (payerSource !== "manual") {
    return Boolean(profile?.hasMinimumPayoutLine)
  }
  return Boolean(manualName.trim() && manualPhone.trim())
}
