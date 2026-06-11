import { formatUsdForCustomerDisplay, buildCustomerMoneyContext } from "@/lib/customer-facing-money"
import { fixedTradeActivityTitle } from "@/lib/notifications/fixed-trade-activity-labels"
import { mapCustomerNotification } from "@/lib/notifications/notification-mapper"
import { isInternalNotificationCopy, sanitizeCustomerNotificationText } from "@/lib/notifications/customer-notification-language"
import type { NotificationViewerCorridor } from "@/lib/customer-corridor-money"

export type PresentedFinancialEvent = {
  title: string
  detailLine: string
  profitGreen?: { displayAmount: string }
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

function formatActivityAmount(
  amount: number | null,
  viewer?: NotificationViewerCorridor,
): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return ""
  if (!viewer?.fundingCountryCode && !viewer?.displayCurrency) return ""
  const ctx = buildCustomerMoneyContext({
    fundingCountryCode: viewer.fundingCountryCode ?? null,
    preferredCurrency: viewer.displayCurrency ?? null,
    language: viewer.language,
  })
  return formatUsdForCustomerDisplay(amount, ctx)
}

/**
 * Customer-safe copy for History → Activity rows (container_balance_events.summary).
 */
export function presentFinancialEventForCustomer(
  row: {
    summary: string | null
    event_type: string
    category: string
    status: string
    gross_amount: number | null
  },
  viewer?: NotificationViewerCorridor,
): PresentedFinancialEvent {
  const fallback = "Account activity recorded."
  const rawSummary = (row.summary ?? "").trim()
  const eventType = String(row.event_type ?? "").toLowerCase()
  const syntheticType = `${row.category}_${row.event_type}`.toLowerCase()
  const fixedTitle = fixedTradeActivityTitle(row.event_type)
  const cat = CATEGORY_LABEL[row.category] ?? "Activity"
  const amt = formatActivityAmount(row.gross_amount, viewer)

  if (eventType === "withdrawal_rejected_refund") {
    return {
      title: "Withdrawal Declined",
      detailLine: [cat, "Failed & Refunded", amt].filter(Boolean).join(" · "),
    }
  }
  if (eventType === "withdrawal_pending") {
    return {
      title: "Withdrawal Pending",
      detailLine: [cat, "Pending", amt].filter(Boolean).join(" · "),
    }
  }

  const status = STATUS_LABEL[row.status] ?? row.status.replace(/_/g, " ")
  const detailParts = [cat, status, amt].filter(Boolean)

  if (fixedTitle) {
    return { title: fixedTitle, detailLine: detailParts.join(" · ") }
  }

  const mapped = mapCustomerNotification({
    notificationType: syntheticType,
    title: rawSummary,
    body: rawSummary,
    metadata: {
      amount_usd: row.gross_amount,
      settled_amount_usd: row.gross_amount,
    },
    viewer: viewer
      ? {
          fundingCountryCode: viewer.fundingCountryCode ?? null,
          preferredCurrency: viewer.displayCurrency ?? null,
          locale: viewer.locale,
          language: viewer.language,
        }
      : undefined,
  })

  const safeTitle = sanitizeCustomerNotificationText(mapped?.title ?? rawSummary, fallback)
  const isEarnings = /earnings credited/i.test(safeTitle)
  const displayAmt = isEarnings && amt ? `+${amt}` : amt

  return {
    title: safeTitle,
    detailLine: [cat, status, displayAmt].filter(Boolean).join(" · "),
    profitGreen: isEarnings ? { displayAmount: amt } : undefined,
  }
}
