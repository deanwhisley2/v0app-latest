import { isLowGpuAndroid } from "@/lib/mobile/mobile-low-gpu-mode"

/** @deprecated Use isLowGpuAndroid() — budget Android only, not all phones. */
export function isLowEndMobileDevice(): boolean {
  if (typeof window === "undefined") return false
  const coarse = window.matchMedia("(pointer: coarse)").matches
  const narrow = window.matchMedia("(max-width: 767px)").matches
  if (!coarse || !narrow) return false
  return isLowGpuAndroid()
}
