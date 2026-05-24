export type AndroidBrowserKind = "chrome" | "samsung" | "firefox" | "opera" | "other"

export type InstallSurface =
  | { eligible: false; reason: "ios" | "desktop" | "already_installed" }
  | {
      eligible: true
      platform: "android"
      browser: AndroidBrowserKind
      supportsNativePwaPrompt: boolean
      supportsApkDirect: boolean
      needsManualInstructions: boolean
    }

export function readUserAgent(): string {
  if (typeof navigator === "undefined") return ""
  return navigator.userAgent ?? ""
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false
  if (window.matchMedia("(display-mode: standalone)").matches) return true
  if (window.matchMedia("(display-mode: fullscreen)").matches) return true
  const nav = navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return true
  try {
    if (document.referrer.startsWith("android-app://")) return true
  } catch {
    /* ignore */
  }
  return false
}

export function isIosDevice(ua = readUserAgent()): boolean {
  const s = ua.toLowerCase()
  if (/iphone|ipad|ipod/.test(s)) return true
  if (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
    return true
  }
  return false
}

export function isAndroidDevice(ua = readUserAgent()): boolean {
  return /android/i.test(ua)
}

export function isDesktopLikeDevice(ua = readUserAgent()): boolean {
  if (isAndroidDevice(ua) || isIosDevice(ua)) return false
  const s = ua.toLowerCase()
  if (/mobile|tablet|ipad/.test(s)) return false
  if (typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches && window.innerWidth >= 1024) {
    return true
  }
  return !/mobile|android|iphone|ipad|ipod/.test(s)
}

export function detectAndroidBrowser(ua = readUserAgent()): AndroidBrowserKind {
  const s = ua.toLowerCase()
  if (/samsungbrowser/.test(s)) return "samsung"
  if (/opr\//.test(s) || /opera mini/.test(s) || /opt\//.test(s)) return "opera"
  if (/edg\//.test(s)) return "chrome"
  if (/firefox|fxios/.test(s)) return "firefox"
  if (/chrome|crios/.test(s) && !/edg\//.test(s)) return "chrome"
  return "other"
}

export function detectInstallSurfaceFromUa(ua = readUserAgent()): InstallSurface {
  if (isIosDevice(ua)) return { eligible: false, reason: "ios" }
  if (!isAndroidDevice(ua)) return { eligible: false, reason: "desktop" }
  if (isDesktopLikeDevice(ua)) return { eligible: false, reason: "desktop" }

  const browser = detectAndroidBrowser(ua)
  const needsManualInstructions = browser === "opera" || browser === "other"
  const supportsNativePwaPrompt = browser === "chrome" || browser === "samsung" || browser === "firefox"
  const supportsApkDirect = browser !== "opera"

  return {
    eligible: true,
    platform: "android",
    browser,
    supportsNativePwaPrompt,
    supportsApkDirect,
    needsManualInstructions,
  }
}

export function detectInstallSurface(ua = readUserAgent()): InstallSurface {
  if (typeof window === "undefined") return detectInstallSurfaceFromUa(ua)
  if (isStandalonePwa()) return { eligible: false, reason: "already_installed" }
  return detectInstallSurfaceFromUa(ua)
}
