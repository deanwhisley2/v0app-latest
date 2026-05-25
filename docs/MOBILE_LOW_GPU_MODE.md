# LOW_GPU_ANDROID_MODE (Samsung A05 class)

**Flag:** `LOW_GPU_ANDROID_MODE = true` in `lib/mobile/mobile-low-gpu-mode.ts`

**Detection:** `isLowGpuAndroid()` — Android + (Samsung A-series / budget UA / Mali GPU / Android Go / low mem+cores / FPS probe fail).

## Document class

`html.nexus-mobile-low-gpu` — set **before paint** via head boot script, confirmed by `MobileLowGpuBootstrap` + optional FPS probe.

## Premium UI preserved on

- Desktop / tablet
- Higher-end Android (no low-GPU signals)
- iOS

## Flat compositor rules (low-GPU only)

Scoped under `html.nexus-mobile-low-gpu .nexus-mobile-stable` and portaled overlays:

- No backdrop-blur / animated gradients / shimmer / heavy shadows
- Flat premium dark cards (`nexus-flat-card`, `nexus-transfer-panel`, session rows)
- `contain: layout paint` on wallet, transfer, notifications, workspace lists
- Slower workspace polls via `workspace-render-policy.ts`

## Does NOT touch

- Auth routing, App Router, PWA/SW/manifest
- Native scroll isolation (`.nexus-mobile-stable` shell only)

## QA (Samsung A05)

Scroll dashboard, transfer card, notifications, fixed sessions, workspace — no tearing; premium phones unchanged.
