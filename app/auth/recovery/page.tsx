"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AuthLayoutShell } from "@/components/auth/auth-layout-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const inputClass = "min-h-12 text-base sm:text-sm touch-manipulation"

export default function RecoveryPage() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
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
      const qs = new URLSearchParams({ sent: "1" })
      if (email) qs.set("email", email)
      router.push(`/auth/reset-password?${qs.toString()}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reset code.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayoutShell language="en" showBrand={false} showTrustStrip={false}>
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Account recovery</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your email, username, or phone. We will send a <strong>6-digit code</strong> to your registered email —
          no links. Enter the code on the next screen to set a new password.
        </p>
      </header>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="space-y-2">
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
          <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300" role="status">
            {info}
          </p>
        ) : null}
        <Button type="submit" className="min-h-12 w-full text-base font-semibold" disabled={isSubmitting}>
          {isSubmitting ? "Sending code…" : "Send reset code"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayoutShell>
  )
}
