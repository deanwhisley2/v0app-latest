import { isLowEndMobileDevice } from "@/lib/mobile/low-end-mobile"

/**
 * Flat compositor mode for budget Android GPUs (Samsung A0x class).
 * Does not change routing, scroll ownership, or PWA/runtime layers.
 */
export const NEXUS_MOBILE_LOW_GPU_MODE = true

export function isSamsungGalaxyASeries(userAgent?: string): boolean {
  if (typeof navigator === "undefined" && !userAgent) return false
  const ua = (userAgent ?? navigator.userAgent).toLowerCase()
  return /sm-a\d{2,3}|galaxy a\d{1,2}\b|galaxy a0|galaxy a1/i.test(ua)
}

export function isMobileLowGpuMode(): boolean {
  if (!NEXUS_MOBILE_LOW_GPU_MODE) return false
  if (typeof window === "undefined") return false
  if (!window.matchMedia("(max-width: 767px)").matches) return false
  return isLowEndMobileDevice() || isSamsungGalaxyASeries()
}
