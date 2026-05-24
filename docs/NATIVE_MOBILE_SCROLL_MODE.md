# Native mobile scroll mode (isolation)

## Status

**`NEXUS_NATIVE_MOBILE_SCROLL_LOCK = true`** in `lib/mobile/native-mobile-scroll.ts`

Disables **heavy** scroll interception while keeping browser-native scrolling and lightweight chrome.

## Disabled on phones

- `useBodyScrollLock` / `lockBodyScroll` (no `position:fixed` body, no `touchmove` preventDefault)
- `overscroll-behavior-y: contain` on `.nexus-app-shell`
- `MobileOverlaySheet` for profile (simple anchored panel; no overlay scroll lock)
- Touch-press scale transform on active

## Still active

- **`nexus-mobile-stable`** compositor-safe flat rendering (no glittering)
- **Smart header** — passive scroll listener, fixed shell, reveal on upward gesture
- Browser-only safe mode (no PWA/SW)
- Layout, tabs, bottom nav (native touch)
- `ScrollLockSafety` + `NativeScrollBootstrap` force-clear any stale `overflow:hidden`

## Re-enable body lock (optional, after phone QA)

1. Set `NEXUS_NATIVE_MOBILE_SCROLL_LOCK = false`
2. Redeploy and test scroll + profile overlay carefully

## Test on phone

1. Hard refresh or clear site data once
2. Scroll dashboard down — header should hide
3. Slight upward scroll — logo/search/notifications/profile should reappear immediately
4. Verify no scroll freeze, no glittering, profile open/close still scrolls
