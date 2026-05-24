"use client"

import { useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { isStandalonePwa } from "@/lib/android-install/device-detection"
import { readInstallState, markInstalled, writeInstallState } from "@/lib/android-install/storage"
import { fetchAppVersionCheck } from "@/lib/android-install/app-update-client"
import { NEXUS_NETWORK_RECONNECTED } from "@/lib/mobile/mobile-chrome-events"
import { gaEvent } from "@/lib/analytics/google-analytics"
import {
  isPwaInstallEnabled,
  isPwaOfflineRuntimeEnabled,
  isPwaResumeEnabled,
} from "@/lib/mobile/pwa-safe-mode"

/** Phase 3: standalone chrome + install persistence only; resume/offline layers gated separately. */
export function PwaRuntimeBootstrap() {
  const { refreshSession } = useAuth()

  useEffect(() => {
    if (!isPwaInstallEnabled()) return

    const html = document.documentElement
    if (isStandalonePwa()) {
      html.classList.add("nexus-pwa-standalone")
      gaEvent("pwa_standalone_session")
      const state = readInstallState()
      if (!state.installedVersion) {
        void fetchAppVersionCheck(null).then((check) => {
          if (check?.version) markInstalled("pwa", check.version)
        })
      }
    } else {
      html.classList.remove("nexus-pwa-standalone")
    }

    const onInstalled = () => {
      void fetchAppVersionCheck(null).then((check) => {
        markInstalled("pwa", check?.version ?? "pwa")
      })
      gaEvent("pwa_app_installed")
    }
    window.addEventListener("appinstalled", onInstalled)

    const onVisibility = () => {
      if (!isPwaResumeEnabled()) return
      if (document.visibilityState !== "visible") return
      void refreshSession()
      writeInstallState({ lastSeenReleaseVersion: readInstallState().installedVersion })
    }
    if (isPwaResumeEnabled()) {
      document.addEventListener("visibilitychange", onVisibility)
    }

    const onReconnect = () => {
      if (!isPwaOfflineRuntimeEnabled()) return
      void refreshSession()
    }
    if (isPwaOfflineRuntimeEnabled()) {
      window.addEventListener(NEXUS_NETWORK_RECONNECTED, onReconnect)
    }

    html.classList.add("nexus-pwa-ready")

    return () => {
      window.removeEventListener("appinstalled", onInstalled)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener(NEXUS_NETWORK_RECONNECTED, onReconnect)
    }
  }, [refreshSession])

  return null
}
