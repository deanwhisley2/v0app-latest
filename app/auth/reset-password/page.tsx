"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { AuthLayoutShell } from "@/components/auth/auth-layout-shell"
import { VerificationDeliveryHint } from "@/components/auth/verification-delivery-hint"
import { PasswordField } from "@/components/auth/password-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const inputClass = "min-h-12 text-base sm:text-sm touch-manipulation"

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const prefill = searchParams.get("email")?.trim()
    if (prefill) setEmail(prefill)
    if (searchParams.get("sent") === "1") {
      setInfo("Enter the 6-digit code from your email and choose a new password.")
    }
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    const emailTrim = email.trim()
    if (!emailTrim.includes("@")) {
      setError("Enter the email address for your account.")
      return
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.")
      return
    }
    if (!password || !confirmPassword) {
      setError("Enter and confirm your new password.")
      return
    }
    if (password.length < 10) {
      setError("Password must be at least 10 characters.")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/recovery/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailTrim,
          code,
          password,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string }
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not reset password.")
        return
      }
      setSuccess(true)
      setInfo(json.message ?? "Password updated. Redirecting to sign in…")
      setTimeout(() => {
        router.replace("/auth/login?reset=success")
      }, 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayoutShell language="en" showBrand={false} showTrustStrip={false}>
      <header className="mb-6 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Reset password</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Enter the 6-digit code from your email and set a new password.
        </p>
      </header>

      <VerificationDeliveryHint className="mb-5" />

      {info ? (
        <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300" role="status">
          {info}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {!success ? (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email address</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-code">Reset code</Label>
            <Input
              id="reset-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              disabled={loading}
              required
              className={`${inputClass} text-center text-2xl tracking-[0.35em] font-semibold`}
            />
          </div>
          <PasswordField
            id="new-password"
            label="New password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            required
            disabled={loading}
            inputClassName={inputClass}
            captureHardened
          />
          <PasswordField
            id="confirm-password"
            label="Confirm password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            required
            disabled={loading}
            inputClassName={inputClass}
            captureHardened
          />
          <Button type="submit" className="min-h-12 w-full text-base font-semibold" disabled={loading}>
            {loading ? "Updating…" : "Update password"}
          </Button>
        </form>
      ) : null}

      <p className="mt-5 text-center text-sm text-muted-foreground">
        <Link href="/auth/recovery" className="font-medium text-primary underline-offset-4 hover:underline">
          Request a new code
        </Link>
        {" · "}
        <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayoutShell>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthLayoutShell language="en" showBrand={false} showTrustStrip={false}>
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        </AuthLayoutShell>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}
