# Native mobile scroll mode (isolation)

## Status

**`NEXUS_NATIVE_MOBILE_SCROLL_LOCK = true`** in `lib/mobile/native-mobile-scroll.ts`

Disables custom mobile scroll management to restore **browser-native** scrolling for isolation testing.

## Disabled on phones

- `useBodyScrollLock` / `lockBodyScroll` (no `position:fixed` body, no `touchmove` preventDefault)
- Smart header hide/show on scroll
- Fixed smart-header shell + spacer
- Dashboard `nexus-mobile-stable` compositor overrides (uses `nexus-native-scroll` instead)
- `overscroll-behavior-y: contain` on `.nexus-app-shell`
- `MobileOverlaySheet` for profile (simple anchored panel; no overlay scroll lock)
- Touch-press scale transform on active

## Still active

- Browser-only safe mode (no PWA/SW)
- Layout, tabs, bottom nav (native touch)
- `ScrollLockSafety` + `NativeScrollBootstrap` force-clear any stale `overflow:hidden`

## Re-enable custom scroll (one layer at a time)

1. Set `NEXUS_NATIVE_MOBILE_SCROLL_LOCK = false`
2. Redeploy and test
3. Re-enable individually: body lock → smart header → mobile-stable CSS

## Test on phone

1. Clear site data once
2. Open dashboard — main page scroll should feel like normal mobile web
3. Open profile — verify acceptable UX (no body lock in this mode)
4. Close and scroll again
