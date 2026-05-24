"use client"

import { useEffect } from "react"
import { isPwaSafeMode } from "@/lib/mobile/pwa-safe-mode"

async function tearDownPwaClientState(): Promise<void> {
  if (typeof window === "undefined") return
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
}

/** Ensures no SW/cache survives after deploy while safe mode is active. */
export function PwaSafeModeBootstrap() {
  useEffect(() => {
    if (!isPwaSafeMode()) return
    void tearDownPwaClientState()
  }, [])

  return null
}
