/**
 * Browser-first stabilization mode.
 *
 * Default ON in production builds. Re-enable full PWA (SW, offline UI, install prompts)
 * only after routing is validated: set NEXT_PUBLIC_PWA_FULL=1 at build time.
 */
export function isPwaSafeMode(): boolean {
  return process.env.NEXT_PUBLIC_PWA_FULL !== "1"
}

/** Runs before React hydration to tear down stale workers/caches. */
export const PWA_SAFE_MODE_TEARDOWN_SCRIPT = `
(function(){
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(regs){
        for (var i = 0; i < regs.length; i++) regs[i].unregister();
      });
    }
    if ('caches' in window) {
      caches.keys().then(function(keys){
        for (var j = 0; j < keys.length; j++) caches.delete(keys[j]);
      });
    }
  } catch (e) {}
})();
`.trim()
