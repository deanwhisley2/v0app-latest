# Mobile low GPU mode (A05 class)

**Flag:** `NEXUS_MOBILE_LOW_GPU_MODE = true` in `lib/mobile/mobile-low-gpu-mode.ts`

## Document class

`html.nexus-mobile-low-gpu` — set **before paint** via head boot script, confirmed by `MobileLowGpuBootstrap`.

## Auto-enabled when (mobile viewport + any of)

- Samsung Galaxy A-series UA (`SM-A05`, etc.)
- `deviceMemory <= 4` or `hardwareConcurrency <= 4`
- Budget UA heuristics (Tecno, Itel, Infinix, Redmi 9A)
- Android WebView (Nexus APK) when combined with budget signals above

## What it does

- **Document-wide** flat rules for portaled notification overlays (body portals — not inside `.nexus-mobile-stable`)
- Disables smart header translate/hide (no scroll-driven compositor layer)
- Solid overlay scrims (no backdrop-blur)
- Flat fixed-trade session cards (no alpha stacks)
- Flat wallet/transfer panels with `contain: layout paint`
- Hides live price ticker; disables swipe-row transforms in notification panel
- Slows workspace poll/tick intervals via `workspace-render-policy.ts`

## Does NOT touch

- Auth routing, App Router, PWA/SW/manifest
- Native scroll isolation
- APK install layer

## QA (Samsung A05)

Scroll dashboard deep, open transfer section, notifications, profile, workspace — zero tearing/glitter.
