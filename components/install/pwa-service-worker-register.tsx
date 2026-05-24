"use client"

import { useEffect, useRef } from "react"
import { SITE_BRAND } from "@/lib/site-branding"
import { initPwaInstallController } from "@/lib/android-install/pwa-install-controller"
import { isPwaMinimalSwEnabled } from "@/lib/mobile/pwa-safe-mode"

/** Registers minimal install SW (no fetch interception) + global beforeinstallprompt capture. */
export function PwaServiceWorkerRegister() {
  const registeredRef = useRef(false)

  useEffect(() => {
    if (!isPwaMinimalSwEnabled()) return
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    if (registeredRef.current) return
    registeredRef.current = true

    initPwaInstallController()
    const version = SITE_BRAND.assetVersion

    void navigator.serviceWorker.register(`/sw.js?v=${version}`, { scope: "/" }).catch(() => {
      /* unsupported or blocked */
    })
  }, [])

  return null
}
