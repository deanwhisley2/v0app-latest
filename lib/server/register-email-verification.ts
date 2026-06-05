import type { VerificationEmailStatus } from "@/lib/auth/verification-email-status"
import type { IssueVerificationResult } from "@/lib/email-verification-issue"
import { issueEmailVerificationCodeForUser } from "@/lib/email-verification-issue"
import {
  logAuthEmailDeliveryEvent,
  type AuthEmailDeliveryLogInput,
} from "@/lib/server/auth-email-delivery-log"

export type RegisterEmailVerificationAttempt = {
  status: VerificationEmailStatus
  error?: string
}

type RegisterEmailContext = {
  userId: string
  emailRaw: string
  ipAddress?: string | null
  userAgent?: string | null
}

/**
 * Registration verification — create code (step 2) then send email (step 3).
 * Never blocks account creation; returns explicit status so UI never claims "sent" falsely.
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
    return { status: "sent" }
  }

  if (!issued.ok && issued.status === 502) {
    await logAuthEmailDeliveryEvent({
      ...baseLog,
      outcome: "deferred",
      errorMessage: issued.error,
    })
    console.error("[register] verification email delivery failed:", issued.error, {
      userId: ctx.userId,
      email: ctx.emailRaw,
    })
    return { status: "delivery_pending", error: issued.error }
  }

  const error = !issued.ok
    ? issued.error
    : "Verification user lookup failed immediately after registration"

  await logAuthEmailDeliveryEvent({
    ...baseLog,
    outcome: "failed",
    errorMessage: error,
  })

  console.error("[register] verification code generation failed:", error, {
    userId: ctx.userId,
    email: ctx.emailRaw,
  })

  return { status: "generation_failed", error }
}
