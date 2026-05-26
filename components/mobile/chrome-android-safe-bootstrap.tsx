"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import {
  CHROME_BFCACHE_RESET_EVENT,
  isAndroidChromeBrowser,
  isChromeAndroidSafeModeActive,
  purgeChromeUnsafeSessionState,
} from "@/lib/mobile/chrome-android-safe-mode"
import { reportClientDiagnostic } from "@/lib/mobile/mobile-navigation-diagnostics"

/**
 * Chrome Android lifecycle guard — bfcache recovery, hydration diagnostics, render churn.
 * No-op on Brave and desktop browsers.
 */
export function ChromeAndroidSafeBootstrap() {
  const pathname = usePathname()
  const renderCountRef = useRef(0)
  const hydratedRef = useRef(false)

  useEffect(() => {
    if (!isAndroidChromeBrowser()) return

    if (!document.documentElement.classList.contains("nexus-chrome-android-safe")) {
      document.documentElement.classList.add("nexus-chrome-android-safe")
      window.__NEXUS_CHROME_SAFE__ = true
    }

    const boot = window.__NEXUS_CHROME_SAFE_BOOT__
    reportClientDiagnostic({
      kind: "chrome_safe_boot",
      message: "Chrome Android safe bootstrap mounted",
      meta: {
        pathname: window.location.pathname,
        initialPathname: boot?.pathname ?? null,
        clearedKeys: boot?.clearedKeys ?? [],
        bfcache: boot?.bfcache ?? false,
      },
    })

    const onBfcache = () => {
      const cleared = purgeChromeUnsafeSessionState()
      reportClientDiagnostic({
        kind: "chrome_bfcache",
        message: "bfcache reset — forced clean session",
        meta: { pathname: window.location.pathname, clearedKeys: cleared },
      })
    }

    window.addEventListener(CHROME_BFCACHE_RESET_EVENT, onBfcache)
    return () => window.removeEventListener(CHROME_BFCACHE_RESET_EVENT, onBfcache)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    reportClientDiagnostic({
      kind: "chrome_route",
      message: "route paint",
      path: pathname ?? window.location.pathname,
      meta: {
        readyState: document.readyState,
        href: window.location.pathname,
      },
    })
  }, [pathname])

  useEffect(() => {
    if (!isChromeAndroidSafeModeActive()) return
    renderCountRef.current += 1
    if (!hydratedRef.current) {
      hydratedRef.current = true
      reportClientDiagnostic({
        kind: "chrome_hydration",
        message: "Chrome Android hydration complete",
        meta: {
          pathname,
          renderCount: renderCountRef.current,
          readyState: typeof document !== "undefined" ? document.readyState : null,
        },
      })
      return
    }
    if (renderCountRef.current <= 8 || renderCountRef.current % 10 === 0) {
      reportClientDiagnostic({
        kind: "chrome_route",
        message: pathname ?? "/",
        path: pathname ?? undefined,
        meta: { renderCount: renderCountRef.current },
      })
    }
  }, [pathname])

  return null
}
