import type { IssueVerificationResult } from "@/lib/email-verification-issue"
import { issueEmailVerificationCode } from "@/lib/email-verification-issue"

export type RegisterEmailVerificationAttempt = {
  /** True when a code was stored and send was attempted successfully. */
  sent: boolean
  /** True when signup must continue without blocking on provider failure. */
  deferred: boolean
  error?: string
}

/**
 * Attempt verification email send during registration.
 * Never blocks account creation — deferred=true when provider/DNS rejects delivery.
 */
export async function attemptRegisterEmailVerification(
  emailRaw: string,
): Promise<RegisterEmailVerificationAttempt> {
  const issued: IssueVerificationResult = await issueEmailVerificationCode(emailRaw)
  if (issued.ok) {
    return { sent: true, deferred: false }
  }
  console.warn("[register] verification email deferred:", issued.error)
  return {
    sent: false,
    deferred: true,
    error: issued.error,
  }
}
