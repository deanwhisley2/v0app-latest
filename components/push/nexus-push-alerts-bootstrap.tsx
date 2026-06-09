"use client"

import { useEffect } from "react"
import { useNexusBrowserPushAlerts } from "@/hooks/use-nexus-browser-push"
import { isPwaSafeMode } from "@/lib/mobile/pwa-safe-mode"
import { subscribeNexusWebPush } from "@/lib/mobile/pwa-sw-registration"
import { ensureNotificationPermission, isPushAlertsEnabled, setPushAlertsEnabled } from "@/lib/push/nexus-browser-push"
import { supabase } from "@/lib/supabaseClient"

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
      void ensureNotificationPermission().then(async (p) => {
        if (p !== "granted") return
        setPushAlertsEnabled(true)
        if (isPwaSafeMode()) return
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession()
          const token = session?.access_token
          if (token) await subscribeNexusWebPush(token, operationalWorkspace ? "admin" : "customer")
        } catch {
          /* push optional */
        }
      })
    } catch {
      /* ignore */
    }
  }, [operationalWorkspace])

  return null
}
