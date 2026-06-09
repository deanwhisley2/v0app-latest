/**
 * Browser-only stabilization lock.
 *
 * Keeps the app in normal browser mode: no service worker takeover, no install/APK layer.
 * Set NEXUS_BROWSER_ONLY_LOCK = false only after PWA is revalidated end-to-end.
 *
 * When false: `public/sw.js` registers as push-only (no fetch interception).
 * Capacitor/APK wrappers may register the same SW path for native WebView push.
 */
export const NEXUS_BROWSER_ONLY_LOCK = false

export function isPwaSafeMode(): boolean {
  return NEXUS_BROWSER_ONLY_LOCK
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
