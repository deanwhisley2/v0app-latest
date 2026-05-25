"use client"

import { useCallback, useEffect, useRef } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { useOperationalRealtime } from "@/hooks/use-operational-realtime"
import { storeUserInitiatedPendingNav } from "@/lib/dashboard-navigation-policy"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"
import { ensureNotificationPermission, isPushAlertsEnabled, showBrowserPushAlert } from "@/lib/push/nexus-browser-push"

/**
 * Lightweight alert channel: browser Notification API on realtime events (no aggressive polling).
 * Does not auto-navigate — click handler stores user-initiated pending nav only.
 */
export function useNexusBrowserPushAlerts(opts?: {
  operationalWorkspace?: boolean
  supportUnreadTick?: number
}) {
  const { user } = useAuth()
  const { inbox, unreadCount } = useNexusNotifications()
  const lastInboxIdRef = useRef<string | null>(null)
  const lastSupportPingRef = useRef(0)

  useEffect(() => {
    if (!user?.id || !isPushAlertsEnabled()) return
    void ensureNotificationPermission()
  }, [user?.id])

  useEffect(() => {
    if (!user?.id || !isPushAlertsEnabled()) return
    const latest = inbox.find((n) => !n.read)
    if (!latest || latest.id === lastInboxIdRef.current) return
    lastInboxIdRef.current = latest.id

    const nav = latest.nav as NexusNotificationNav | undefined
    showBrowserPushAlert({
      title: latest.title,
      body: latest.message,
      tag: `inbox:${latest.id}`,
      onClick: () => {
        if (nav?.kind === "support_thread") {
          storeUserInitiatedPendingNav(nav)
        }
      },
    })
  }, [inbox, user?.id, unreadCount])

  const onSupportThreads = useCallback(() => {
    if (!isPushAlertsEnabled()) return
    const now = Date.now()
    if (now - lastSupportPingRef.current < 8_000) return
    lastSupportPingRef.current = now

    if (opts?.operationalWorkspace) {
      showBrowserPushAlert({
        title: "Support inbox",
        body: "A customer thread was updated.",
        tag: "admin-support",
      })
    } else {
      showBrowserPushAlert({
        title: "Support update",
        body: "You have a new message from operations.",
        tag: "user-support",
      })
    }
  }, [opts?.operationalWorkspace])

  useOperationalRealtime({
    enabled: Boolean(user?.id) && isPushAlertsEnabled(),
    role: opts?.operationalWorkspace ? "admin" : "trading_user",
    userId: user?.id ?? null,
    onSupportThreads,
    onSupportMessages: onSupportThreads,
  })
}
