import { mapCustomerNotification } from "@/lib/notifications/notification-mapper"
import { isInternalNotificationCopy, sanitizeCustomerNotificationText } from "@/lib/notifications/customer-notification-language"

export type PresentedFinancialEvent = {
  title: string
  detailLine: string
}

const CATEGORY_LABEL: Record<string, string> = {
  funding: "Deposit",
  trade: "Trading",
  container: "Trading",
  internal_transfer: "Balance",
  cashout: "Withdrawal",
  admin: "Account",
  system: "Account",
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Confirmed",
  completed: "Completed",
  rejected: "Declined",
  blocked: "Blocked",
}

function formatUsd(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return ""
  return `$${Number(amount).toFixed(2)}`
}

/**
 * Customer-safe copy for History → Activity rows (container_balance_events.summary).
 */
export function presentFinancialEventForCustomer(row: {
  summary: string | null
  event_type: string
  category: string
  status: string
  gross_amount: number | null
}): PresentedFinancialEvent {
  const fallback = "Account activity recorded."
  const rawSummary = (row.summary ?? "").trim()
  const syntheticType = `${row.category}_${row.event_type}`.toLowerCase()

  const mapped = mapCustomerNotification({
    notificationType: syntheticType,
    title: rawSummary,
    body: rawSummary,
    metadata: {
      amount_usd: row.gross_amount,
      settled_amount_usd: row.gross_amount,
    },
  })

  const title = sanitizeCustomerNotificationText(mapped?.title ?? rawSummary, fallback)
  const body = sanitizeCustomerNotificationText(mapped?.body ?? "", "")

  const cat = CATEGORY_LABEL[row.category] ?? "Activity"
  const status = STATUS_LABEL[row.status] ?? row.status.replace(/_/g, " ")
  const amt = formatUsd(row.gross_amount)
  const detailParts = [cat, status, amt].filter(Boolean)

  const safeTitle = sanitizeCustomerNotificationText(title, fallback)
  const safeBody = body && !isInternalNotificationCopy(body) ? body : ""

  return {
    title: safeBody.length > 12 ? safeBody : safeTitle,
    detailLine: detailParts.join(" · "),
  }
}
