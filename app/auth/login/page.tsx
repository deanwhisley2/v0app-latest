"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import { getSupabaseBrowserConfigIssue, supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/contexts/AuthContext"
import { isGuestLoginEnabled } from "@/lib/free-entry"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NexusProLogo } from "@/components/brand/nexus-pro-logo"

export default function LoginPage() {
  const router = useRouter()
  const { reenterGuestMode } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const goGuestDashboard = useCallback(() => {
    try {
      sessionStorage.setItem("nexus_guest_enter", "1")
    } catch {
      reenterGuestMode()
    }
    router.replace("/dashboard")
    router.refresh()
  }, [router, reenterGuestMode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (isDevLocalOnly()) {
      goGuestDashboard()
      return
    }
    const configIssue = getSupabaseBrowserConfigIssue()
    if (configIssue) {
      if (isGuestLoginEnabled()) {
        goGuestDashboard()
        return
      }
      setError(configIssue)
      return
    }
    setIsSubmitting(true)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) {
        setError(signInError.message)
        return
      }
      if (!data.session || !data.user) {
        setError("No session returned. Check your email or confirm your account.")
        return
      }

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("is_verified")
        .eq("id", data.user.id)
        .maybeSingle()

      if (profileErr) {
        console.warn("profiles check:", profileErr.message)
      } else if (profile && profile.is_verified === false) {
        await supabase.auth.signOut()
        setError("Verify your email before signing in.")
        router.replace(`/auth/verify?email=${encodeURIComponent(email.trim())}`)
        router.refresh()
        return
      }

      router.replace("/dashboard")
      router.refresh()
    } catch (err) {
      if (
        isGuestLoginEnabled() &&
        err instanceof TypeError &&
        String(err.message).toLowerCase().includes("fetch")
      ) {
        goGuestDashboard()
        return
      }
      if (err instanceof TypeError && String(err.message).toLowerCase().includes("fetch")) {
        setError(
          "Cannot reach Supabase (network). Confirm the project URL in .env.local, that the project is not paused, and try disabling VPN/ad-block for *.supabase.co."
        )
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleForgotPassword() {
    setError(null)
    setInfo(null)
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError("Enter your email first, then click Forgot password.")
      return
    }
    const configIssue = getSupabaseBrowserConfigIssue()
    if (configIssue) {
      setError(configIssue)
      return
    }

    setIsSubmitting(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/auth/login`,
      })
      if (resetError) {
        setError(resetError.message)
        return
      }
      setInfo("Password reset email sent. Check inbox and spam.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-center">
          <div className="flex justify-center">
            <NexusProLogo variant="light" className="h-10 w-auto sm:h-11" aria-label="NEXUS PRO" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-foreground">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">Use your email and password.</p>
          {isDevLocalOnly() ? (
            <p className="mt-3 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
              <strong>Local dev mode:</strong> Supabase is off. <strong>Sign in</strong> skips password and opens
              the guest dashboard. Remove <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_DEV_LOCAL_ONLY</code>{" "}
              when you are ready for real auth.
            </p>
          ) : getSupabaseBrowserConfigIssue() && isGuestLoginEnabled() ? (
            <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <strong>No Supabase keys in .env.local.</strong> <strong>Sign in</strong> will open a{" "}
              <strong>guest</strong> dashboard until you add <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
            </p>
          ) : null}
        </div>

        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={isSubmitting}
              aria-invalid={!!error}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isSubmitting}
              aria-invalid={!!error}
            />
            <div className="text-right">
              <button
                type="button"
                className="text-xs text-primary underline-offset-4 hover:underline disabled:opacity-50"
                disabled={isSubmitting}
                onClick={handleForgotPassword}
              >
                Forgot password?
              </button>
            </div>
          </div>

          {info ? (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300" role="status">
              {info}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {isGuestLoginEnabled() ? (
          <div className="space-y-2">
            <div className="relative py-2 text-center text-xs text-muted-foreground">
              <span className="bg-card px-2">or</span>
              <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" aria-hidden />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={isSubmitting}
              onClick={() => goGuestDashboard()}
            >
              Continue without email or password
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Local guest session only — not a registered account.
            </p>
          </div>
        ) : null}

        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/auth/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Register
          </Link>
          {" · "}
          <Link href="/" className="underline-offset-4 hover:underline">
            Home
          </Link>
        </p>
      </div>
    </div>
  )
}
