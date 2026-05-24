# Browser-only stabilization (emergency lock)

## When to use

Set **`NEXUS_BROWSER_ONLY_LOCK = true`** in `lib/mobile/pwa-safe-mode.ts` for instant revert to pure browser mode (SW teardown, no manifest, no install UI).

For normal Phase 3 rollout, keep this **`false`** and use layered flags documented in `docs/PWA_PHASE3_INSTALL_LAYER.md`.

## Safe mobile baseline (scroll + compositor stable)

These flags should stay **ON** during PWA reintroduction unless explicitly testing:

- `NEXUS_NATIVE_MOBILE_SCROLL_LOCK = true` (`lib/mobile/native-mobile-scroll.ts`)
- Dashboard `nexus-mobile-stable` CSS
- Workspace render policy (slow polls on mobile)

## Phase 3 vs full browser-only

| Layer | Browser-only lock | Phase 3 Step 1 |
|-------|-------------------|----------------|
| Manifest / icons | Off | On |
| Install prompts | Off | On |
| Minimal SW (no fetch) | Off | On |
| Offline / connectivity UX | Off | Off |
| Native scroll protection | On | On |

See `docs/PWA_PHASE3_INSTALL_LAYER.md` for reintroduction order.
