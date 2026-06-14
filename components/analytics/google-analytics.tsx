"use client"

import Script from "next/script"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"
import { gaPageview, getGoogleAnalyticsMeasurementId } from "@/lib/analytics/google-analytics"

function GoogleAnalyticsRouteTrackerInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const measurementId = getGoogleAnalyticsMeasurementId()

  useEffect(() => {
    if (!measurementId || !pathname) return
    const query = searchParams?.toString()
    const path = query ? `${pathname}?${query}` : pathname
    gaPageview(path, measurementId)
  }, [pathname, searchParams, measurementId])

  return null
}

/** Sends GA4 page_view on App Router client navigations. */
export function GoogleAnalyticsRouteTracker() {
  if (!getGoogleAnalyticsMeasurementId()) return null
  return (
    <Suspense fallback={null}>
      <GoogleAnalyticsRouteTrackerInner />
    </Suspense>
  )
}

/** Loads gtag.js for the canonical Nexus Pro GA4 property (skipped in dev-local-only mode). */
export function GoogleAnalyticsScripts() {
  const measurementId = getGoogleAnalyticsMeasurementId()
  if (!measurementId) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}', {
            send_page_view: true,
            page_location: window.location.href,
            cookie_domain: 'nexuspro.it.com',
            cookie_flags: 'SameSite=None;Secure'
          });
        `}
      </Script>
    </>
  )
}
