import { isMobileLowGpuMode } from "@/lib/mobile/mobile-low-gpu-mode"

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(max-width: 767px)").matches
}

function isLowGpuAndroidMobile(): boolean {
  return isMobileLowGpuMode()
}

/** Countdown label refresh — slower only on LOW_GPU Android. */
export function workspaceCountdownIntervalMs(): number {
  if (!isMobileViewport()) return 1000
  return isLowGpuAndroidMobile() ? 60_000 : 1000
}

/** Fixed-trade accrual display tick between server hydrates. */
export function workspaceEarnTickIntervalMs(): number {
  if (!isMobileViewport()) return 10_000
  return isLowGpuAndroidMobile() ? 120_000 : 10_000
}

/** rAF number tween on earned USD — disabled on budget Android only. */
export function shouldAnimateFixEarnedDisplay(): boolean {
  return !isLowGpuAndroidMobile()
}

/** Fixed-trade local earned sync between server polls. */
export function workspaceFixSyncIntervalMs(): number {
  if (!isMobileViewport()) return 15_000
  return isLowGpuAndroidMobile() ? 120_000 : 15_000
}

/** Active session API poll — tight on premium mobile; relaxed on A05-class. */
export function workspaceSessionPollIntervalMs(): number {
  if (!isMobileViewport()) return 8_000
  return isLowGpuAndroidMobile() ? 120_000 : 8_000
}

/** Live schedule accrual + progress bar — budget Android uses poll snapshots only. */
export function shouldUseLiveFixAccrualDisplay(): boolean {
  return !isLowGpuAndroidMobile()
}

/** Hide sub-pixel progress bar repaints on budget Android. */
export function shouldShowFixSessionProgressBar(): boolean {
  return !isLowGpuAndroidMobile()
}

/** BTC price blend animation — desktop and premium mobile. */
export function shouldBlendMarketPriceDisplay(): boolean {
  return !isLowGpuAndroidMobile()
}

/** BTC continuity micro-nudge — desktop and premium mobile. */
export function shouldRunMarketContinuityNudge(): boolean {
  return !isLowGpuAndroidMobile()
}

/** Skip earnDisplayTick-driven re-renders on budget Android. */
export function shouldRunDeskEarnDisplayTick(): boolean {
  return !isLowGpuAndroidMobile()
}

/** Copy session countdown seconds — omitted on budget Android. */
export function shouldShowSessionCountdownSeconds(): boolean {
  return !isLowGpuAndroidMobile()
}
