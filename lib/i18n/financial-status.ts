/**
 * Canonical customer-facing status vocabulary (English).
 * Use these keys via `t('status.*')` — do not invent alternate labels per screen.
 */

export const financialStatusEn: Record<string, string> = {
  // Success
  "status.approved": "Approved",
  "status.completed": "Completed",
  "status.credited": "Credited",
  "status.released": "Released",
  "status.confirmed": "Confirmed",
  "status.active": "Active",
  "status.verified": "Verified",

  // Pending
  "status.pending": "Pending",
  "status.processing": "Processing",
  "status.underReview": "Under review",
  "status.awaitingConfirmation": "Awaiting confirmation",
  "status.scheduled": "Scheduled",

  // Error / terminal negative
  "status.failed": "Failed",
  "status.expired": "Expired",
  "status.unavailable": "Unavailable",
  "status.rejected": "Rejected",
  "status.verificationRequired": "Verification required",

  // Actions / system (toasts, errors)
  "status.requestFailed": "Request failed",
  "status.sessionExpired": "Session expired",
  "status.retry": "Retry required",
  "status.contactSupport": "Contact support",
}
