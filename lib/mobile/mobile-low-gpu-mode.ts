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

/** Nexus APK / Android WebView — shares Chrome compositor on the same device. */
export function isAndroidWebView(userAgent?: string): boolean {
  if (typeof navigator === "undefined" && !userAgent) return false
  const ua = userAgent ?? navigator.userAgent
  return /android/i.test(ua) && /;\s*wv\)/i.test(ua)
}

export function isMobileLowGpuCandidate(userAgent?: string): boolean {
  if (isLowEndMobileDevice()) return true
  if (isSamsungGalaxyASeries(userAgent)) return true
  const ua = (userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")).toLowerCase()
  if (!/android/i.test(ua)) return false
  if (isAndroidWebView(ua) && (isSamsungGalaxyASeries(ua) || isLowEndMobileDevice())) return true
  return false
}

export function isMobileLowGpuMode(): boolean {
  if (!NEXUS_MOBILE_LOW_GPU_MODE) return false
  if (typeof window === "undefined") return false
  if (!window.matchMedia("(max-width: 767px)").matches) return false
  return isMobileLowGpuCandidate()
}

/** Runs in <head> before paint — portaled overlays need the class immediately. */
export const MOBILE_LOW_GPU_BOOT_SCRIPT = `
(function(){
  try {
    if (!window.matchMedia || !window.matchMedia("(max-width: 767px)").matches) return;
    var ua = String(navigator.userAgent || "").toLowerCase();
    var mem = navigator.deviceMemory;
    var cores = navigator.hardwareConcurrency;
    var lowMem = typeof mem === "number" && mem > 0 && mem <= 4;
    var lowCores = typeof cores === "number" && cores > 0 && cores <= 4;
    var samsungA = /sm-a\\d{2,3}|galaxy a\\d{1,2}\\b|galaxy a0|galaxy a1/i.test(ua);
    var budget = /sm-a0|sm-a1|sm-a2|sm-a3|sm-a4|sm-a5|sm-a05|tecno|itel|infinix|redmi 9a/i.test(ua);
    var androidWv = /android/i.test(ua) && /;\\s*wv\\)/i.test(ua);
    if (samsungA || budget || lowMem || lowCores || (androidWv && (samsungA || budget || lowMem || lowCores))) {
      document.documentElement.classList.add("nexus-mobile-low-gpu");
    }
  } catch(e) {}
})();
`
