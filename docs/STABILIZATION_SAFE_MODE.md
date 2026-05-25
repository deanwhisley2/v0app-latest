# Browser-only stabilization (hard lock)

## Status

**`NEXUS_BROWSER_ONLY_LOCK = true`** in `lib/mobile/pwa-safe-mode.ts`

Nexus runs as a **pure browser application**. APK delivery, install banners, and PWA runtime are removed.

## Disabled globally

- Service worker registration (`sw.js` self-unregisters if ever loaded)
- All cache storage (cleared on load + repeated teardown for 20s)
- Offline / reconnect banners and fetch patching
- PWA manifest link in HTML metadata (while lock is on)
- `apple-mobile-web-app-capable` metadata
- Android APK download APIs and install UI

## Still active

- Next.js App Router (normal client + server navigation)
- Auth, dashboard, APIs via direct browser networking
- Core trading / wallet UI
- `LOW_GPU_ANDROID_MODE` for Samsung A0x-class compositor stability

## Clean-state test (required)

1. DevTools → Application → **Clear site data**
2. Service Workers → confirm **none** control the page
3. Hard refresh (`Ctrl+Shift+R`)
4. Test: landing → Get started, I have an account, `/auth/login`, `/auth/register`, dashboard

If a controlling service worker still appears, close all tabs for the domain and reopen.

## Re-enable PWA later (not APK)

Set `NEXUS_BROWSER_ONLY_LOCK = false` in `lib/mobile/pwa-safe-mode.ts`, redeploy, and revalidate manifest + SW end-to-end before production.
