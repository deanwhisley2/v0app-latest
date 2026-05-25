"use client"

import { useEffect } from "react"
import { useNexusBrowserPushAlerts } from "@/hooks/use-nexus-browser-push"
import { ensureNotificationPermission, isPushAlertsEnabled, setPushAlertsEnabled } from "@/lib/push/nexus-browser-push"

/** Mount once on dashboard — enables browser alerts when user opts in via settings. */
export function NexusPushAlertsBootstrap({
  operationalWorkspace = false,
}: {
  operationalWorkspace?: boolean
}) {
  useNexusBrowserPushAlerts({ operationalWorkspace })

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const asked = sessionStorage.getItem("nexus_push_prompted")
      if (asked || isPushAlertsEnabled()) return
      sessionStorage.setItem("nexus_push_prompted", "1")
      void ensureNotificationPermission().then((p) => {
        if (p === "granted") setPushAlertsEnabled(true)
      })
    } catch {
      /* ignore */
    }
  }, [])

  return null
}
