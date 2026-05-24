/**
 * Native mobile scroll isolation — disables custom scroll/gesture management on phones.
 *
 * Hard-locked ON until mobile scrolling is revalidated. Set to false to re-enable
 * body lock, smart header hide/show, and compositor "mobile-stable" overrides.
 */
export const NEXUS_NATIVE_MOBILE_SCROLL_LOCK = true

export function isNativeMobileScrollMode(): boolean {
  return NEXUS_NATIVE_MOBILE_SCROLL_LOCK
}

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(max-width: 767px)").matches
}

/** Custom scroll features (body lock, smart header, touchmove block) — off in native mode. */
export function useCustomMobileScrollFeatures(): boolean {
  return !isNativeMobileScrollMode()
}
