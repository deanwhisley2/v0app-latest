import type { PublicSecurityProfile, RegisteredPayoutOption } from "@/lib/nexus-security-profile-types"
import type { PayoutLineId } from "@/lib/nexus-mobile-money-lines"

export type FundPayerSource = PayoutLineId | "manual"

export type FundPayerBinding = {
  source: FundPayerSource
  displayName: string
  displayPhone: string
  network: "MTN" | "Airtel" | null
  networkLabel: string | null
  hasRegisteredLine: boolean
}

function isDepositLineId(id: PayoutLineId): boolean {
  return id === "mtn_deposit" || id === "airtel_deposit" || id === "deposit_line"
}

/** All registered deposit lines for the selected network (tap-to-select in Add Funds). */
export function listFundPayerOptionsForNetwork(
  profile: PublicSecurityProfile | null,
  fundingNetwork?: string | null,
): RegisteredPayoutOption[] {
  if (!profile) return []

  const net = fundingNetwork?.trim().toUpperCase()
  let options = profile.payoutOptions.filter((o) => isDepositLineId(o.id))

  if (net === "MTN") {
    options = options.filter((o) => o.network === "MTN" || (o.id === "deposit_line" && o.network == null))
    if (!options.length) {
      const wd = profile.payoutOptions.find((o) => o.id === "mtn_withdrawal")
      if (wd) options = [wd]
    }
  } else if (net === "AIRTEL") {
    options = options.filter((o) => o.network === "Airtel" || (o.id === "deposit_line" && o.network == null))
    if (!options.length) {
      const wd = profile.payoutOptions.find((o) => o.id === "airtel_withdrawal")
      if (wd) options = [wd]
    }
  }

  return options
}

export function bindFundPayerFromOption(opt: RegisteredPayoutOption): FundPayerBinding {
  return {
    source: opt.id,
    displayName: opt.accountNames ?? "",
    displayPhone: opt.numberMasked,
    network: opt.network,
    networkLabel: opt.network,
    hasRegisteredLine: true,
  }
}

function optionForFunding(
  profile: PublicSecurityProfile,
  network: string | null,
  preferredSource?: FundPayerSource | null,
): (typeof profile.payoutOptions)[number] | null {
  if (preferredSource && preferredSource !== "manual") {
    const picked = profile.payoutOptions.find((o) => o.id === preferredSource)
    if (picked) return picked
  }

  const listed = listFundPayerOptionsForNetwork(profile, network)
  if (listed.length === 1) return listed[0]
  if (listed.length > 1) return listed[0]

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
    null
  )
}

/** Pick registered line for Add Funds (prefers deposit lines for the selected network). */
export function bindFundPayerFromProfile(
  profile: PublicSecurityProfile | null,
  fundingNetwork?: string | null,
  preferredSource?: FundPayerSource | null,
): FundPayerBinding {
  if (!profile) {
    return {
      source: "manual",
      displayName: "",
      displayPhone: "",
      network: null,
      networkLabel: null,
      hasRegisteredLine: false,
    }
  }
  const opt = optionForFunding(profile, fundingNetwork ?? null, preferredSource)
  if (opt) {
    return {
      source: opt.id,
      displayName: opt.accountNames ?? "",
      displayPhone: opt.numberMasked,
      network: opt.network,
      networkLabel: opt.network,
      hasRegisteredLine: true,
    }
  }
  return {
    source: "manual",
    displayName: "",
    displayPhone: "",
    network: null,
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
