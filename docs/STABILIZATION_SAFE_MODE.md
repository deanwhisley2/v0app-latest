# Browser-only stabilization (hard lock)

## Status

**`NEXUS_BROWSER_ONLY_LOCK = true`** in `lib/mobile/pwa-safe-mode.ts`

The entire PWA/APK runtime layer is disconnected. Nexus runs as a **pure browser application**.

## Disabled globally

- Service worker registration (`sw.js` self-unregisters if ever loaded)
- All cache storage (cleared on load + repeated teardown for 20s)
- Offline / reconnect banners and fetch patching
- PWA manifest link in HTML metadata
- `apple-mobile-web-app-capable` metadata
- PWA runtime bootstrap
- Native PWA install prompt (`beforeinstallprompt`)

## Lightweight install UX (browser-only)

**`NEXUS_LIGHTWEIGHT_ANDROID_INSTALL = true`** — Android-only install card on auth + dashboard:

- Download official APK (existing `/api/app/android-release` flow)
- Manual “browser menu → Add to Home Screen” instructions
- **No** service worker, manifest, standalone routing, or offline layer

See `docs/LIGHTWEIGHT_ANDROID_INSTALL.md`.

## Still active

- Next.js App Router (normal client + server navigation)
- Auth, dashboard, APIs via direct browser networking
- Core trading / wallet UI

## Clean-state test (required)

1. DevTools → Application → **Clear site data**
2. Service Workers → confirm **none** control the page
3. Hard refresh (`Ctrl+Shift+R`)
4. Test: landing → Get started, I have an account, `/auth/login`, `/auth/register`, dashboard

If a controlling service worker still appears, close all tabs for the domain and reopen.

## Diagnostic interpretation

| Result | Conclusion |
|--------|------------|
| Navigation works after clean state | Root cause was PWA/SW/runtime layer |
| Still “This page couldn’t load” | Investigate nginx, proxy, RSC, SSR, PM2 — not PWA |

## 501 / gateway

Capture exact URL + method from Network tab. App APK endpoint returns **503** when no signed APK is published (not 501).

## Re-enable PWA (later, one layer at a time)

1. Set `NEXUS_BROWSER_ONLY_LOCK = false` in `lib/mobile/pwa-safe-mode.ts`
2. Redeploy and test auth navigation only (no SW changes yet)
3. Reintroduce SW, offline UI, install prompts in separate slices with device QA
