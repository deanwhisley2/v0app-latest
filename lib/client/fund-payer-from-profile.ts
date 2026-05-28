import type { PublicSecurityProfile } from "@/lib/nexus-security-profile-types"

export type FundPayerSource = "manual" | "deposit_line" | "withdrawal_line"

export type FundPayerBinding = {
  source: FundPayerSource
  displayName: string
  displayPhone: string
  hasRegisteredLine: boolean
}

/** Pick the best registered line for funding (deposit preferred). */
export function bindFundPayerFromProfile(profile: PublicSecurityProfile | null): FundPayerBinding {
  if (!profile) {
    return { source: "manual", displayName: "", displayPhone: "", hasRegisteredLine: false }
  }
  if (profile.depositNumberMasked && profile.depositAccountNames) {
    return {
      source: "deposit_line",
      displayName: profile.depositAccountNames,
      displayPhone: profile.depositNumberMasked,
      hasRegisteredLine: true,
    }
  }
  if (profile.withdrawalNumberMasked && profile.withdrawalAccountNames) {
    return {
      source: "withdrawal_line",
      displayName: profile.withdrawalAccountNames,
      displayPhone: profile.withdrawalNumberMasked,
      hasRegisteredLine: true,
    }
  }
  return { source: "manual", displayName: "", displayPhone: "", hasRegisteredLine: false }
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
