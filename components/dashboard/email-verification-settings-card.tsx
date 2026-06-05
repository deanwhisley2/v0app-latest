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
import { supabase } from "@/lib/supabaseClient"

type EmailStatus = {
  isVerified: boolean
  profileEmail: string | null
  pendingEmail: string | null
}

export function EmailVerificationSettingsCard() {
  const [status, setStatus] = useState<EmailStatus | null>(null)
  const [emailInput, setEmailInput] = useState("")
  const [code, setCode] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"send" | "verify" | null>(null)
  const [showCodeStep, setShowCodeStep] = useState(false)

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
      const next = j.pendingEmail ?? j.profileEmail ?? ""
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
      const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string; deferred?: boolean }
      if (!res.ok) {
        if (j.deferred) {
          setError(
            j.error ??
              "We could not deliver the verification email right now. Try again later or contact support.",
          )
          return
        }
        throw new Error(j.error ?? "Could not send verification email")
      }
      setShowCodeStep(true)
      setMessage(j.message ?? "Verification code sent.")
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
      if (!res.ok) throw new Error(j.error ?? "Verification failed")
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

  return (
    <Card className="border-amber-500/25 bg-amber-500/5 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-200" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold">Verify your email</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Verify your inbox for recovery and security alerts.
          </p>
          <VerificationDeliveryHint className="mt-3" />
          <div className="mt-4 space-y-3">
            <Input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
            {!showCodeStep ? (
              <Button
                type="button"
                size="sm"
                disabled={busy === "send" || !emailInput.trim()}
                onClick={() => void sendCode()}
              >
                {busy === "send" ? "Sending…" : "Send verification code"}
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
                    disabled={busy === "verify" || code.length !== 6}
                    onClick={() => void verifyCode()}
                  >
                    {busy === "verify" ? "Verifying…" : "Confirm code"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy === "send"}
                    onClick={() => void sendCode()}
                  >
                    Resend code
                  </Button>
                </div>
              </div>
            )}
            {message ? <p className="text-xs text-success">{message}</p> : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        </div>
      </div>
    </Card>
  )
}
