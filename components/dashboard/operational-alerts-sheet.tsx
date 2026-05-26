"use client"

import { NotificationsPanel } from "@/components/notifications/notifications-panel"
import type { NexusNotificationItem } from "@/lib/nexus-notification-models"

type Props = {
  isOpen: boolean
  onClose: () => void
  onNavigate?: (nav: NexusNotificationItem["nav"]) => void
}

/** Header bell — operational alerts only (GPU-safe panel). */
export function OperationalAlertsSheet(props: Props) {
  return <NotificationsPanel {...props} />
}
