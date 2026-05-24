"use client"

import { useEffect, useRef } from "react"
import { SITE_BRAND } from "@/lib/site-branding"
import { initPwaInstallController } from "@/lib/android-install/pwa-install-controller"

const AUTH_PATH_PREFIX = "/auth/"

function shouldRegisterServiceWorker(): boolean {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone) return true
  const ua = navigator.userAgent
  return /Android|iPhone|iPad|iPod/i.test(ua)
}

function isAuthNavigationPath(): boolean {
  if (typeof window === "undefined") return false
  return window.location.pathname.startsWith(AUTH_PATH_PREFIX)
}

/** Registers the PWA service worker on mobile/standalone; handles updates safely. */
export function PwaServiceWorkerRegister() {
  const reloadingRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    if (!shouldRegisterServiceWorker()) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          void reg.unregister()
        }
      })
      return
    }

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
