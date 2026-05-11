"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import { getSupabaseBrowserConfigIssue, supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/contexts/AuthContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { isGuestLoginEnabled } from "@/lib/free-entry"
import { AuthAssistantPanel } from "@/components/auth/auth-assistant-panel"
import { DashboardTestimonialStrip } from "@/components/dashboard/dashboard-testimonial-strip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuthTestimonialNotifs } from "@/hooks/use-auth-testimonial-notifs"

const LOGIN_JOELIN_CHIPS = [
  { label: "First steps after login", prompt: "What should I do first after I sign in to the dashboard?" },
  { label: "Container mode", prompt: "Explain Container Mode benefits and how fixed trades work at a high level." },
  { label: "Wallet & withdrawals", prompt: "Explain Nexus Main wallet rules and how withdrawals work." },
  { label: "Referrals", prompt: "How do referrals work for Nexus Pro?" },
  { label: "Trust & safety", prompt: "Why should I trust Nexus Pro with deposits? What safeguards exist?" },
  { label: "Human support", prompt: "How do I reach a human assistant or official support?" },
  { label: "Forgot password flow", prompt: "How does password recovery work if I lose access?" },
]

export default function LoginPage() {
  const router = useRouter()
  const { reenterGuestMode } = useAuth()
  const { formatUserMoney } = useUserPreferences()
  const testimonialNotif = useAuthTestimonialNotifs({
    enabled: true,
    pageKey: "login",
    formatUserMoney,
  })
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const resetSuccess =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("reset") === "success"

  const sessionCleared =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("reason") === "session_cleared"

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
      const rawIdentifier = identifier.trim()
      if (!rawIdentifier) {
        setError("Enter your email, username, or phone number.")
        return
      }

      let emailForAuth = rawIdentifier
      if (!rawIdentifier.includes("@")) {
        const resolveRes = await fetch("/api/auth/resolve-identifier", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: rawIdentifier }),
        })
        const resolveData = (await resolveRes.json().catch(() => ({}))) as {
          email?: string
          error?: string
        }
        if (!resolveRes.ok || !resolveData.email) {
          setError("Invalid login credentials.")
          return
        }
        emailForAuth = resolveData.email
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: emailForAuth.trim(),
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
        router.replace(`/auth/verify?email=${encodeURIComponent(emailForAuth.trim())}`)
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-center">
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">Use your email, username, or phone and password.</p>
          {isDevLocalOnly() ? (
            <p className="mt-3 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
              <strong>Local dev mode:</strong> Supabase is off. <strong>Sign in</strong> skips password and opens
              the guest dashboard. Remove <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_DEV_LOCAL_ONLY</code>{" "}
              when you are ready for real auth.
            </p>
          ) : null}
        </div>

        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="login-identifier">Email, username, or phone</Label>
            <Input
              id="login-identifier"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com / username / +2567..."
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
                onClick={() => router.push("/auth/recovery")}
              >
                Forgot password?
              </button>
            </div>
          </div>

          {sessionCleared ? (
            <p className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-100" role="status">
              Your browser session was reset because the cookies were too large to load safely (often after a large
              security selfie). Sign in again — your account data is intact.
            </p>
          ) : null}

          {resetSuccess ? (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300" role="status">
              Password updated successfully. Sign in with your new password.
            </p>
          ) : null}

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

      <AuthAssistantPanel
        scope="login"
        authStep="signin"
        defaultOpen
        initialMessages={[
          {
            role: "assistant",
            text: "I’m the Nexus assistant — ask me about Nexus Main / wallet rules, referrals, Container fixed flows, deposits & withdrawals, or what to tap next after you sign in.",
          },
        ]}
        chips={LOGIN_JOELIN_CHIPS}
      />

      <DashboardTestimonialStrip
        visible={testimonialNotif.visible}
        text={testimonialNotif.text}
        onDismiss={testimonialNotif.dismiss}
        subtitle="Community"
      />
    </div>
  )
}
