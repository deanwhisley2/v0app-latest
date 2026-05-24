"use client"

import { useEffect } from "react"
import { isPwaSafeMode } from "@/lib/mobile/pwa-safe-mode"
import { reportClientDiagnostic } from "@/lib/mobile/mobile-navigation-diagnostics"

async function tearDownPwaClientState(): Promise<boolean> {
  if (typeof window === "undefined") return false
  const hadController = Boolean(navigator.serviceWorker?.controller)
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ("caches" in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* ignore */
  }
  return hadController
}

/** Ensures no SW/cache survives; repeats teardown during first seconds after load. */
export function PwaSafeModeBootstrap() {
  useEffect(() => {
    if (!isPwaSafeMode()) return

    let cancelled = false
    const run = async () => {
      const hadController = await tearDownPwaClientState()
      if (cancelled) return
      if (hadController && !sessionStorage.getItem("nexus_browser_only_reload")) {
        reportClientDiagnostic({
          kind: "sw_teardown_reload",
          message: "reloading after SW unregister (client bootstrap)",
        })
        sessionStorage.setItem("nexus_browser_only_reload", "1")
        window.location.reload()
      }
    }

    void run()
    const interval = window.setInterval(() => {
      void tearDownPwaClientState()
    }, 4000)
    const stop = window.setTimeout(() => window.clearInterval(interval), 20000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.clearTimeout(stop)
    }
  }, [])

  return null
}
