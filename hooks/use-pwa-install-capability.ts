"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import {
  canTriggerNativePwaInstall,
  getPwaInstallDiagnostic,
  initPwaInstallController,
  subscribePwaInstall,
} from "@/lib/android-install/pwa-install-controller"

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
  const [probeSettled, setProbeSettled] = useState(false)

  useEffect(() => {
    initPwaInstallController()
    const t = window.setTimeout(() => setProbeSettled(true), 2800)
    return () => window.clearTimeout(t)
  }, [])

  const canNativeInstall = useSyncExternalStore(
    subscribePwaInstall,
    canTriggerNativePwaInstall,
    () => false,
  )

  const diagnostic = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallDiagnostic,
    getServerDiagnostic,
  )

  return { canNativeInstall, diagnostic, probeSettled }
}
