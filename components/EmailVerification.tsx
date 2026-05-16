"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"

type EmailVerificationProps = {
  initialEmail?: string
}

export function EmailVerification({ initialEmail = "" }: EmailVerificationProps) {
  const router = useRouter()
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null)
  /** Inline errors only after user actions — never shown on initial load. */
  const [inlineError, setInlineError] = useState<string | null>(null)

  useEffect(() => {
    toast.dismiss()
  }, [])

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail)
  }, [initialEmail])

  async function handleResend() {
    const trimmed = email.trim()
    if (!trimmed) {
      setInlineError("Enter your email first.")
      return
    }
    setInlineError(null)
    setBusy("resend")
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        setInlineError(json.error || "Could not send code")
        return
      }
      toast.success(json.message || "Check your inbox for the code.")
    } catch {
      setInlineError("Network error")
    } finally {
      setBusy(null)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    const trimmedEmail = email.trim()
    const digits = code.replace(/\D/g, "").slice(0, 6)
    if (!trimmedEmail) {
      setInlineError("Enter your email.")
      return
    }
    if (digits.length !== 6) {
      setInlineError("Enter the full 6-digit code.")
      return
    }

    setInlineError(null)
    setBusy("verify")
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, code: digits }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        setInlineError(json.error || "Invalid or expired code.")
        return
      }
      toast.success(json.message || "Verified. Sign in enabled.")
      router.replace("/auth/login")
      router.refresh()
    } catch {
      setInlineError("Network error")
    } finally {
      setBusy(null)
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleVerify}>
      <div className="space-y-2">
        <Label htmlFor="verify-email">Email</Label>
        <Input
          id="verify-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setInlineError(null)
          }}
          placeholder="you@example.com"
          required
          disabled={busy !== null}
        />
      </div>

      <div className="space-y-2">
        <Label>6-digit code</Label>
        <div className="flex justify-center py-2">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(v) => {
              setCode(v)
              setInlineError(null)
            }}
            disabled={busy !== null}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
      </div>

      {inlineError ? (
        <p
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
          role="alert"
        >
          {inlineError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={busy !== null}>
        {busy === "verify" ? "Verifying…" : "Verify & continue"}
      </Button>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={busy !== null}
        onClick={() => void handleResend()}
      >
        {busy === "resend" ? "Sending…" : "Resend code"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/auth/login" className="underline-offset-4 hover:underline">
          Back to sign in
        </Link>
        {" · "}
        <Link href="/" className="underline-offset-4 hover:underline">
          Home
        </Link>
      </p>
    </form>
  )
}
