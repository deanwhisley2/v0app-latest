/** Session-scoped dismiss for the Nexus Live Campaign promo modal (cleared on logout). */
export const NEW_MEMBER_CAMPAIGN_PROMO_DISMISS_KEY = "nexus_new_member_campaign_promo_v1"

/** Legacy permanent dismiss key — migrated away from localStorage. */
const LEGACY_DISMISS_KEY = "nexus_new_member_campaign_promo_v1"

export function isNewMemberCampaignPromoDismissed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return sessionStorage.getItem(NEW_MEMBER_CAMPAIGN_PROMO_DISMISS_KEY) === "1"
  } catch {
    return false
  }
}

export function dismissNewMemberCampaignPromo(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(NEW_MEMBER_CAMPAIGN_PROMO_DISMISS_KEY, "1")
    localStorage.removeItem(LEGACY_DISMISS_KEY)
  } catch {
    /* private mode */
  }
}

/** Call on sign-out so the promo can appear again on the next login session. */
export function clearNewMemberCampaignPromoDismiss(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(NEW_MEMBER_CAMPAIGN_PROMO_DISMISS_KEY)
  } catch {
    /* ignore */
  }
}
