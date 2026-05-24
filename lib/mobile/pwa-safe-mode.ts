/**
 * Browser-only stabilization lock.
 *
 * Hard-locked ON until routing is proven stable across desktop + Android.
 * To reintroduce PWA/APK: set NEXUS_BROWSER_ONLY_LOCK = false and redeploy.
 */
export const NEXUS_BROWSER_ONLY_LOCK = true

export function isPwaSafeMode(): boolean {
  return NEXUS_BROWSER_ONLY_LOCK
}

/**
 * Lightweight install UX only — APK download + manual Add to Home Screen guidance.
 * No service worker, manifest, standalone runtime, or navigation changes.
 */
export const NEXUS_LIGHTWEIGHT_ANDROID_INSTALL = false

export function isLightweightAndroidInstallEnabled(): boolean {
  return NEXUS_BROWSER_ONLY_LOCK && NEXUS_LIGHTWEIGHT_ANDROID_INSTALL
}

/** Full PWA layer (manifest/SW/runtime) — off until separately revalidated. */
export function isPwaInstallEnabled(): boolean {
  return !NEXUS_BROWSER_ONLY_LOCK
}

/** Runs before React hydration — unregister SW, clear caches, one-time reload if a controller was active. */
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
        if (typeof window.__nexusDiagReport === 'function') {
          window.__nexusDiagReport('sw_teardown_reload', 'reloading after SW unregister');
        }
        sessionStorage.setItem('nexus_browser_only_reload', '1');
        location.reload();
      }
    });
  } catch (e) {}
})();
`.trim()
