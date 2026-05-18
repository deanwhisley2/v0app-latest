"use client"

import { useMemo } from "react"
import type { NexusNotificationItem } from "@/lib/nexus-notification-models"
import { inboxSignature } from "@/lib/nexus-notifications-merge"
import {
  presentNotification,
  type PresentedNotification,
} from "@/lib/notifications/notification-inbox-presenter"
import type { InboxFilter } from "@/components/dashboard/notification-inbox-ui"

export function usePresentedNotifications(
  items: NexusNotificationItem[],
  t: (key: string) => string
): Map<string, PresentedNotification> {
  const sig = inboxSignature(items)
  return useMemo(() => {
    const map = new Map<string, PresentedNotification>()
    for (const n of items) map.set(n.id, presentNotification(n, t))
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable when inbox content unchanged
  }, [sig, t])
}

export function filterInboxNotifications(
  items: NexusNotificationItem[],
  filter: InboxFilter,
  search: string,
  presented: Map<string, PresentedNotification>
): NexusNotificationItem[] {
  const q = search.trim().toLowerCase()
  return items.filter((n) => {
    if (filter === "unread" && n.read) return false
    if (filter === "read" && !n.read) return false
    if (!q) return true
    const p = presented.get(n.id)
    if (!p) return false
    return (
      p.title.toLowerCase().includes(q) ||
      p.summary.toLowerCase().includes(q) ||
      p.categoryLabel.toLowerCase().includes(q)
    )
  })
}
