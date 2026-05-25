import type { NexusNotificationItem } from "@/lib/nexus-notification-models"
import { inferNotificationCategory } from "@/lib/notifications/notification-inbox-presenter"

/** Server `notification_type` when mapped from account notifications. */
export type AccountNotificationType = string | undefined

function blob(n: NexusNotificationItem): string {
  return `${n.title} ${n.message} ${n.detailText ?? ""}`.toLowerCase()
}

/** Permanent ledger-style notices — bottom History tab only. */
export function isTransactionHistoryNotification(
  n: NexusNotificationItem,
  accountType?: AccountNotificationType,
): boolean {
  const t = (accountType ?? "").toLowerCase()
  if (t === "crypto_deposit_credited") return true
  if (t.startsWith("funding") && /approved|credited|completed|added to your balance/i.test(blob(n))) {
    return true
  }
  if (t.includes("withdrawal") && /approved|completed|sent|processed/i.test(blob(n))) {
    return true
  }
  if (n.type === "trade") return true
  if (n.type === "financial") {
    if (/credited|approved|completed|successfully added|funds added|deposit confirmed|balance updated/i.test(blob(n))) {
      return true
    }
    if (/rejected|failed|declined/i.test(blob(n))) return false
  }
  return false
}

/** Header bell — security, payout status, pending ops, promos; never chat duplicates or settled ledger. */
export function isOperationalAlertNotification(
  n: NexusNotificationItem,
  accountType?: AccountNotificationType,
): boolean {
  if (isTransactionHistoryNotification(n, accountType)) return false
  const cat = inferNotificationCategory(n)
  if (cat === "support") return false
  if (cat === "trading" && n.type === "trade") return false
  return true
}

export function filterOperationalAlerts(
  items: NexusNotificationItem[],
  accountTypes?: Map<string, string>,
): NexusNotificationItem[] {
  return items.filter((n) => isOperationalAlertNotification(n, accountTypes?.get(n.id)))
}

export function filterTransactionHistoryFromInbox(
  items: NexusNotificationItem[],
  accountTypes?: Map<string, string>,
): NexusNotificationItem[] {
  return items.filter((n) => isTransactionHistoryNotification(n, accountTypes?.get(n.id)))
}
