import { isLowEndMobileDevice } from "@/lib/mobile/low-end-mobile"

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(max-width: 767px)").matches
}

/** Countdown label refresh — slower on phones to avoid repaint storms. */
export function workspaceCountdownIntervalMs(): number {
  if (!isMobileViewport()) return 1000
  return isLowEndMobileDevice() ? 8000 : 4000
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
