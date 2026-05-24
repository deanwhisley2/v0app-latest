"use client"

import { useEffect, useRef } from "react"
import { SITE_BRAND } from "@/lib/site-branding"
import { initPwaInstallController } from "@/lib/android-install/pwa-install-controller"
import { isPwaSafeMode } from "@/lib/mobile/pwa-safe-mode"

const AUTH_PATH_PREFIX = "/auth/"

function isAuthNavigationPath(): boolean {
  if (typeof window === "undefined") return false
  return window.location.pathname.startsWith(AUTH_PATH_PREFIX)
}

/** Registers the PWA service worker when full PWA mode is enabled (NEXT_PUBLIC_PWA_FULL=1). */
export function PwaServiceWorkerRegister() {
  const reloadingRef = useRef(false)

  useEffect(() => {
    if (isPwaSafeMode()) return
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    initPwaInstallController()
    const version = SITE_BRAND.assetVersion

    void navigator.serviceWorker
      .register(`/sw.js?v=${version}`, { scope: "/" })
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing
          if (!worker) return
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" })
            }
          })
        })
      })
      .catch(() => {
        /* unsupported or blocked */
      })

    const onControllerChange = () => {
      if (reloadingRef.current) return
      if (document.visibilityState !== "visible") return
      if (isAuthNavigationPath()) return
      reloadingRef.current = true
      window.setTimeout(() => window.location.reload(), 300)
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
  }, [])

  return null
}
