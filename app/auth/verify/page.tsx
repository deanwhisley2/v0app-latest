'use client'

import { useEffect, useState, Suspense, type FormEvent } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"

function VerifyContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [email, setEmail] = useState("")

  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [infoMsg, setInfoMsg] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)

  useEffect(() => {
    const fromQuery = searchParams.get("email")?.trim() ?? ""
    let fromSession = ""
    try {
      fromSession = sessionStorage.getItem("nexus_pending_verify_email")?.trim() ?? ""
    } catch {
      /* ignore */
    }
    const resolved = fromQuery || fromSession
    if (!resolved) return
    setEmail(resolved)
    try {
      sessionStorage.setItem("nexus_pending_verify_email", resolved)
    } catch {
      /* ignore */
    }
    if (fromQuery && typeof window !== "undefined") {
      const cleanPath = `${window.location.origin}/auth/verify`
      window.history.replaceState({}, "", cleanPath)
    }
  }, [searchParams])

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
      }

      if (!res.ok) {
        setError(data.error ?? "Invalid or expired code")
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)
      setTimeout(() => {
        router.push("/auth/login?verified=true")
      }, 2000)
    } catch {
      setError("Network error. Please try again.")
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!email) {
      setError("No email address found.")
      setInfoMsg("")
      return
    }

    setResendLoading(true)
    setError("")
    setInfoMsg("")

    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
      }

      if (!res.ok) {
        setError(data.error ?? "Failed to resend code.")
      } else {
        setInfoMsg(data.message ?? "New code sent! Check your email.")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setResendLoading(false)
    }
  }

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
          <img src="/logo.jpg" alt="Nexus Pro" className="mx-auto mb-3 h-16 w-16 rounded-xl" />
          <h1 className="text-xl font-semibold text-foreground">Missing email address</h1>
          <p className="mt-3 text-muted-foreground">
            Go back and complete registration to continue verification.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            <Link href="/auth/register" className="font-medium text-primary underline-offset-4 hover:underline">
              Back to registration
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-center">
          <img src="/logo.jpg" alt="Nexus Pro" className="mx-auto mb-3 h-16 w-16 rounded-xl" />
          <h1 className="text-2xl font-semibold text-foreground">Verify your email</h1>
          <p className="mt-1 text-xs text-muted-foreground">Nexus Pro account security</p>
        </div>

        {!success ? (
          <>
            <p className="text-center text-muted-foreground">
              Enter the 6-digit code sent to{" "}
              <strong className="text-primary">{email}</strong>
            </p>

            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-center text-sm text-destructive">
                {error}
              </div>
            )}
            {infoMsg && (
              <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-center text-sm text-primary">
                {infoMsg}
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-6">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={(v) =>
                    setCode(v.replace(/\D/g, "").slice(0, 6))
                  }
                  disabled={loading}
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
                {loading ? "Verifying..." : "Verify & continue"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={resendLoading || loading}
              className="w-full text-center text-sm text-primary hover:underline disabled:text-muted-foreground"
            >
              {resendLoading
                ? "Sending..."
                : "Didn't receive a code? Click here to resend"}
            </button>
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
                Back to sign in
              </Link>
            </p>
          </>
        ) : (
          <div className="text-center">
            <div className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-300">
              ✓ Email verified successfully!
            </div>
            <p className="text-muted-foreground">Redirecting to login...</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          Loading...
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  )
}
