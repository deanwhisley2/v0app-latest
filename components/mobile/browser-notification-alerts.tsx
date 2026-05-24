"use client"

import { useEffect, useRef } from "react"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { showNativeAlertIfAllowed } from "@/lib/mobile/browser-notifications"

const ALERT_TYPES = new Set(["financial", "trade", "security"])

/** Native alerts for high-priority inbox items when the app is backgrounded. */
export function BrowserNotificationAlerts() {
  const { inbox } = useNexusNotifications()
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (typeof document === "undefined") return
    for (const item of inbox) {
      if (item.read || seenRef.current.has(item.id)) continue
      if (!ALERT_TYPES.has(item.type)) continue
      seenRef.current.add(item.id)
      showNativeAlertIfAllowed({
        title: item.title,
        body: item.message,
        tag: `nexus-${item.type}-${item.id}`,
      })
    }
  }, [inbox])

  return null
}
