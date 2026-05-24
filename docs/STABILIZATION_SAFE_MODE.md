# Stabilization safe mode (browser-first)

## Status

**Default:** safe mode **ON** (`NEXT_PUBLIC_PWA_FULL` unset).

## What is disabled

- Service worker registration (all clients unregistered + caches cleared)
- Offline / reconnect banners and fetch stability patching
- PWA install prompt capture and Android install/update promotion UI
- PWA runtime bootstrap (install persistence, SW update reload)

## What still works

- Normal Next.js App Router navigation (browser network only)
- Auth, dashboard, API routes
- Core trading and wallet UI

## Re-enable PWA (after validation)

1. Set `NEXT_PUBLIC_PWA_FULL=1` in the VPS build environment.
2. Redeploy.
3. Test landing → `/auth/login`, `/auth/register`, dashboard on desktop + Android.
4. Reintroduce offline/install features incrementally.

## Clean-state test checklist

1. DevTools → Application → Service Workers → Unregister all.
2. Clear site data (cookies, cache, storage).
3. Hard refresh (`Ctrl+Shift+R`).
4. Verify landing → Get started → login form loads.
5. Network tab: no `sw.js` controller; document requests go direct to origin.

## 501 / gateway notes

- App APK route returns **503** when no signed APK is published (`/api/app/android-apk`).
- **501** usually indicates reverse-proxy/nginx rejecting a method or upstream mismatch — capture the exact failing URL + method from Network tab.
- RSC requests must not be cached or rewritten by SW (safe mode avoids SW entirely).
