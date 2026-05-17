/**
 * Mobile dashboard render policy — stability over visual effects.
 * Re-enable Joelin FAB on phones only for QA: NEXT_PUBLIC_DASHBOARD_MOBILE_FAB=1
 */
export function isDashboardMobileFabEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DASHBOARD_MOBILE_FAB === "1"
}

/** Tailwind: flat opaque card on mobile (gradients/shadows stripped via globals too). */
export const MOBILE_FLAT_SURFACE =
  "max-md:!border-border max-md:!bg-card max-md:[background-image:none] max-md:!shadow-none"

/** Tailwind: no CSS animation on mobile. */
export const MOBILE_STATIC_MOTION = "max-md:!animate-none max-md:!transition-none"
