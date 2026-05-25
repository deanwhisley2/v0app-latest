# Nexus Pro — Master evolution direction

**Mode:** Institutional product evolution (not bug-fix-only).  
**Priority order:** Stability first → institutional polish second → advanced runtime third.

This document merges adviser directions into one canonical plan. All slices must respect the **protected core** below.

---

## Protected core (never regress)

These are non-negotiable after the routing/compositor stabilization work:

| Layer | Requirement |
|-------|-------------|
| Routing | Browser-first App Router; no auth route interception |
| Auth | Stable login/register/dashboard navigation; no mount-triggered side effects |
| Scroll | Native mobile scrolling (`html.nexus-native-scroll`); **no** body scroll lock / `touchmove` preventDefault on dashboard |
| A05 | `LOW_GPU_ANDROID_MODE` — conditional flat compositor, **not** global UI downgrade |
| SW / PWA runtime | `NEXUS_BROWSER_ONLY_LOCK` — no aggressive SW, offline takeover, or fetch interception |
| Background work | No automatic background fetch chains on mount |
| Deploy | Archive + `rsync --delete` so removed modules do not linger on VPS |

**Do not** sacrifice this baseline for visuals, motion, or install features.

---

## Product goal

Transform Nexus Pro from a functional crypto platform into a **premium intelligent financial operating system**.

Every screen should communicate: trust, intelligence, calm power, live responsiveness, institutional quality.

**Target feel:** Apple Wallet smoothness · Binance responsiveness · Revolut polish · Bloomberg seriousness · AI-fintech elegance.

**Not:** generic crypto template · cheap neon · overcrowded trading UI · flat bootstrap panels.

---

## Brand identity (permanent DNA)

### Core rule

- Keep the **original Nexus “N”** silhouette and wordmark geometry — source of truth for all branding.
- **Do not** replace with unrelated symbols, cloned logos, or gaming/cyberpunk neon.

### Evolution (refine, don’t replace)

- Metallic depth, glass edge light, emerald/cyan premium glow
- Sharper vector symmetry, better “NEXUS PRO” spacing
- Subtle candle/flow hints **inside** existing strokes (optional, restrained)
- Hover: soft motion glow on marketing surfaces only (not money-moving panels)

**Feel:** institutional fintech · secure banking · AI trading intelligence — **not** cartoon neon or random crypto clone.

**Implementation:** Phase 2 slice — SVG/asset pass + header wordmark treatment; no routing changes.

---

## Phase map (bounded slices)

| Phase | Focus | Status |
|-------|--------|--------|
| **0** | Protected core + archive deploy hygiene | **Shipped** (`b4ed0b5`) |
| **1** | `LOW_GPU_ANDROID_MODE` + targeted compositor (`contain`, flat overlays on A05 only) | **Shipped** (`c36ca05`, `5da2e12`) |
| **1b** | Smart header — passive scroll, instant reveal on upward delta | **Ready** (local; deploy with next slice) |
| **1c** | Kenya corridor — soft geo warning, CF-IPCountry, no hard block on imperfect IP | **Shipped** |
| **1d** | System fonts (no build-time Google Fonts dependency) | **Shipped** |
| **2** | Design tokens + institutional glass utilities (premium devices only) | Planned |
| **2b** | Logo refinement assets + header chrome | Planned |
| **3** | Motion layer (Framer Motion or GSAP) with `LOW_GPU` auto-reduction | Planned |
| **4** | Notifications / balance / bottom-nav polish (component-scoped) | Planned |
| **5** | PWA: lightweight manifest + installability only | Planned |
| **6** | APK delivery (optional future) — tap-triggered only, no mount fetch | **Paused** (removed for stability; see below) |
| **7** | PWA runtime (SW cache, offline) — incremental, A05 QA each step | **Not started** |

One phase = one PR = deploy → A05 + Chrome Android QA → next.

---

## LOW_GPU_ANDROID_MODE

**Flag:** `LOW_GPU_ANDROID_MODE` in `lib/mobile/mobile-low-gpu-mode.ts`  
**API:** `isLowGpuAndroid()`, `isMobileLowGpuMode()`  
**Class:** `html.nexus-mobile-low-gpu`

**Detect:** Android + Samsung A0x / budget UA / Mali renderer / mem+cores / optional FPS probe.

**When active, disable only:**

- Heavy blur stacks, layered transparency, repaint-heavy animated gradients
- Shimmer storms, pulsing glows, compositor-heavy transform stacks

**Preserve:**

- Premium dark fintech identity, emerald accent system, institutional card surfaces (flat but refined)

**Premium phones:** full glass, blur, gradients, motion (reduced cost via rAF policy in `workspace-render-policy.ts`).

See `docs/MOBILE_LOW_GPU_MODE.md`.

---

## Compositor / glitter (targeted only)

Affected regions (from device QA): notifications portal, transfer card, fixed session rows, workspace lists.

**Apply only there:**

```css
contain: layout paint;
backface-visibility: hidden;
transform: translateZ(0); /* single layer */
```

