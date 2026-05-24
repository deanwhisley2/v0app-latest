# Phase 3 — PWA install layer (Step 1)

## Status (production flags in `lib/mobile/pwa-safe-mode.ts`)

| Flag | Value | Meaning |
|------|-------|---------|
| `NEXUS_BROWSER_ONLY_LOCK` | `false` | Emergency revert → set `true` |
| `NEXUS_PWA_INSTALL_LAYER` | `true` | Manifest, install UX, standalone chrome |
| `NEXUS_PWA_MINIMAL_SW` | `true` | Install SW — **no fetch handler** |
| `NEXUS_PWA_RESUME_LAYER` | `false` | Step 5 — auth refresh on resume |
| `NEXUS_PWA_OFFLINE_LAYER` | `false` | Step 6–7 — connectivity + SW routing |

## Enabled (Step 1)

- `manifest.webmanifest` + app icons in metadata
- `beforeinstallprompt` capture + Android install cards (login/register/dashboard)
- Standalone display (`html.nexus-pwa-standalone`) when launched from home screen
- Minimal service worker: precache icons + `/offline` only — **zero fetch interception**

## Still protected (unchanged)

- `NEXUS_NATIVE_MOBILE_SCROLL_LOCK` — native scroll, no body lock
- `nexus-mobile-stable` + workspace render policy — flat compositor, slow polls
- Passive smart header only

## Still disabled

- SW navigation / auth / API / RSC interception
- Connectivity strip + offline takeover
- Resume auth refresh (until Step 5)
- Browser-only SW teardown script

## Phone QA after deploy

1. Clear site data once (removes old self-unregistering SW)
2. Chrome Android → login → **Install App** / Add to Home Screen
3. Open from home screen → fullscreen, no URL bar
4. Scroll dashboard + trading workspace — must stay smooth
5. Auth routes (`/auth/login`, register) — no “couldn’t load”
6. Profile open/close — scroll still works

## Rollback

**Full browser-only (instant):**
```ts
NEXUS_BROWSER_ONLY_LOCK = true
```

**Known-good mobile baseline (pre–Phase 3):**
```bash
DEPLOY_REF=60d5b64 bash scripts/deploy-vps-git-archive.sh
```

## Next steps (one flag at a time)

1. ~~Step 1: install layer~~ (this slice)
2. Step 5: `NEXUS_PWA_RESUME_LAYER = true`
3. Step 6: `NEXUS_PWA_OFFLINE_LAYER = true` + soft connectivity only
4. Step 7: optional SW navigate fallback to `/offline` (never auth/api)
