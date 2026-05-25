"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function RecoveryPage() {
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
      }
      if (!res.ok) {
        setError(data.error || "Could not start recovery.")
        return
      }
      setInfo(data.message || "Recovery sent. Check your email for reset instructions.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start recovery.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Account recovery</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter email, username, or registered number. We will send reset instructions to your email.
            Use your Nexus Security Code when prompted after you open the reset link.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <Label htmlFor="recovery-identifier">Email, username, or phone number</Label>
            <Input
              id="recovery-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              className="mt-1"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {info ? <p className="text-sm text-success">{info}</p> : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send recovery link"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/auth/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
