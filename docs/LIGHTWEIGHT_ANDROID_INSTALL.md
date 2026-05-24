# Lightweight Android install UX (browser-only)

## Goal

Offer install guidance **without** reintroducing PWA/runtime architecture that destabilized routing on low-end Android (e.g. Samsung A05).

## Flags (`lib/mobile/pwa-safe-mode.ts`)

| Flag | Value | Effect |
|------|-------|--------|
| `NEXUS_BROWSER_ONLY_LOCK` | `true` | No SW, manifest, offline, standalone chrome |
| `NEXUS_LIGHTWEIGHT_ANDROID_INSTALL` | `true` | Show Android install card only |

## What it does

- Android mobile browser detection (existing `detectInstallSurface`)
- Card on login, register, and post-login dashboard
- Primary action: **Download APK** when published
- Always shows manual **Add to Home Screen** steps for the user’s browser
- Dismiss / snooze (existing storage helpers)

## What it does NOT do

- Register a service worker
- Link a web manifest
- Intercept navigation or fetch
- Enable offline mode
- Use `beforeinstallprompt` (PWA native install)

## Surfaces

- `components/install/android-install-prompt.tsx`
- `hooks/use-android-install-promotion.ts` (`lightweight` branch)
- Gated via `isLightweightAndroidInstallEnabled()`

## Re-enable full PWA (later)

Only after device QA proves stable routing with each layer:

1. Set `NEXUS_BROWSER_ONLY_LOCK = false`
2. Reintroduce manifest → minimal SW → offline in **separate** deploy slices
