"use client"

import { Check, Clock, Mail, RefreshCw } from "lucide-react"
import { VerificationCodeSentPanel } from "@/components/auth/verification-code-sent-panel"
import type { VerificationEmailStatus } from "@/lib/auth/verification-email-status"
import { cn } from "@/lib/utils"

type Props = {
  status: VerificationEmailStatus
  email: string
  secondsLeft?: number
  canResend?: boolean
  className?: string
}

export function VerificationEmailStatusPanel({
  status,
  email,
  secondsLeft = 0,
  canResend = true,
  className,
}: Props) {
  if (status === "sent") {
    return (
      <VerificationCodeSentPanel
        email={email}
        secondsLeft={secondsLeft}
        canResend={canResend}
        className={className}
      />
    )
  }

  if (status === "delivery_pending") {
    return (
      <div
        className={cn(
          "rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-center",
          className,
        )}
        role="status"
      >
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-foreground">
          <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          Your verification email is on its way.
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Please allow up to 2 minutes.</p>
        <p className="mt-3 text-xs text-muted-foreground">Sending to:</p>
        <p className="mt-1 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
          <Mail className="h-4 w-4 shrink-0" aria-hidden />
          <a href={`mailto:${email}`} className="truncate underline-offset-4 hover:underline">
            {email}
          </a>
        </p>
        {!canResend && secondsLeft > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Resend available in {secondsLeft} seconds.</p>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-amber-500/35 bg-amber-500/[0.08] px-4 py-4 text-center",
        className,
      )}
      role="status"
    >
      <div className="flex items-center justify-center gap-2 text-sm font-medium text-foreground">
        <RefreshCw className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        We couldn&apos;t prepare your verification code yet.
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Please try resend in a moment. Delivery may take several minutes when it succeeds.
      </p>
      <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        Your account is saved — use resend below when ready.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">Email address:</p>
      <p className="mt-1 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
        <Mail className="h-4 w-4 shrink-0" aria-hidden />
        {email}
      </p>
    </div>
  )
}
