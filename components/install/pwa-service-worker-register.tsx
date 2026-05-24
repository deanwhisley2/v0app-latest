"use client"

import { useEffect, useRef } from "react"
import { SITE_BRAND } from "@/lib/site-branding"

/** Registers the PWA service worker, handles updates, and enables install prompt capture. */
export function PwaServiceWorkerRegister() {
  const reloadingRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
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
      reloadingRef.current = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
  }, [])

  return null
}
