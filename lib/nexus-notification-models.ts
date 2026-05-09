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
  timestamp: string
  read: boolean
  nav?: NexusNotificationNav
  analysis?: AnalysisNotificationPayload
}
