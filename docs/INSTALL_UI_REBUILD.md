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
| 1 | `NEXUS_INSTALL_STATIC_BANNER=true` | Static text banner (no hooks) |
| 2 | — | Dismiss button (local state only) |
| 3 | — | Android-only CSS/media or simple UA check |
| 4 | — | APK link button (no prefetch) |
| 5 | — | On-demand `/api/app/android-release` fetch (user click only) |

Do **not** re-enable `NEXUS_LIGHTWEIGHT_ANDROID_INSTALL` until each step passes on A05.

## Auth wiring

Login/register use `AndroidInstallStaticBanner` when static flag is on — **no import** of `android-install-prompt.tsx` on auth pages during rebuild.

## Rollback

```bash
# Install fully off
DEPLOY_REF=<last-good-sha> bash scripts/deploy-vps-git-archive.sh
```

Or set both install flags to `false` in `lib/mobile/pwa-safe-mode.ts`.
