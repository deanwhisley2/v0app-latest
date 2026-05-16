/** Institutional customer-facing labels for operational_support_threads.status */
export const OPERATIONAL_THREAD_STATUS_LABEL: Record<string, string> = {
  open: "Under review",
  pending_admin: "Under review",
  answered: "Reply received",
  resolved: "Resolved",
  closed: "Resolved",
}

export function operationalThreadStatusLabel(status: string): string {
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
}

export function operationalThreadCategoryLabel(category: string): string {
  return OPERATIONAL_THREAD_CATEGORY_LABEL[category] ?? "Support"
}
