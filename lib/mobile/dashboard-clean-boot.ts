/**
 * Dashboard clean boot — always land on Container/Home after login or refresh.
 * Prevents chat/appeal/notification tab restoration that caused Chrome Android crashes.
 */
import {
  SESSION_ACTIVITY_KEY,
  SESSION_PENDING_NAV_KEY,
  SESSION_PENDING_NAV_USER_KEY,
} from "@/lib/dashboard-navigation-policy"

export const DASHBOARD_CLEAN_BOOT = true

/** Session keys purged before hydration so stale SPA routes cannot revive. */
export const DASHBOARD_UNSAFE_SESSION_KEYS = [
  SESSION_ACTIVITY_KEY,
  SESSION_PENDING_NAV_KEY,
  SESSION_PENDING_NAV_USER_KEY,
  "nexus_security_needs_setup_v1",
  "nexus_security_needs_setup_ts_v1",
  "nexus_settings_requested_view",
  "nexus_chat_restore_v1",
  "nexus_support_thread_focus",
] as const

export const DASHBOARD_CLEAN_BOOT_RESET_EVENT = "nexus-dashboard-clean-boot-reset"

/** Never restore remembered tabs, chat, appeals, or pending notification nav on boot. */
export function shouldSkipDashboardTabRestore(): boolean {
  return DASHBOARD_CLEAN_BOOT
}

export function purgeDashboardUnsafeSessionState(): string[] {
  if (typeof window === "undefined") return []
  const cleared: string[] = []
  try {
    for (const key of DASHBOARD_UNSAFE_SESSION_KEYS) {
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

/** Runs in <head> before paint — purge stale navigation before React hydrates. */
export const DASHBOARD_CLEAN_BOOT_SCRIPT = `
(function(){
  try {
    document.documentElement.classList.add("nexus-dashboard-clean-boot");
    window.__NEXUS_CLEAN_BOOT__ = true;
    var KEYS = ${JSON.stringify([...DASHBOARD_UNSAFE_SESSION_KEYS])};
    var cleared = [];
    for (var i = 0; i < KEYS.length; i++) {
      try {
        if (sessionStorage.getItem(KEYS[i]) !== null) {
          sessionStorage.removeItem(KEYS[i]);
          cleared.push(KEYS[i]);
        }
      } catch(e) {}
    }
    window.__NEXUS_CLEAN_BOOT_META__ = { pathname: location.pathname, clearedKeys: cleared };
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
      try {
        window.dispatchEvent(new CustomEvent("${DASHBOARD_CLEAN_BOOT_RESET_EVENT}"));
      } catch(err) {}
      if (typeof window.__nexusDiagReport === "function") {
        window.__nexusDiagReport("clean_boot_bfcache", "bfcache — session purged", {
          pathname: location.pathname,
          clearedKeys: c
        });
      }
    });
  } catch(e) {}
})();
`.trim()
