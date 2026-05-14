import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"

export type NexusNotificationType =
  | "price"
  | "trade"
  | "security"
  | "promo"
  | "system"
  | "analysis"
  | "financial"

export type AnalysisNotificationPayload = {
  analysisId: string
  symbol: string
  action: "BUY" | "SELL" | "HOLD"
  confidence: number
  timestamp: string
}

export type NexusNotificationItem = {
  id: string
  type: NexusNotificationType
  title: string
  message: string
  /** Optional friendlier explanation for the detail screen (falls back to `message`). */
  detailText?: string
  timestamp: string
  read: boolean
  /** Server-backed: user moved row to Archived (bell). */
  archived?: boolean
  nav?: NexusNotificationNav
  analysis?: AnalysisNotificationPayload
}
