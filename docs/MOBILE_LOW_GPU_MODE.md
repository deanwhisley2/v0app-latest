# Mobile low GPU mode (A05 class)

**Flag:** `NEXUS_MOBILE_LOW_GPU_MODE = true` in `lib/mobile/mobile-low-gpu-mode.ts`

**Document class:** `html.nexus-mobile-low-gpu` (set by `MobileLowGpuBootstrap` on qualifying phones only)

## Auto-enabled when (mobile viewport + any of)

- Samsung Galaxy A-series UA (`SM-A05`, etc.)
- `deviceMemory <= 4` or `hardwareConcurrency <= 4`
- Other budget UA heuristics in `isLowEndMobileDevice()`

## What it does (CSS only on dashboard)

- Flattens smart header (no translate hide, no elevation shadow)
- Solid overlay scrims (no backdrop-blur)
- Flat wallet/transfer panels with `contain: layout paint`
- Hides live price ticker strip
- Disables touch-scale micro-animations
- Slows workspace poll/tick intervals via `workspace-render-policy.ts`

## Does NOT touch

- Auth routing, App Router, PWA/SW/manifest
- Native scroll isolation
- APK install layer

## QA (Samsung A05)

Scroll dashboard deep, open transfer section, notifications, profile, workspace — zero tearing/glitter.
