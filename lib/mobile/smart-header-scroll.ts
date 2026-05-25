export type HeaderScrollState = {
  lastY: number
  hidden: boolean
}

export type HeaderVisibilityResult = {
  hidden: boolean
  atTop: boolean
  nextLastY: number
}

/** Upward scroll needed to reveal when already hidden (any negative delta also reveals). */
export const SMART_HEADER_REVEAL_UP_PX = 3

/** Downward scroll before hiding while away from top. */
export const SMART_HEADER_HIDE_DOWN_PX = 8

export const SMART_HEADER_TOP_ZONE_PX = 8

/**
 * Scroll-direction header visibility — reveal on upward gesture mid-page (not only at top).
 * Passive listener + rAF in useSmartMobileHeader; instant reveal bypasses rAF when hidden.
 */
export function computeSmartHeaderVisibility(
  state: HeaderScrollState,
  scrollY: number,
  opts?: {
    revealUp?: number
    hideDown?: number
    topZone?: number
  },
): HeaderVisibilityResult {
  const revealUp = opts?.revealUp ?? SMART_HEADER_REVEAL_UP_PX
  const hideDown = opts?.hideDown ?? SMART_HEADER_HIDE_DOWN_PX
  const topZone = opts?.topZone ?? SMART_HEADER_TOP_ZONE_PX
  const delta = scrollY - state.lastY
  const atTop = scrollY <= topZone

  let hidden = state.hidden
  if (atTop) {
    hidden = false
  } else if (hidden && delta < 0) {
    hidden = false
  } else if (delta < -revealUp) {
    hidden = false
  } else if (delta > hideDown) {
    hidden = true
  }

  return { hidden, atTop, nextLastY: scrollY }
}

/** True when scroll direction is upward enough to reveal immediately. */
export function shouldRevealSmartHeaderInstantly(
  state: HeaderScrollState,
  scrollY: number,
): boolean {
  if (!state.hidden) return false
  return scrollY - state.lastY < 0
}
