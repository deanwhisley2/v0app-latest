# Mobile routing debug phase

PWA/runtime layers are **off**. If “This page couldn’t load” still appears, the cause is elsewhere — this doc explains how to capture evidence.

## On-device overlay (no USB required)

Append `?nexus_debug=1` to any URL, e.g.:

- `https://www.nexuspro.it.com/?nexus_debug=1`
- `https://www.nexuspro.it.com/auth/login?nexus_debug=1`

A black debug strip at the bottom shows the last client events (fetch failures, errors, link clicks, route transitions).

## Direct route tests

Open these **directly** in the address bar (no landing-page buttons):

| URL | If it works alone |
|-----|-------------------|
| `/auth/login` | Client `<Link>` navigation may be the failure point |
| `/auth/register` | Same |
| `/dashboard` | Auth/middleware or dashboard render |

## Chrome remote debugging (best signal)

1. Android phone: enable **Developer options → USB debugging**
2. Desktop Chrome: `chrome://inspect#devices`
3. Connect USB, open the failing tab
4. **Inspect** → **Console** + **Network**
5. Reproduce the failure
6. Capture:
   - Last **red** network request (URL, method, status)
   - Console errors / hydration warnings
   - Whether failure is on document load vs `_rsc` / `RSC` flight request

## Server-side logs (PM2)

Events POST to `/api/diagnostics/client-event` and appear in PM2 stdout:

```bash
ssh root@173.214.164.179 'pm2 logs nexus --lines 200 | grep nexus-diag'
```

Look for:

| `kind` | Meaning |
|--------|---------|
| `fetch_fail` / `fetch_error` | Same-origin request failed (often RSC navigation) |
| `sw_teardown_reload` | One-time reload after old SW removed |
| `window_error` / `unhandled_rejection` | JS crash |
| `hydration_hint` | React hydration mismatch |
| `route_transition` | Client router reached a path |
| `resource_error` | Script/stylesheet failed to load |

## Current flags

| Flag | Value | Purpose |
|------|-------|---------|
| `NEXUS_BROWSER_ONLY_LOCK` | `true` | No SW/manifest/runtime |
| `NEXUS_LIGHTWEIGHT_ANDROID_INSTALL` | **`false`** | Install card off for clean baseline |
| `NEXUS_MOBILE_NAV_DIAGNOSTICS` | `true` | Global failure capture |

## After root cause is found

1. Fix the actual bug (routing, middleware, RSC, asset, etc.)
2. Set `NEXUS_LIGHTWEIGHT_ANDROID_INSTALL = true` again (APK + manual install UX)
3. Set `NEXUS_MOBILE_NAV_DIAGNOSTICS = false` when noise is no longer needed

## APK note

Install UX is **temporarily disabled for debugging only**. It does not register SW or change routing — it will be re-enabled once navigation is proven stable.
