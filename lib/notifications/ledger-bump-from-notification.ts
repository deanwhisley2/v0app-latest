import type { NexusNotificationItem } from "@/lib/nexus-notification-models"

/** True when a server/account notification should refresh wallet + History. */
export function shouldCustomerLedgerBumpFromNotification(n: NexusNotificationItem): boolean {
  if (n.type === "financial") return true
  const t = (n.accountNotificationType ?? "").toLowerCase()
  if (t.includes("funding") || t.includes("withdrawal") || t.includes("deposit")) return true
  if (t === "l5_funding_settled" || t.includes("l5_funding")) return true
  if (t === "crypto_deposit_credited") return true
  return false
}
