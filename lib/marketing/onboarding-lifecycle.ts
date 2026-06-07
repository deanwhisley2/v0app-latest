/** Onboarding promo surfaces hide after capital is activated or account age exceeds 48h. */
export const ONBOARDING_PROMO_MAX_AGE_MS = 48 * 60 * 60 * 1000

export type OnboardingLifecycleInput = {
  /** profiles.startup_bonus_received_at — grant timestamp (informational). */
  startupBonusReceivedAt?: string | null
  /** Auth or profiles.created_at */
  accountCreatedAt?: string | null
  /** Fixed trade opened — startup capital deployed / onboarding complete. */
  hasFixedTrade?: boolean
}

/** Capital actively deployed (fixed trade) — treat as has_claimed_startup_capital. */
export function hasClaimedStartupCapital(input: OnboardingLifecycleInput): boolean {
  return Boolean(input.hasFixedTrade)
}

export function accountAgeMs(accountCreatedAt: string | null | undefined, nowMs = Date.now()): number | null {
  if (!accountCreatedAt) return null
  const t = new Date(accountCreatedAt).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, nowMs - t)
}

export function isAccountOlderThanPromoWindow(
  accountCreatedAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const age = accountAgeMs(accountCreatedAt, nowMs)
  if (age == null) return false
  return age > ONBOARDING_PROMO_MAX_AGE_MS
}

/** When true, startup modal + live campaign banner must not mount. */
export function shouldSuppressOnboardingPromos(input: OnboardingLifecycleInput, nowMs = Date.now()): boolean {
  if (hasClaimedStartupCapital(input)) return true
  return isAccountOlderThanPromoWindow(input.accountCreatedAt, nowMs)
}
