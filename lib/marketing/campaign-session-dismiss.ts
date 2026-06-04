/** Session-scoped marketing dismiss flags (reset on sign-out). */

export const STARTUP_CAPITAL_BANNER_DISMISS_KEY = "startup_capital_banner_dismissed"
export const LIVE_CAMPAIGN_DISMISS_KEY = "live_campaign_dismissed"

/** Campaign content revision — bump when admin publishes/updates live campaign copy. */
export const LIVE_CAMPAIGN_CONTENT_REVISION_KEY = "nexus_live_campaign_content_revision"

const STARTUP_FLOW_DONE_SESSION_KEY = "nexus_startup_onboarding_session_done"

export function isStartupCapitalBannerDismissed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return sessionStorage.getItem(STARTUP_CAPITAL_BANNER_DISMISS_KEY) === "true"
  } catch {
    return false
  }
}

export function dismissStartupCapitalBanner(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(STARTUP_CAPITAL_BANNER_DISMISS_KEY, "true")
    sessionStorage.setItem(STARTUP_FLOW_DONE_SESSION_KEY, "1")
  } catch {
    /* private mode */
  }
}

export function isStartupOnboardingDoneThisSession(): boolean {
  if (typeof window === "undefined") return false
  try {
    return sessionStorage.getItem(STARTUP_FLOW_DONE_SESSION_KEY) === "1"
  } catch {
    return false
  }
}

export function markStartupOnboardingDoneThisSession(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(STARTUP_FLOW_DONE_SESSION_KEY, "1")
  } catch {
    /* ignore */
  }
}

export function isLiveCampaignDismissed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return sessionStorage.getItem(LIVE_CAMPAIGN_DISMISS_KEY) === "true"
  } catch {
    return false
  }
}

export function dismissLiveCampaignBanner(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(LIVE_CAMPAIGN_DISMISS_KEY, "true")
  } catch {
    /* ignore */
  }
}

export function getStoredLiveCampaignRevision(): string {
  if (typeof window === "undefined") return ""
  try {
    return sessionStorage.getItem(LIVE_CAMPAIGN_CONTENT_REVISION_KEY) ?? ""
  } catch {
    return ""
  }
}

export function storeLiveCampaignRevision(revision: string): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(LIVE_CAMPAIGN_CONTENT_REVISION_KEY, revision)
  } catch {
    /* ignore */
  }
}

/** Clears session dismiss flags so promos can show on the next login. */
export function clearCampaignSessionDismissals(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(STARTUP_CAPITAL_BANNER_DISMISS_KEY)
    sessionStorage.removeItem(LIVE_CAMPAIGN_DISMISS_KEY)
    sessionStorage.removeItem(STARTUP_FLOW_DONE_SESSION_KEY)
    sessionStorage.removeItem("nexus_new_member_campaign_promo_v1")
  } catch {
    /* ignore */
  }
}
