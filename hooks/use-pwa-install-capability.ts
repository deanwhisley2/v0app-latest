"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import {
  canTriggerNativePwaInstall,
  getPwaInstallDiagnostic,
  initPwaInstallController,
  subscribePwaInstall,
} from "@/lib/android-install/pwa-install-controller"
import { isPwaSafeMode } from "@/lib/mobile/pwa-safe-mode"

function getServerDiagnostic() {
  return {
    hasDeferredPrompt: false,
    bipEverReceived: false,
    promptConsumed: false,
    serviceWorkerReady: false,
    serviceWorkerControlling: false,
    isStandalone: false,
    manifestOk: null,
    lastPromptError: null,
    installable: false,
  }
}

/**
 * Subscribes to global PWA install state (deferred prompt + service worker readiness).
 */
export function usePwaInstallCapability() {
  const safeMode = isPwaSafeMode()
  const [probeSettled, setProbeSettled] = useState(false)

  useEffect(() => {
    if (safeMode) {
      setProbeSettled(true)
      return
    }
    initPwaInstallController()
    const t = window.setTimeout(() => setProbeSettled(true), 2800)
    return () => window.clearTimeout(t)
  }, [safeMode])

  const canNativeInstall = useSyncExternalStore(
    subscribePwaInstall,
    () => (safeMode ? false : canTriggerNativePwaInstall()),
    () => false,
  )

  const diagnostic = useSyncExternalStore(
    subscribePwaInstall,
    () => (safeMode ? getServerDiagnostic() : getPwaInstallDiagnostic()),
    getServerDiagnostic,
  )

  return { canNativeInstall, diagnostic, probeSettled }
}
