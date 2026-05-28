import {
  fetchSecurityProfileForAction,
  type SecurityProfileFetchResult,
} from "@/lib/nexus-security-profile-client"
import type { PublicSecurityProfile } from "@/lib/nexus-security-profile-types"

export type WithdrawReadinessResult =
  | { ok: true; profile: PublicSecurityProfile }
  | { ok: false; message: string; showSecurityGate: boolean }

function messageFromProfile(profile: PublicSecurityProfile): string | null {
  if (profile.inCooldown) {
    return "Your payout details are in a security review cooldown. Try again after the cooldown ends or submit a Security Appeal."
  }
  if (!profile.hasSecurityCode) {
    return "Set your 6-digit Nexus Security PIN in Settings before withdrawing."
  }
  if (!profile.hasMinimumPayoutLine) {
    return "Register at least one mobile money number with the account holder name(s) in Settings before withdrawing."
  }
  if (!profile.payoutOptions?.length) {
    return "No payout method is on file. Add deposit or withdrawal details in Settings, then try again."
  }
  return null
}

export function assessWithdrawReadiness(
  profile: PublicSecurityProfile | null,
  fetchError: string | null,
): WithdrawReadinessResult {
  if (!profile) {
    return {
      ok: false,
      message:
        fetchError ??
        "Could not load your security profile. Check your connection and try again.",
      showSecurityGate: true,
    }
  }
  const block = messageFromProfile(profile)
  if (block) {
    const showSecurityGate =
      profile.needsSetup ||
      (!profile.hasSecurityCode && !profile.inCooldown) ||
      !profile.hasMinimumPayoutLine
    return { ok: false, message: block, showSecurityGate }
  }
  return { ok: true, profile }
}

/** Always hits the server (no needsSetup cache) — use before withdraw open/submit. */
export async function loadWithdrawReadiness(token: string): Promise<WithdrawReadinessResult> {
  const fetched: SecurityProfileFetchResult = await fetchSecurityProfileForAction(token)
  return assessWithdrawReadiness(fetched.profile, fetched.error)
}
