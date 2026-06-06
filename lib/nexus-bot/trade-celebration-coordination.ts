/** Prevents duplicate profit celebration overlays when dashboard + workspace both poll. */

const KEY_PREFIX = "nexus_trade_celebration_claim_v1:"

export function claimTradeCelebrationSession(sessionId: string): void {
  if (typeof window === "undefined" || !sessionId) return
  try {
    sessionStorage.setItem(`${KEY_PREFIX}${sessionId}`, "1")
  } catch {
    /* ignore */
  }
}

export function isTradeCelebrationClaimed(sessionId: string): boolean {
  if (typeof window === "undefined" || !sessionId) return false
  try {
    return sessionStorage.getItem(`${KEY_PREFIX}${sessionId}`) === "1"
  } catch {
    return false
  }
}
