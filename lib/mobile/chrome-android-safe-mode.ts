/**
 * Chrome Android safe navigation — Brave-stable baseline for Samsung A05-class devices.
 * Chrome aggressively restores SPA tab state, bfcache, and hydration snapshots that
 * can revive broken routes after rollbacks. This module forces a clean dashboard boot.
 */
import {
  SESSION_ACTIVITY_KEY,
  SESSION_PENDING_NAV_KEY,
  SESSION_PENDING_NAV_USER_KEY,
} from "@/lib/dashboard-navigation-policy"

export const CHROME_ANDROID_SAFE_MODE = true

export const CHROME_BFCACHE_RESET_EVENT = "nexus-chrome-bfcache-reset"

/** Session keys cleared before React hydrates on Chrome Android. */
export const CHROME_UNSAFE_SESSION_KEYS = [
  SESSION_ACTIVITY_KEY,
  SESSION_PENDING_NAV_KEY,
  SESSION_PENDING_NAV_USER_KEY,
  "nexus_security_needs_setup_v1",
  "nexus_security_needs_setup_ts_v1",
  "nexus_settings_requested_view",
] as const

declare global {
  interface Window {
    __NEXUS_CHROME_SAFE__?: boolean
    __NEXUS_CHROME_SAFE_BOOT__?: {
      pathname: string
      clearedKeys: string[]
      bfcache?: boolean
    }
  }
}

/** Stock Chrome on Android — excludes Brave, Samsung Internet, Edge, Firefox, Opera. */
export function isAndroidChromeBrowser(userAgent?: string): boolean {
  const ua = (userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")).toLowerCase()
  if (!/android/i.test(ua)) return false
  if (/brave/i.test(ua)) return false
  if (/samsungbrowser/i.test(ua)) return false
  if (/firefox/i.test(ua)) return false
  if (/edg\//i.test(ua)) return false
  if (/opr\//i.test(ua) || /opera/i.test(ua)) return false
  return /chrome\//i.test(ua)
}

export function isChromeAndroidSafeModeActive(): boolean {
  if (!CHROME_ANDROID_SAFE_MODE) return false
  if (typeof window === "undefined") return false
  if (window.__NEXUS_CHROME_SAFE__ === true) return true
  try {
    return document.documentElement.classList.contains("nexus-chrome-android-safe")
  } catch {
    return false
  }
}

/** Strip tab/navigation restore keys — safe on every Chrome Android boot and bfcache return. */
export function purgeChromeUnsafeSessionState(): string[] {
  if (typeof window === "undefined") return []
  const cleared: string[] = []
  try {
    for (const key of CHROME_UNSAFE_SESSION_KEYS) {
      if (sessionStorage.getItem(key) !== null) {
        sessionStorage.removeItem(key)
        cleared.push(key)
      }
    }
  } catch {
    /* private mode */
  }
  return cleared
}

/** Chrome Android must never restore dashboard tabs from session or server workspace. */
export function shouldSkipDashboardTabRestore(): boolean {
  return isChromeAndroidSafeModeActive()
}

/** Runs in <head> before paint — detect Chrome Android, purge stale SPA state, tag DOM. */
export const CHROME_ANDROID_SAFE_BOOT_SCRIPT = `
(function(){
  try {
    var ua = String(navigator.userAgent || "").toLowerCase();
    if (!/android/i.test(ua)) return;
    if (/brave|samsungbrowser|firefox|edg\\/|opr\\/|opera/i.test(ua)) return;
    if (!/chrome\\//i.test(ua)) return;
    document.documentElement.classList.add("nexus-chrome-android-safe");
    window.__NEXUS_CHROME_SAFE__ = true;
    var KEYS = ${JSON.stringify([...CHROME_UNSAFE_SESSION_KEYS])};
    var cleared = [];
    for (var i = 0; i < KEYS.length; i++) {
      try {
        if (sessionStorage.getItem(KEYS[i]) !== null) {
          sessionStorage.removeItem(KEYS[i]);
          cleared.push(KEYS[i]);
        }
      } catch(e) {}
    }
    window.__NEXUS_CHROME_SAFE_BOOT__ = {
      pathname: location.pathname,
      clearedKeys: cleared,
      bfcache: false
    };
    window.addEventListener("pageshow", function(e) {
      if (!e.persisted) return;
      var c = [];
      for (var j = 0; j < KEYS.length; j++) {
        try {
          if (sessionStorage.getItem(KEYS[j]) !== null) {
            sessionStorage.removeItem(KEYS[j]);
            c.push(KEYS[j]);
          }
        } catch(err) {}
      }
      window.__NEXUS_CHROME_SAFE_BOOT__ = {
        pathname: location.pathname,
        clearedKeys: c,
        bfcache: true
      };
      try {
        window.dispatchEvent(new CustomEvent("${CHROME_BFCACHE_RESET_EVENT}"));
      } catch(err) {}
      if (typeof window.__nexusDiagReport === "function") {
        window.__nexusDiagReport("chrome_bfcache", "bfcache pageshow — session purged", {
          pathname: location.pathname,
          clearedKeys: c
        });
      }
    });
    if (typeof window.__nexusDiagReport === "function") {
      window.__nexusDiagReport("chrome_safe_boot", "Chrome Android safe mode active", {
        pathname: location.pathname,
        clearedKeys: cleared,
        ua: ua.slice(0, 120)
      });
    }
  } catch(e) {}
})();
`.trim()