**Reduce:** live tick frequency on low GPU (`workspace-render-policy.ts`), nested opacity, unnecessary animation loops.

**Do not** flatten unrelated dashboard sections globally.

---

## Smart header

**Chrome:** Nexus wordmark · search · notifications · profile (inside `SmartMobileHeaderShell`).

| Gesture | Behavior |
|---------|----------|
| Scroll down | Hide after small threshold (~8px) |
| Scroll up (any negative delta while hidden) | **Instant** reveal — mid-page, not only at top |
| At top | Always visible |

**Implementation:**

- Passive `scroll` listener + rAF for hide path
- Instant reveal bypasses rAF when hidden && scrolling up
- `translateY` on `.nexus-smart-header-shell` only
- No body lock, no touch interception, no nested fixed wrappers

**Low GPU:** same behavior; solid background, no blur, no elevated shadow, 120ms transform.

Code: `hooks/use-smart-mobile-header.ts`, `lib/mobile/smart-header-scroll.ts`.

---

## Motion system (future — Phase 3)

**Stack:** Framer Motion or GSAP (not CSS-only for primary interactions).

**Premium devices:**

- Spring: `stiffness ~300`, `damping ~20`
- Staggered card entrance (0.04s stagger)
- `whileTap={{ scale: 0.96 }}` on pressable controls
- Subtle ambient mesh light (very low amplitude)

**LOW_GPU_ANDROID_MODE:**

- Disable springs, stagger, ambient loops
- Keep tap feedback minimal or none

**Never** animate ledger amounts for “fake” P/L — earnings remain server-sourced per financial rules.

---

## Install / APK / PWA

### Current production

- **APK install UI and APIs removed** for stability (`c36ca05`).
- **Browser-only lock** on; manifest omitted while lock is active.
- SW teardown on load (unregister + cache clear).

### Future (only if explicitly re-approved)

**Allowed next (Phase 5):**

- Lightweight `manifest.webmanifest`
- Installability / standalone display metadata
- Still **no** auth fetch interception

**APK (Phase 6, optional):**

- User-tap download only
- `release-info.json` + validate-before-download
- **No** mount fetches, polling, or auth route interception

**Not yet (Phase 7):**

- Offline routing, runtime caching layer, navigation takeover

Every step: deploy → Samsung A05 test → proceed.

---

## Kenya / corridor registration

- Prefer `cf-ipcountry` / edge headers before IP API
- Unknown or mismatched geo → **allow** with soft warning + user confirmation
- Never hard-block registration on imperfect mobile-carrier NAT (Safaricom, Airtel Kenya)

Code: `lib/server/country-corridor-guard.ts`, `lib/server/request-geo.ts`.

---

## Design language (Phase 2 tokens)

Institutional palette (evolve toward, map to existing theme gradually):

| Token | Value |
|-------|--------|
| `--nexus-bg-primary` | `#0A0F1C` |
| `--nexus-bg-secondary` | `#121A2E` |
| `--nexus-card-glass` | `rgba(20, 28, 52, 0.82)` |
| `--nexus-accent-primary` | `#00E7B0` |
| `--nexus-accent-secondary` | `#00D4A5` |
| `--nexus-text-secondary` | `#A3B8D9` |
| `--nexus-glass-border` | `rgba(255,255,255,0.08)` |
| `--nexus-emerald-glow` | `rgba(0,231,176,0.25)` |

**Glass utility (premium only):** `lib/design/nexus-glass.css` — disabled under `html.nexus-mobile-low-gpu`.

**Typography:** system-ui stack in production build; Inter optional when CDN available. Large balances dominate; 700 headings, 400 body.

---

## Content strategy

- CryptoCash-style **information architecture** may inspire structure only.
- **Never** copy names, branding, or 1:1 layouts.
- Add over time: trust microcopy, institutional explanations, live system indicators, smart empty states, AI insight panels (advisory copy only).

---

## QA matrix (every visual slice)

| Device | Checks |
|--------|--------|
| Samsung A05 | No compositor glitter; scroll not frozen; smart header reveal; flat mode only on low GPU |
| Chrome Android mid | Full premium glass/motion where enabled |
| Desktop | No mobile regressions |
| Auth | Login → register → dashboard without loop or blank screen |

---

## Agent / contributor checklist

Before merging an evolution slice:

1. Does it touch the protected core? If yes, justify and add rollback.
2. Is it scoped to one phase row above?
3. Does `LOW_GPU` gate new blur/motion/gradients?
4. DB / treasury / referral in a **separate** PR?
5. Deploy + health + A05 spot-check per `deployment-completion.mdc`.

---

## References

- `docs/MOBILE_LOW_GPU_MODE.md`
- `docs/STABILIZATION_SAFE_MODE.md`
- `docs/NATIVE_MOBILE_SCROLL_MODE.md`
- `.cursor/rules/nexus-master-evolution.mdc`
- `lib/design/nexus-glass.css` (premium glass utilities)
