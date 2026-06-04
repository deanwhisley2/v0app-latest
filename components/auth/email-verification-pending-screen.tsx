"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { Check, Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { EmailSentSuccessDialog } from "@/components/auth/email-sent-success-dialog"
import { useVerificationResendCooldown } from "@/hooks/use-verification-resend-cooldown"
import {
  clearPendingEmailVerification,
  getPendingEmailVerification,
  patchPendingEmailVerification,
  setPendingEmailVerification,
} from "@/lib/auth/pending-email-verification"

type ViewMode = "landing" | "enter-code"

type Props = {
  initialEmail?: string
  initialMode?: ViewMode
}

const FOLDER_CHECKS = ["Inbox", "Spam/Junk", "Promotions", "Updates"] as const

export function EmailVerificationPendingScreen({
  initialEmail = "",
  initialMode = "landing",
}: Props) {
  const [email, setEmail] = useState(initialEmail)
  const [viewMode, setViewMode] = useState<ViewMode>(initialMode)
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [infoMsg, setInfoMsg] = useState("")
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [emailSentDialogOpen, setEmailSentDialogOpen] = useState(false)
  const otpWrapRef = useRef<HTMLDivElement>(null)

  const { secondsLeft, canResend, markSent, applyServerRetryAfter } = useVerificationResendCooldown()

  const hydrateFromStorage = useCallback(() => {
    const pending = getPendingEmailVerification()
    if (pending?.email) setEmail(pending.email)
    if (pending?.enter_code_mode) setViewMode("enter-code")
  }, [])

  useEffect(() => {
    const resolved = initialEmail.trim() || getPendingEmailVerification()?.email || ""
    if (resolved) {
      setEmail(resolved)
      const pending = getPendingEmailVerification()
      setPendingEmailVerification({
        email: resolved,
        funding_country_code: pending?.funding_country_code,
        last_resend_at: pending?.last_resend_at,
        enter_code_mode: pending?.enter_code_mode ?? initialMode === "enter-code",
        created_at: pending?.created_at,
      })
    }
    hydrateFromStorage()
  }, [initialEmail, initialMode, hydrateFromStorage])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") hydrateFromStorage()
    }
    const onPageShow = () => hydrateFromStorage()
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("pageshow", onPageShow)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [hydrateFromStorage])

  useEffect(() => {
    if (viewMode !== "enter-code") return
    patchPendingEmailVerification({ enter_code_mode: true })
    const t = window.setTimeout(() => {
      const first = otpWrapRef.current?.querySelector("input")
      first?.focus()
    }, 80)
    return () => window.clearTimeout(t)
  }, [viewMode])

  const openEnterCode = () => {
    setViewMode("enter-code")
    patchPendingEmailVerification({ enter_code_mode: true })
    setError("")
    setInfoMsg("")
  }

  const handleChangeEmail = () => {
    clearPendingEmailVerification()
    window.location.href = "/auth/register"
  }

  const handleResend = async () => {
    if (!email || !canResend) return
    setResendLoading(true)
    setError("")
    setInfoMsg("")
    try {
      let fundingCountry = getPendingEmailVerification()?.funding_country_code ?? ""
      if (!fundingCountry) {
        try {
          fundingCountry = sessionStorage.getItem("nexus_pending_verify_country")?.trim() ?? ""
        } catch {
          /* ignore */
        }
      }
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          ...(fundingCountry ? { funding_country_code: fundingCountry } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
        retryAfterSeconds?: number
      }
      if (!res.ok) {
        if (res.status === 429 && data.retryAfterSeconds) {
          applyServerRetryAfter(data.retryAfterSeconds)
        }
        setError(data.error ?? "Failed to resend code.")
        return
      }
      markSent()
      setInfoMsg(data.message ?? "New code sent! Check your email.")
      setEmailSentDialogOpen(true)
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setResendLoading(false)
    }
  }

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault()
    const digits = code.replace(/\D/g, "").slice(0, 6)
    if (!email || digits.length !== 6) return

    setLoading(true)
    setError("")
    setInfoMsg("")

    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: digits }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
        session?: boolean
      }

      if (!res.ok) {
        setError(data.error ?? "Invalid or expired code")
        setLoading(false)
        return
      }

      clearPendingEmailVerification()
      window.location.replace("/dashboard")
    } catch {
      setError("Network error. Please try again.")
      setLoading(false)
    }
  }

  if (!email) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        <img src="/logo.jpg" alt="Nexus Pro" className="mx-auto mb-3 h-16 w-16 rounded-xl" />
        <h1 className="text-xl font-semibold text-foreground">Missing email address</h1>
        <p className="mt-3 text-muted-foreground">
          Start registration again — we will keep your verification step after you submit.
        </p>
        <Button asChild className="mt-6 min-h-11 w-full">
          <Link href="/auth/register">Go to registration</Link>
        </Button>
      </div>
    )
  }

  if (viewMode === "landing") {
    return (
      <>
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl">
          <div className="text-center">
            <img src="/logo.jpg" alt="Nexus Pro" className="mx-auto mb-3 h-16 w-16 rounded-xl" />
            <h1 className="text-2xl font-semibold text-foreground">Account created successfully</h1>
            <p className="mt-1 text-xs text-muted-foreground">One more step — verify your email</p>
          </div>

          <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-center">
            <p className="text-sm text-muted-foreground">We have sent a verification code to:</p>
            <p className="mt-1 flex items-center justify-center gap-2 text-base font-semibold text-primary">
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              {email}
            </p>
          </div>

          <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <p className="text-sm font-medium text-foreground">Please check:</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {FOLDER_CHECKS.map((label) => (
                <li key={label} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {infoMsg ? (
            <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-sm text-primary">
              {infoMsg}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button type="button" className="min-h-12 w-full font-semibold" onClick={openEnterCode}>
              Enter verification code
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              disabled={resendLoading || !canResend}
              onClick={() => void handleResend()}
            >
              {resendLoading ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
                  Sending…
                </>
              ) : canResend ? (
                "Resend email"
              ) : (
                `Resend available in ${secondsLeft}s`
              )}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11 w-full text-muted-foreground" onClick={handleChangeEmail}>
              Change email
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            You can leave this page to check your email — when you return, this screen will still be here for 24 hours.
          </p>
        </div>
        <EmailSentSuccessDialog open={emailSentDialogOpen} onOpenChange={setEmailSentDialogOpen} />
      </>
    )
  }

  return (
    <>
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-center">
          <img src="/logo.jpg" alt="Nexus Pro" className="mx-auto mb-3 h-16 w-16 rounded-xl" />
          <h1 className="text-2xl font-semibold text-foreground">Enter verification code</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            6-digit code sent to <strong className="text-primary">{email}</strong>
          </p>
        </div>

        <div className="sr-only">
          <LabelledEmail value={email} onChange={setEmail} />
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {infoMsg ? (
          <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-sm text-primary">
            {infoMsg}
          </p>
        ) : null}

        <form onSubmit={handleVerify} className="space-y-6">
          <div ref={otpWrapRef} className="flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              disabled={loading}
              autoFocus
              containerClassName="gap-2"
            >
              <InputOTPGroup className="gap-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="size-12 rounded-lg border-2 border-border bg-background text-lg font-semibold shadow-sm first:rounded-lg last:rounded-lg first:border-l-2 last:border-r-2 data-[active=true]:z-10 data-[active=true]:border-primary data-[active=true]:ring-[3px] data-[active=true]:ring-primary/30"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          <button
            type="submit"
            disabled={loading || code.replace(/\D/g, "").length !== 6}
            className="w-full rounded-md bg-primary py-3 font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Verifying…" : "Verify & go to dashboard"}
          </button>
        </form>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            disabled={resendLoading || loading || !canResend}
            onClick={() => void handleResend()}
          >
            {resendLoading ? "Sending…" : canResend ? "Resend email" : `Resend available in ${secondsLeft}s`}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-10 w-full text-sm text-muted-foreground"
            onClick={() => {
              setViewMode("landing")
              patchPendingEmailVerification({ enter_code_mode: false })
            }}
          >
            Back
          </Button>
          <Button type="button" variant="ghost" className="min-h-10 w-full text-sm text-muted-foreground" onClick={handleChangeEmail}>
            Change email
          </Button>
        </div>
      </div>
      <EmailSentSuccessDialog open={emailSentDialogOpen} onOpenChange={setEmailSentDialogOpen} />
    </>
  )
}

function LabelledEmail({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      type="email"
      autoComplete="email"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-hidden
      tabIndex={-1}
    />
  )
}
