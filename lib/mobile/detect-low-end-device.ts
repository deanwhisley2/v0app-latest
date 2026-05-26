/**
 * Lightweight low-end device detection for UI tiering (notifications, overlays).
 * Prefer isLowGpuAndroid() from mobile-low-gpu-mode when available.
 */

type NavigatorWithMemory = Navigator & { deviceMemory?: number }

export function detectLowEndDevice(): boolean {
  if (typeof navigator === "undefined") return false

  const nav = navigator as NavigatorWithMemory
  const ua = nav.userAgent
  const mem = nav.deviceMemory
  const cores = nav.hardwareConcurrency

  return (
    /Samsung|SM-A0|Android [0-9]/i.test(ua) ||
    (typeof mem === "number" && mem > 0 && mem < 4) ||
    (typeof cores === "number" && cores > 0 && cores < 4)
  )
}
