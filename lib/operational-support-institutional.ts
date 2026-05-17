/** Approved institutional customer-facing thread statuses (short, automated). */
export const OPERATIONAL_THREAD_STATUS_LABEL: Record<string, string> = {
  open: "Under review",
  pending_admin: "Under review",
  awaiting_response: "Awaiting response",
  processing: "Processing",
  answered: "Reply received",
  resolved: "Resolved",
  closed: "Closed",
}

export function operationalThreadStatusLabel(status: string, escalated?: boolean): string {
  if (escalated && (status === "open" || status === "pending_admin")) return "Escalated"
  return OPERATIONAL_THREAD_STATUS_LABEL[status] ?? "Under review"
}

export const OPERATIONAL_THREAD_CATEGORY_LABEL: Record<string, string> = {
  general: "Support",
  funding_dispute: "Funding",
  withdrawal_dispute: "Withdrawal",
  appeal: "Appeal",
  security: "Security",
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

export const UNRESOLVED_THREAD_STATUSES = [
  "open",
  "pending_admin",
  "awaiting_response",
  "processing",
  "answered",
] as const
