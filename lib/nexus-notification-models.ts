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
  /** If set, render amount as +{displayAmount} in green */
  profitGreen?: { displayAmount: string }
  /** Optional friendlier explanation for the detail screen (falls back to `message`). */
  detailText?: string
  timestamp: string
  read: boolean
  /** Server-backed: user moved row to Archived (bell). */
  archived?: boolean
  nav?: NexusNotificationNav
  analysis?: AnalysisNotificationPayload
  /** USD ledger hint for corridor-safe amount rewrite in the inbox (never show foreign corridor tickers). */
  customerAmountUsd?: number
  /** Raw server notification_type for inbox routing (alerts vs history). */
  accountNotificationType?: string
  /** Server source_kind — links financial alerts to withdrawal/deposit rows for receipts. */
  receiptSourceKind?: string
  /** Server source_id — withdrawal request id, deposit id, etc. */
  receiptSourceId?: string
}
