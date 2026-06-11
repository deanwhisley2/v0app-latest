import type { NexusNotificationItem } from "@/lib/nexus-notification-models"
import {
  rewriteNotificationAmountsForCorridor,
  type NotificationViewerCorridor,
} from "@/lib/customer-corridor-money"
import { sanitizeCustomerNotificationText } from "@/lib/notifications/customer-notification-language"
import {
  localizeStoredNotificationBody,
  localizeStoredNotificationTitle,
} from "@/lib/notifications/localize-stored-notification"

export type NotificationInboxCategory =
  | "security"
  | "funding"
  | "withdrawals"
  | "trading"
  | "support"
  | "system"

export type PresentedNotification = {
  title: string
  summary: string
  detail: string
  metaLine?: string
  category: NotificationInboxCategory
  categoryLabel: string
  profitGreen?: { displayAmount: string }
}

const LOGIN_RAW =
  /new\s+login|login\s+detected|sign[- ]?in\s+detected|account\s+access|session\s+from/i
const IP_PATTERN = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/
const UA_NOISE = /webkit|gecko|mozilla|version\/[\d.]+/gi

function maskIp(ip: string): string {
  const parts = ip.split(".")
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`
  return "Network"
}

function extractLoginMeta(raw: string): string | undefined {
  const ip = raw.match(IP_PATTERN)?.[1]
  let browser: string | undefined
  if (/edg\//i.test(raw)) browser = "Edge"
  else if (/chrome\//i.test(raw)) browser = "Chrome"
  else if (/firefox\//i.test(raw)) browser = "Firefox"
  else if (/safari\//i.test(raw) && !/chrome/i.test(raw)) browser = "Safari"

  const device = /mobile|android|iphone/i.test(raw) ? "Mobile" : /tablet|ipad/i.test(raw) ? "Tablet" : "Web"
  const bits = [device, browser, ip ? `IP ${maskIp(ip)}` : null].filter(Boolean) as string[]
  return bits.length ? bits.join(" · ") : undefined
}

export function isRawSecurityLoginCopy(title: string, message: string): boolean {
  const blob = `${title} ${message}`
  return LOGIN_RAW.test(blob) || (IP_PATTERN.test(blob) && /chrome|safari|firefox|webkit|edge/i.test(blob))
}

export function inferNotificationCategory(n: NexusNotificationItem): NotificationInboxCategory {
  const blob = `${n.title} ${n.message} ${n.detailText ?? ""}`.toLowerCase()
  if (n.type === "security" || isRawSecurityLoginCopy(n.title, n.message)) return "security"
  if (/support|thread|desk|escalat|assistant/.test(blob)) return "support"
  if (n.type === "financial") {
    if (/withdraw|payout|sent to|debit/.test(blob)) return "withdrawals"
    return "funding"
  }
  if (n.type === "trade" || n.type === "price" || n.type === "analysis") return "trading"
  return "system"
}

function categoryLabelKey(cat: NotificationInboxCategory): string {
  return `notifications.inbox.category.${cat}`
}

export function formatNotificationTimeAgo(iso: string, t?: (key: string) => string): string {
  const date = new Date(iso)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return t?.("notifications.time.now") ?? "Now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function applyCorridorAmountRewrite(
  text: string,
  n: NexusNotificationItem,
  viewer?: NotificationViewerCorridor,
): string {
  if (!viewer?.fundingCountryCode) return text
  return rewriteNotificationAmountsForCorridor(text, viewer, n.customerAmountUsd ?? null)
}

export function presentNotification(
  n: NexusNotificationItem,
  t: (key: string) => string,
  viewer?: NotificationViewerCorridor,
): PresentedNotification {
  const category = inferNotificationCategory(n)
  const categoryLabel = t(categoryLabelKey(category))
  const fallbackDetail = t("notifications.center.detailBalancePlain")
  const fallbackMsg = t("notifications.inbox.fallbackBody")

  if (isRawSecurityLoginCopy(n.title, n.message)) {
    const metaLine =
      extractLoginMeta(`${n.message} ${n.detailText ?? ""}`) ??
      t("notifications.inbox.securitySignInMetaDefault")
    return {
      category,
      categoryLabel,
      title: t("notifications.inbox.securitySignInTitle"),
      summary: t("notifications.inbox.securitySignInSummary"),
      detail: n.detailText
        ? sanitizeCustomerNotificationText(n.detailText, t("notifications.inbox.securitySignInDetail"))
        : t("notifications.inbox.securitySignInDetail"),
      metaLine,
    }
  }

  const title = applyCorridorAmountRewrite(
    localizeStoredNotificationTitle(sanitizeCustomerNotificationText(n.title, fallbackMsg), t),
    n,
    viewer,
  )
  let summary = applyCorridorAmountRewrite(
    localizeStoredNotificationBody(sanitizeCustomerNotificationText(n.message, fallbackMsg), t),
    n,
    viewer,
  )
  summary = summary.replace(UA_NOISE, "").replace(/\s{2,}/g, " ").trim()
  if (summary.length > 96) summary = `${summary.slice(0, 93)}…`

  const detail = applyCorridorAmountRewrite(
    localizeStoredNotificationBody(
      sanitizeCustomerNotificationText(n.detailText ?? n.message, fallbackDetail),
      t,
    ),
    n,
    viewer,
  )
  const metaLine = IP_PATTERN.test(n.message) ? extractLoginMeta(n.message) : undefined

  return {
    category,
    categoryLabel,
    title,
    summary,
    detail,
    metaLine,
    profitGreen: (n as { profitGreen?: { displayAmount: string } }).profitGreen,
  }
}
