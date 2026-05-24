/**
 * Central body scroll lock — reference counted; iOS-safe fixed body + touch containment.
 * Scrollable overlay regions must use `data-nexus-overlay-scroll` (see `.nexus-overlay-scroll`).
 */

let lockCount = 0
let savedBodyOverflow = ""
let savedHtmlOverflow = ""
let savedBodyPosition = ""
let savedBodyTop = ""
let savedBodyWidth = ""
let savedScrollY = 0
let touchMoveBlocker: ((e: TouchEvent) => void) | null = null

export function getBodyScrollLockCount(): number {
  return lockCount
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(max-width: 767px)").matches
}

function allowTouchMoveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest("[data-nexus-overlay-scroll]"))
}

function blockBackgroundTouchMove(e: TouchEvent): void {
  if (allowTouchMoveTarget(e.target)) return
  e.preventDefault()
}

export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => undefined

  if (lockCount === 0) {
    const body = document.body
    const html = document.documentElement
    savedBodyOverflow = body.style.overflow
    savedHtmlOverflow = html.style.overflow
    savedBodyPosition = body.style.position
    savedBodyTop = body.style.top
    savedBodyWidth = body.style.width
    savedScrollY = window.scrollY

    body.style.overflow = "hidden"
    html.style.overflow = "hidden"
    html.classList.add("nexus-scroll-locked")

    if (isMobileViewport()) {
      body.style.position = "fixed"
      body.style.top = `-${savedScrollY}px`
      body.style.width = "100%"
    }

    touchMoveBlocker = blockBackgroundTouchMove
    document.addEventListener("touchmove", touchMoveBlocker, { passive: false })
  }

  lockCount += 1
  return () => {
    unlockBodyScroll()
  }
}

export function unlockBodyScroll(): void {
  if (typeof document === "undefined") return
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount > 0) return

  if (touchMoveBlocker) {
    document.removeEventListener("touchmove", touchMoveBlocker)
    touchMoveBlocker = null
  }

  const body = document.body
  const html = document.documentElement
  body.style.overflow = savedBodyOverflow
  html.style.overflow = savedHtmlOverflow
  body.style.position = savedBodyPosition
  body.style.top = savedBodyTop
  body.style.width = savedBodyWidth
  html.classList.remove("nexus-scroll-locked")

  const restoreY = savedScrollY
  if (isMobileViewport()) {
    window.scrollTo(0, restoreY)
  }
}

/** Emergency recovery when a layer failed to release (stuck scroll on low-end Android). */
export function forceUnlockBodyScroll(): void {
  if (typeof document === "undefined") return
  lockCount = 0
  if (touchMoveBlocker) {
    document.removeEventListener("touchmove", touchMoveBlocker)
    touchMoveBlocker = null
  }
  const body = document.body
  const html = document.documentElement
  body.style.overflow = ""
  body.style.position = ""
  body.style.top = ""
  body.style.width = ""
  html.style.overflow = ""
  html.classList.remove("nexus-scroll-locked")
}
