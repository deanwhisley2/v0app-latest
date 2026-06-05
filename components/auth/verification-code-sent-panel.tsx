"use client"

import { Check, Mail } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  email: string
  secondsLeft?: number
  canResend?: boolean
  className?: string
}

export function VerificationCodeSentPanel({
  email,
  secondsLeft = 0,
  canResend = true,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-4",
        className,
      )}
      role="status"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
        Verification email sent
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Most emails arrive within 1 minute. Some providers may take up to 5 minutes.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">Sent to:</p>
      <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-primary">
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
