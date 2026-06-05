/** Canonical register / verify email delivery states — never claim "sent" unless status is `sent`. */

export type VerificationEmailStatus = "sent" | "delivery_pending" | "generation_failed"

export function isVerificationEmailSent(status: VerificationEmailStatus | undefined): boolean {
  return status === "sent"
}

export function verificationEmailNeedsRetry(status: VerificationEmailStatus | undefined): boolean {
  return status === "delivery_pending" || status === "generation_failed"
}

/** Map legacy deferred flag to status when new field is absent. */
export function resolveVerificationEmailStatus(input: {
  verification_email_status?: VerificationEmailStatus
  email_delivery_deferred?: boolean
}): VerificationEmailStatus {
  if (input.verification_email_status) return input.verification_email_status
  if (input.email_delivery_deferred) return "delivery_pending"
  return "sent"
}
