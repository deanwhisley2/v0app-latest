import type { IssueVerificationResult } from "@/lib/email-verification-issue"
import { issueEmailVerificationCodeForUser } from "@/lib/email-verification-issue"
import {
  logAuthEmailDeliveryEvent,
  type AuthEmailDeliveryLogInput,
} from "@/lib/server/auth-email-delivery-log"

export type RegisterEmailVerificationAttempt = {
  sent: boolean
  deferred: boolean
  error?: string
}

type RegisterEmailContext = {
  userId: string
  emailRaw: string
  ipAddress?: string | null
  userAgent?: string | null
}

/**
 * Registration verification send — uses user id directly (not email lookup).
 * Never blocks account creation; logs sent/deferred/failed for monitoring.
 */
export async function attemptRegisterEmailVerification(
  ctx: RegisterEmailContext,
): Promise<RegisterEmailVerificationAttempt> {
  const issued: IssueVerificationResult = await issueEmailVerificationCodeForUser(
    ctx.userId,
    ctx.emailRaw,
  )

  const baseLog: Omit<AuthEmailDeliveryLogInput, "outcome"> = {
    channel: "register",
    email: ctx.emailRaw,
    userId: ctx.userId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  }

  if (issued.ok && issued.ambiguous !== true) {
    await logAuthEmailDeliveryEvent({ ...baseLog, outcome: "sent" })
    return { sent: true, deferred: false }
  }

  const error = !issued.ok
    ? issued.error
    : "Verification user lookup failed immediately after registration"

  await logAuthEmailDeliveryEvent({
    ...baseLog,
    outcome: issued.ok ? "skipped" : "deferred",
    errorMessage: error,
  })

  console.warn("[register] verification email deferred:", error, {
    userId: ctx.userId,
    email: ctx.emailRaw,
  })

  return {
    sent: false,
    deferred: true,
    error,
  }
}
