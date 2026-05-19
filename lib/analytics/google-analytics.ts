import { isDevLocalOnly } from "@/lib/dev-local-mode"

/** Canonical GA4 property for https://www.nexuspro.it.com (global site traffic). */
export const NEXUS_GA4_MEASUREMENT_ID = "G-H3GZ631CQ9"

const GA4_ID_PATTERN = /^G-[A-Z0-9]+$/i

/**
 * Active GA4 measurement ID. Defaults to {@link NEXUS_GA4_MEASUREMENT_ID}.
 * Optional `NEXT_PUBLIC_GA_MEASUREMENT_ID` overrides for staging only — do not point production at legacy IDs.
 */
export function getGoogleAnalyticsMeasurementId(): string | null {
  if (isDevLocalOnly()) return null
  const env = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()
  if (env) {
    if (!GA4_ID_PATTERN.test(env)) return NEXUS_GA4_MEASUREMENT_ID
    return env
  }
  return NEXUS_GA4_MEASUREMENT_ID
}

export function isGoogleAnalyticsEnabled(): boolean {
  return getGoogleAnalyticsMeasurementId() != null
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

export function gaPageview(path: string, measurementId: string): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return
  const pageLocation = typeof window.location?.href === "string" ? window.location.href : path
  window.gtag("config", measurementId, {
    page_path: path,
    page_location: pageLocation,
  })
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: pageLocation,
    send_to: measurementId,
  })
}

export function gaEvent(
  name: string,
  params?: Record<string, string | number | boolean | undefined>,
): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return
  window.gtag("event", name, params ?? {})
}
