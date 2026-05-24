/**
 * Native mobile scroll isolation — disables heavy scroll interception on phones.
 *
 * Hard-locked ON until mobile scrolling is fully revalidated. Set to false to re-enable
 * body lock, overlay scroll ownership, and touchmove blocking.
 *
 * Still enabled in native mode:
 * - nexus-mobile-stable compositor-safe rendering
 * - Smart header (passive scroll listener + translateY only; no body lock)
 */
export const NEXUS_NATIVE_MOBILE_SCROLL_LOCK = true

export function isNativeMobileScrollMode(): boolean {
  return NEXUS_NATIVE_MOBILE_SCROLL_LOCK
}

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(max-width: 767px)").matches
}

/** Body lock + overlay scroll interception — off in native mode. Smart header stays on. */
export function useCustomMobileScrollFeatures(): boolean {
  return !isNativeMobileScrollMode()
}
