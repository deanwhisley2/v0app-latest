import { isLowEndMobileDevice } from "@/lib/mobile/low-end-mobile"

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(max-width: 767px)").matches
}

/** Countdown label refresh — slower on phones to avoid repaint storms. */
export function workspaceCountdownIntervalMs(): number {
  if (!isMobileViewport()) return 1000
  return isLowEndMobileDevice() ? 30_000 : 15_000
}

/** Fixed-trade accrual display tick between server hydrates. */
export function workspaceEarnTickIntervalMs(): number {
  if (!isMobileViewport()) return 10_000
  return isLowEndMobileDevice() ? 60_000 : 30_000
}

/** rAF number tween on earned USD — desktop only. */
export function shouldAnimateFixEarnedDisplay(): boolean {
  return !isMobileViewport()
}

/** Fixed-trade local earned sync between server polls. */
export function workspaceFixSyncIntervalMs(): number {
  if (!isMobileViewport()) return 15_000
  return isLowEndMobileDevice() ? 60_000 : 30_000
}

/** Active session API poll — was 8s everywhere; too heavy for desk cards on phones. */
export function workspaceSessionPollIntervalMs(): number {
  if (!isMobileViewport()) return 8_000
  return isLowEndMobileDevice() ? 60_000 : 30_000
}

/** Live schedule accrual + progress bar — server/poll snapshots only on mobile. */
export function shouldUseLiveFixAccrualDisplay(): boolean {
  return !isMobileViewport()
}

/** Hide sub-pixel progress bar repaints on phones. */
export function shouldShowFixSessionProgressBar(): boolean {
  return !isMobileViewport()
}

/** BTC price blend animation — desktop-only. */
export function shouldBlendMarketPriceDisplay(): boolean {
  return !isMobileViewport()
}

/** BTC continuity micro-nudge — desktop-only visual polish. */
export function shouldRunMarketContinuityNudge(): boolean {
  return !isMobileViewport()
}

/** Skip earnDisplayTick-driven re-renders on phones. */
export function shouldRunDeskEarnDisplayTick(): boolean {
  return !isMobileViewport()
}

/** Copy session countdown seconds — omitted on mobile to reduce churn. */
export function shouldShowSessionCountdownSeconds(): boolean {
  return !isMobileViewport()
}
