"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let mounted = true

    async function initRecoverySession() {
      setError(null)
      try {
        // Recovery links may carry tokens in hash or code in query (PKCE).
        const href = window.location.href
        const u = new URL(href)
        const code = u.searchParams.get("code")

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            if (mounted) setError(exchangeError.message)
            return
          }
        }

        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""))
        const accessToken = hashParams.get("access_token")
        const refreshToken = hashParams.get("refresh_token")
        if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (setSessionError) {
            if (mounted) setError(setSessionError.message)
            return
          }
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          if (mounted) setError(sessionError.message)
          return
        }
        if (!sessionData.session) {
          if (mounted) setError("Recovery session not found. Request a new reset email.")
          return
        }

        if (mounted) {
          setReady(true)
          setInfo("Recovery verified. Set a new password.")
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Could not initialize recovery.")
      }
    }

    void initRecoverySession()
    return () => {
      mounted = false
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (!ready) {
      setError("Recovery session is not ready. Open the latest reset email link again.")
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
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }
      await supabase.auth.signOut()
      setSuccess(true)
      setInfo("Password updated. Redirecting to sign in…")
      setTimeout(() => {
        router.replace("/auth/login?reset=success")
      }, 1200)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground">Reset password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set a new password to recover your account.
          </p>
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

        {!success ? (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                disabled={loading || !ready}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 10 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                disabled={loading || !ready}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !ready}>
              {loading ? "Updating…" : "Update password"}
            </Button>
          </form>
        ) : null}

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
