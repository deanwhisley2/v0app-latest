/**
 * PWA / install phased reintroduction (Phase 3).
 *
 * Emergency full browser-only: set NEXUS_BROWSER_ONLY_LOCK = true (disables everything below).
 * Native scroll + compositor policies live in native slice files — unchanged here.
 */

/** Master kill-switch — instant revert to pure browser (SW teardown, no manifest). */
export const NEXUS_BROWSER_ONLY_LOCK = false

/** Step 1: manifest, icons, standalone chrome, beforeinstallprompt install UX. */
export const NEXUS_PWA_INSTALL_LAYER = true

/** Step 1/2: register SW for installability — precache shell assets only, NO fetch handler. */
export const NEXUS_PWA_MINIMAL_SW = true

/** Step 5: refresh auth session on app resume (visibility). */
export const NEXUS_PWA_RESUME_LAYER = false

/** Step 6–7: connectivity banners, fetch stability hooks, SW navigate/offline routing. */
export const NEXUS_PWA_OFFLINE_LAYER = false

export function isPwaSafeMode(): boolean {
  return NEXUS_BROWSER_ONLY_LOCK
}

export function isPwaInstallEnabled(): boolean {
  return !NEXUS_BROWSER_ONLY_LOCK && NEXUS_PWA_INSTALL_LAYER
}

export function isPwaMinimalSwEnabled(): boolean {
  return isPwaInstallEnabled() && NEXUS_PWA_MINIMAL_SW
}

export function isPwaResumeEnabled(): boolean {
  return isPwaInstallEnabled() && NEXUS_PWA_RESUME_LAYER
}

export function isPwaOfflineRuntimeEnabled(): boolean {
  return !NEXUS_BROWSER_ONLY_LOCK && NEXUS_PWA_OFFLINE_LAYER
}

/** Runs before React hydration when full browser-only lock is active. */
export const PWA_SAFE_MODE_TEARDOWN_SCRIPT = `
(function(){
  try {
    var hadController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    function clearCaches() {
      if (!('caches' in window)) return Promise.resolve();
      return caches.keys().then(function(keys) {
        return Promise.all(keys.map(function(k) { return caches.delete(k); }));
      });
    }
    function unregisterAll() {
      if (!('serviceWorker' in navigator)) return clearCaches();
      return navigator.serviceWorker.getRegistrations().then(function(regs) {
        return Promise.all(regs.map(function(r) { return r.unregister(); }));
      }).then(clearCaches);
    }
    unregisterAll().then(function() {
      if (hadController && !sessionStorage.getItem('nexus_browser_only_reload')) {
        sessionStorage.setItem('nexus_browser_only_reload', '1');
        location.reload();
      }
    });
  } catch (e) {}
})();
`.trim()
