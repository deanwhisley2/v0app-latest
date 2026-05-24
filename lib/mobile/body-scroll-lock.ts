/**
 * Central body scroll lock — reference counted so nested modals cannot leave overflow:hidden stuck.
 * Use {@link useBodyScrollLock} in React; call {@link forceUnlockBodyScroll} only as a safety net.
 */

let lockCount = 0
let savedBodyOverflow = ""
let savedHtmlOverflow = ""

export function getBodyScrollLockCount(): number {
  return lockCount
}

export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => undefined

  if (lockCount === 0) {
    const body = document.body
    const html = document.documentElement
    savedBodyOverflow = body.style.overflow
    savedHtmlOverflow = html.style.overflow
    body.style.overflow = "hidden"
    html.style.overflow = "hidden"
    html.classList.add("nexus-scroll-locked")
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

  const body = document.body
  const html = document.documentElement
  body.style.overflow = savedBodyOverflow
  html.style.overflow = savedHtmlOverflow
  html.classList.remove("nexus-scroll-locked")
}

/** Emergency recovery when a layer failed to release (stuck scroll on low-end Android). */
export function forceUnlockBodyScroll(): void {
  if (typeof document === "undefined") return
  lockCount = 0
  document.body.style.overflow = ""
  document.documentElement.style.overflow = ""
  document.documentElement.classList.remove("nexus-scroll-locked")
}
