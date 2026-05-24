"use client"

import { useEffect, useRef } from "react"
import { SITE_BRAND } from "@/lib/site-branding"

/** Registers the PWA service worker, handles updates, and captures install prompts globally. */
import { initPwaInstallController } from "@/lib/android-install/pwa-install-controller"
export function PwaServiceWorkerRegister() {
  const reloadingRef = useRef(false)

  useEffect(() => {
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
      reloadingRef.current = true
      window.setTimeout(() => window.location.reload(), 300)
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
  }, [])

  return null
}
