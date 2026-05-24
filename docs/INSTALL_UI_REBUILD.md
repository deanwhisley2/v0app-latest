# Install UI rebuild (binary search)

Full install card (`AndroidInstallPrompt` + `useAndroidInstallPromotion`) **breaks mobile routing** when enabled — even with browser-only lock. Suspects: mount-time APK fetch, device detection, hydration, hook chain.

## Flags

| Flag | Purpose |
|------|---------|
| `NEXUS_LIGHTWEIGHT_ANDROID_INSTALL` | Full install card — **off** until root cause fixed |
| `NEXUS_INSTALL_STATIC_BANNER` | Phase 1 static div only |

Only one install surface flag should be `true` at a time.

## Rebuild order (one deploy each, A05 PASS before next)

| Step | Enable | Add |
|------|--------|-----|
| 0 | both `false` | Stable baseline |
| 1 | `NEXUS_INSTALL_STATIC_BANNER=true` | Static text banner (no hooks) — **PASS** |
| 2 | — | Dismiss button (local `useState` only) — **PASS** |
| 3 | — | Android-only via server `User-Agent` substring — **current** |
| 4 | — | APK link button (no prefetch) |
| 5 | — | On-demand `/api/app/android-release` fetch (user click only) |

Do **not** re-enable `NEXUS_LIGHTWEIGHT_ANDROID_INSTALL` until each step passes on A05.

## Auth wiring

Login/register: server `page.tsx` reads `User-Agent` → passes `showAndroidInstallBanner` boolean to client form. **No client navigator** during hydration.

## Rollback

```bash
# Install fully off
DEPLOY_REF=<last-good-sha> bash scripts/deploy-vps-git-archive.sh
```

Or set both install flags to `false` in `lib/mobile/pwa-safe-mode.ts`.
