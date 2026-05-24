"use client"

import { useEffect } from "react"
import { SITE_BRAND } from "@/lib/site-branding"

/** Registers the PWA service worker and enables install prompt capture globally. */
export function PwaServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    const version = SITE_BRAND.assetVersion
    void navigator.serviceWorker
      .register(`/sw.js?v=${version}`, { scope: "/" })
      .catch(() => {
        /* unsupported or blocked */
      })
  }, [])

  return null
}
