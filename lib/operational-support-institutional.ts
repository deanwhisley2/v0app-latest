/** Institutional support thread statuses and customer-facing presentation. */

export const INSTITUTIONAL_THREAD_STATUSES = [
  "open",
  "pending_user",
  "pending_admin",
  "under_review",
  "resolved",
  "closed",
] as const

export type InstitutionalThreadStatus = (typeof INSTITUTIONAL_THREAD_STATUSES)[number]

/** Map legacy DB values to canonical lifecycle (post-migration most are 1:1). */
export function normalizeThreadStatus(raw: string): InstitutionalThreadStatus {
  const s = raw.trim().toLowerCase()
  if (s === "awaiting_response" || s === "answered") return "pending_user"
  if (s === "processing") return "under_review"
  if ((INSTITUTIONAL_THREAD_STATUSES as readonly string[]).includes(s)) return s as InstitutionalThreadStatus
  if (s === "pending_admin") return "pending_admin"
  return "open"
}

export const OPERATIONAL_THREAD_STATUS_LABEL: Record<InstitutionalThreadStatus, string> = {
  open: "Open",
  pending_user: "Awaiting you",
  pending_admin: "Awaiting team",
  under_review: "Under review",
  resolved: "Resolved",
  closed: "Closed",
}

export type StatusChipTone = "neutral" | "amber" | "blue" | "violet" | "green" | "slate" | "rose"

export function operationalThreadStatusLabel(status: string, escalated?: boolean): string {
  const norm = normalizeThreadStatus(status)
  if (escalated && norm !== "resolved" && norm !== "closed") return "Escalated"
  return OPERATIONAL_THREAD_STATUS_LABEL[norm] ?? "Open"
}

export function operationalThreadStatusTone(status: string, escalated?: boolean): StatusChipTone {
  const norm = normalizeThreadStatus(status)
  if (escalated && norm !== "resolved" && norm !== "closed") return "rose"
  switch (norm) {
    case "open":
      return "blue"
    case "pending_user":
      return "amber"
    case "pending_admin":
      return "violet"
    case "under_review":
      return "blue"
    case "resolved":
      return "green"
    case "closed":
      return "slate"
    default:
      return "neutral"
  }
}

export const STATUS_CHIP_CLASS: Record<StatusChipTone, string> = {
  neutral: "border-border/60 bg-muted/40 text-muted-foreground",
  amber: "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  blue: "border-sky-500/35 bg-sky-500/10 text-sky-900 dark:text-sky-100",
  violet: "border-violet-500/35 bg-violet-500/10 text-violet-900 dark:text-violet-100",
  green: "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
  slate: "border-border/50 bg-muted/30 text-muted-foreground",
  rose: "border-rose-500/35 bg-rose-500/10 text-rose-900 dark:text-rose-100",
}

export const OPERATIONAL_THREAD_CATEGORY_LABEL: Record<string, string> = {
  general: "Support",
  funding_dispute: "Funding",
  withdrawal_dispute: "Withdrawal",
  appeal: "Appeal",
  security: "Security",
  security_update: "Security appeal",
  retailer: "Retailer",
  crypto_dispute: "Crypto deposit",
  assistant_escalation: "Escalated",
  transaction_review: "Transaction review",
  operational_complaint: "Complaint",
  payout_dispute: "Payout",
  stuck_trade: "Trade",
  settlement_failure: "Settlement",
  locked_balance: "Balance",
  verification_complaint: "Verification",
}

export function operationalThreadCategoryLabel(category: string): string {
  return OPERATIONAL_THREAD_CATEGORY_LABEL[category] ?? "Support"
}

export const UNRESOLVED_THREAD_STATUSES: InstitutionalThreadStatus[] = [
  "open",
  "pending_user",
  "pending_admin",
  "under_review",
]

export function senderRoleLabel(role: string): string {
  if (role === "admin") return "Operations"
  if (role === "system") return "System"
  return "You"
}
