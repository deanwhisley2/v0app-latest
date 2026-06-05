"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AuthLayoutShell } from "@/components/auth/auth-layout-shell"
import { VerificationDeliveryHint } from "@/components/auth/verification-delivery-hint"
import { VerificationCodeSentPanel } from "@/components/auth/verification-code-sent-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const inputClass = "min-h-12 text-base sm:text-sm touch-manipulation"

export default function RecoveryPage() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sentEmail, setSentEmail] = useState<string | null>(null)
  const [codeSentAt, setCodeSentAt] = useState<number | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const value = identifier.trim()
    if (!value) {
      setError("Enter your email, username, or registered phone number.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/auth/recovery/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: value }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
        error?: string
        email?: string
      }
      if (!res.ok) {
        setError(data.error || "Could not send reset code.")
        return
      }
      const email = typeof data.email === "string" ? data.email : ""
      setSentEmail(email || (value.includes("@") ? value : ""))
      setCodeSentAt(Date.now())
      if (email) {
        const qs = new URLSearchParams({ sent: "1", email })
        router.push(`/auth/reset-password?${qs.toString()}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reset code.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayoutShell language="en" showBrand={false} showTrustStrip={false}>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Account recovery</h1>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Enter your email, username, or phone. We will send a 6-digit code to your registered email — no links.
        </p>
      </header>

      {sentEmail ? (
        <div className="mb-5 space-y-3">
          <VerificationCodeSentPanel email={sentEmail} />
          <VerificationDeliveryHint codeSentAt={codeSentAt} />
        </div>
      ) : (
        <VerificationDeliveryHint className="mb-5" />
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div className="space-y-2.5">
          <Label htmlFor="recovery-identifier">Email, username, or phone number</Label>
          <Input
            id="recovery-identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            disabled={isSubmitting}
            className={inputClass}
          />
        </div>
        {error ? (
          <p className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="min-h-12 w-full text-base font-semibold" disabled={isSubmitting}>
          {isSubmitting ? "Sending code…" : "Send reset code"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayoutShell>
  )
}
