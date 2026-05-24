"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import {
  canTriggerNativePwaInstall,
  getPwaInstallDiagnostic,
  initPwaInstallController,
  subscribePwaInstall,
} from "@/lib/android-install/pwa-install-controller"
import { isPwaInstallEnabled } from "@/lib/mobile/pwa-safe-mode"

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
  const installEnabled = isPwaInstallEnabled()
  const [probeSettled, setProbeSettled] = useState(false)

  useEffect(() => {
    if (!installEnabled) {
      setProbeSettled(true)
      return
    }
    initPwaInstallController()
    const t = window.setTimeout(() => setProbeSettled(true), 2800)
    return () => window.clearTimeout(t)
  }, [installEnabled])

  const canNativeInstall = useSyncExternalStore(
    subscribePwaInstall,
    () => (installEnabled ? canTriggerNativePwaInstall() : false),
    () => false,
  )

  const diagnostic = useSyncExternalStore(
    subscribePwaInstall,
    () => (installEnabled ? getPwaInstallDiagnostic() : getServerDiagnostic()),
    getServerDiagnostic,
  )

  return { canNativeInstall, diagnostic, probeSettled }
}
