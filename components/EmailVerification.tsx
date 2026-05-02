"use client"

import { useState } from "react"
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

  async function handleResend() {
    const trimmed = email.trim()
    if (!trimmed) {
      toast.error("Enter your email first.")
      return
    }
    setBusy("resend")
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        toast.error(json.error || "Could not send code")
        return
      }
      toast.success(json.message || "Check your inbox for the code.")
    } catch {
      toast.error("Network error")
    } finally {
      setBusy(null)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    const trimmedEmail = email.trim()
    const digits = code.replace(/\D/g, "").slice(0, 6)
    if (!trimmedEmail) {
      toast.error("Enter your email.")
      return
    }
    if (digits.length !== 6) {
      toast.error("Enter the full 6-digit code.")
      return
    }

    setBusy("verify")
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, code: digits }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        toast.error(json.error || "Verification failed")
        return
      }
      toast.success(json.message || "Verified — you can sign in.")
      router.replace("/auth/login")
      router.refresh()
    } catch {
      toast.error("Network error")
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
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          disabled={busy !== null}
        />
      </div>

      <div className="space-y-2">
        <Label>6-digit code</Label>
        <div className="flex justify-center py-2">
          <InputOTP maxLength={6} value={code} onChange={setCode} disabled={busy !== null}>
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
