"use client"

import { useCallback, useEffect, useState } from "react"
import { Mail } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { VerificationDeliveryHint } from "@/components/auth/verification-delivery-hint"
import { VerificationEmailStatusPanel } from "@/components/auth/verification-email-status-panel"
import type { VerificationEmailStatus } from "@/lib/auth/verification-email-status"
import { supabase } from "@/lib/supabaseClient"

type EmailStatus = {
  isVerified: boolean
  profileEmail: string | null
  pendingEmail: string | null
  authEmail: string | null
}

type Props = {
  /** Compact layout for settings home; full layout on security page. */
  variant?: "settings" | "security"
}

export function EmailVerificationSettingsCard({ variant = "security" }: Props) {
  const [status, setStatus] = useState<EmailStatus | null>(null)
  const [emailInput, setEmailInput] = useState("")
  const [code, setCode] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"send" | "verify" | null>(null)
  const [showCodeStep, setShowCodeStep] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<VerificationEmailStatus>("generation_failed")
  const [codeSentAt, setCodeSentAt] = useState<number | null>(null)

  const loadStatus = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await fetch("/api/user/email-verification", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    const j = (await res.json().catch(() => ({}))) as EmailStatus & { error?: string }
    if (res.ok) {
      setStatus(j)
      const auth = j.authEmail?.includes("@") && !j.authEmail.includes("@accounts.nexuspro-it-com.com")
        ? j.authEmail
        : null
      const next = j.pendingEmail ?? j.profileEmail ?? auth ?? ""
      if (next) setEmailInput(next)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  async function sendCode() {
    setBusy("send")
    setError(null)
    setMessage(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Session expired. Sign in again.")
      const res = await fetch("/api/user/email-verification", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "send", email: emailInput.trim() }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
        verificationEmailStatus?: VerificationEmailStatus
        retryAfterSeconds?: number
      }
      if (!res.ok) {
        const failedStatus = j.verificationEmailStatus ?? (res.status === 502 ? "delivery_pending" : "generation_failed")
        setVerificationStatus(failedStatus)
        setCodeSentAt(null)
        if (j.retryAfterSeconds) {
          setMessage(`Please wait ${j.retryAfterSeconds} seconds before resending.`)
        } else if (failedStatus === "delivery_pending") {
          setMessage("Your verification email is on its way. Please allow up to 5 minutes.")
        } else {
          setMessage("We couldn't prepare your verification code. Please try again.")
        }
        return
      }
      setVerificationStatus("sent")
      setCodeSentAt(Date.now())
      setShowCodeStep(true)
      setMessage(j.message ?? "Verification email sent.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send code")
    } finally {
      setBusy(null)
    }
  }

  async function verifyCode() {
    setBusy("verify")
    setError(null)
    setMessage(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Session expired. Sign in again.")
      const res = await fetch("/api/user/email-verification", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "verify",
          email: emailInput.trim().toLowerCase(),
          code,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) throw new Error(j.error ?? "Invalid or expired code")
      setMessage(j.message ?? "Email verified.")
      setCode("")
      setShowCodeStep(false)
      await loadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed")
    } finally {
      setBusy(null)
    }
  }

  if (status?.isVerified && status.profileEmail) {
    return (
      <Card className="border-border bg-card p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
          <div>
            <h3 className="text-lg font-semibold">Email verified</h3>
            <p className="mt-1 text-sm text-muted-foreground">{status.profileEmail}</p>
          </div>
        </div>
      </Card>
    )
  }

  const intro =
    variant === "settings"
      ? "You skipped email verification at signup. Verify now to protect recovery and security alerts."
      : "Verify your inbox for recovery and security alerts."

  return (
    <Card className="border-amber-500/25 bg-amber-500/5 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-200" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold">Verify your email</h3>
          <p className="mt-1 text-sm text-muted-foreground">{intro}</p>

          {verificationStatus === "sent" && codeSentAt ? (
            <div className="mt-4">
              <VerificationEmailStatusPanel
                status="sent"
                email={emailInput}
                canResend
              />
              <VerificationDeliveryHint className="mt-3" codeSentAt={codeSentAt} />
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            <Input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={busy !== null}
            />
            {!showCodeStep ? (
              <Button
                type="button"
                size="sm"
                className="min-h-11 touch-manipulation"
                disabled={busy === "send" || !emailInput.trim()}
                onClick={() => void sendCode()}
              >
                {busy === "send" ? "Sending…" : "Send verification email"}
              </Button>
            ) : (
              <div className="space-y-3">
                <InputOTP maxLength={6} value={code} onChange={setCode}>
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 touch-manipulation"
                    disabled={busy === "verify" || code.length !== 6}
                    onClick={() => void verifyCode()}
                  >
                    {busy === "verify" ? "Verifying…" : "Confirm code"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 touch-manipulation"
                    disabled={busy === "send"}
                    onClick={() => void sendCode()}
                  >
                    Resend verification email
                  </Button>
                </div>
              </div>
            )}
            {message ? <p className="text-xs text-primary">{message}</p> : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        </div>
      </div>
    </Card>
  )
}

/** Lightweight hook for settings badge / banner gating. */
export function useEmailVerificationNeeded(): boolean {
  const [needed, setNeeded] = useState(false)
  useEffect(() => {
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch("/api/user/email-verification", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      const j = (await res.json().catch(() => ({}))) as { isVerified?: boolean }
      if (res.ok) setNeeded(j.isVerified !== true)
    })()
  }, [])
  return needed
}
