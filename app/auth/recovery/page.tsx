"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { imageDataUrlToHash, validateSelfieQuality } from "@/lib/selfie-hash"

export default function RecoveryPage() {
  const [identifier, setIdentifier] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selfieBusy, setSelfieBusy] = useState(false)

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

  async function handleSelfieRecovery(file: File | null) {
    setError(null)
    setInfo(null)
    const value = identifier.trim()
    if (!value) {
      setError("Enter your email, username, or registered phone number first.")
      return
    }
    if (!file) {
      setError("Take a selfie picture to continue.")
      return
    }
    if (!file.type.startsWith("image/")) {
      setError("Selfie must be an image file.")
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Selfie image must be 3MB or smaller.")
      return
    }

    setSelfieBusy(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ""))
        reader.onerror = () => reject(new Error("Could not read selfie image"))
        reader.readAsDataURL(file)
      })
      await validateSelfieQuality(dataUrl)
      const selfieHash = await imageDataUrlToHash(dataUrl)

      const res = await fetch("/api/auth/recovery/selfie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: value, selfie_hash: selfieHash }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
        redirectUrl?: string
        error?: string
      }
      if (!res.ok || !data.redirectUrl) {
        setError(data.error || "Selfie recovery failed.")
        return
      }
      setInfo(data.message || "Selfie verified. Redirecting...")
      window.location.href = data.redirectUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : "Selfie recovery failed.")
    } finally {
      setSelfieBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground">Account recovery</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter email, username, or registered number. Use selfie recovery now, or email reset as backup.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recovery-identifier">Email, username, or phone number</Label>
            <Input
              id="recovery-identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com / username / +2567..."
              disabled={isSubmitting}
            />
          </div>

          {info ? (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {info}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send recovery OTP/link"}
          </Button>
        </form>

        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-sm font-semibold text-foreground">Picture authentication recovery</p>
          <p className="text-xs text-muted-foreground">
            Take a clear selfie (no face cover, no hat). If it matches your enrolled selfie, you will continue directly to reset password.
          </p>
          <Input
            type="file"
            accept="image/*"
            capture="user"
            disabled={selfieBusy}
            onChange={(e) => {
              void handleSelfieRecovery(e.target.files?.[0] ?? null)
            }}
          />
          {selfieBusy ? (
            <p className="text-xs text-muted-foreground">Verifying selfie...</p>
          ) : null}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
