export type HeaderScrollState = {
  lastY: number
  hidden: boolean
}

export type HeaderVisibilityResult = {
  hidden: boolean
  atTop: boolean
  nextLastY: number
}

/** Scroll-direction header visibility — reveal on any upward gesture from deep content. */
export function computeSmartHeaderVisibility(
  state: HeaderScrollState,
  scrollY: number,
  opts?: { threshold?: number; topZone?: number },
): HeaderVisibilityResult {
  const threshold = opts?.threshold ?? 4
  const topZone = opts?.topZone ?? 12
  const delta = scrollY - state.lastY
  const atTop = scrollY <= topZone

  let hidden = state.hidden
  if (atTop) {
    hidden = false
  } else if (delta > threshold) {
    hidden = true
  } else if (delta < -threshold) {
    hidden = false
  }

  return { hidden, atTop, nextLastY: scrollY }
}
