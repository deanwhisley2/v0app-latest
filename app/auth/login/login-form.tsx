"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Fingerprint, Loader2 } from "lucide-react"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import { getSupabaseBrowserConfigIssue, supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/contexts/AuthContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { isGuestLoginEnabled } from "@/lib/free-entry"
import { AuthAssistantPanel } from "@/components/auth/auth-assistant-panel"
import { AuthLayoutShell } from "@/components/auth/auth-layout-shell"
import { DashboardTestimonialStrip } from "@/components/dashboard/dashboard-testimonial-strip"
import { markFreshLoginLanding } from "@/lib/dashboard-navigation-policy"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordField } from "@/components/auth/password-field"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuthTestimonialNotifs } from "@/hooks/use-auth-testimonial-notifs"
import { WelcomePlatformModal } from "@/components/marketing/welcome-platform-modal"
import { StartupCapitalPromoModal } from "@/components/marketing/startup-capital-promo-modal"
import { getAuthMessages } from "@/lib/i18n/auth-messages"
const REMEMBER_KEY = "nexus_auth_remember_id"

const LOGIN_JOELIN_CHIPS = [
  { label: "First steps after login", prompt: "What should I do first after I sign in to the dashboard?" },
  { label: "Container mode", prompt: "Explain Container Mode benefits and how fixed trades work at a high level." },
  { label: "Wallet & withdrawals", prompt: "Explain Nexus Main wallet rules and how withdrawals work." },
  { label: "Referrals", prompt: "How do referrals work for Nexus Pro?" },
  { label: "Trust & safety", prompt: "Why should I trust Nexus Pro with deposits? What safeguards exist?" },
  { label: "Human support", prompt: "How do I reach a human assistant or official support?" },
  { label: "Forgot password flow", prompt: "How does password recovery work if I lose access?" },
]

const inputClass =
  "min-h-12 text-base sm:text-sm touch-manipulation"

export default function LoginForm() {
  const router = useRouter()
  const { reenterGuestMode } = useAuth()
  const { language, formatUserMoney } = useUserPreferences()
  const t = getAuthMessages(language)
  const testimonialNotif = useAuthTestimonialNotifs({
    enabled: true,
    pageKey: "login",
    formatUserMoney,
  })
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [resetSuccess, setResetSuccess] = useState(false)
  const [sessionCleared, setSessionCleared] = useState(false)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      setResetSuccess(params.get("reset") === "success")
      setSessionCleared(params.get("reason") === "session_cleared")
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY)
      if (saved) setIdentifier(saved)
    } catch {
      /* ignore */
    }
  }, [])

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
          setError(
            "No account matches that phone or username. Sign in with your full email address (the one you registered with).",
          )
          return
        }
        emailForAuth = resolveData.email
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: emailForAuth.trim(),
        password,
      })
      if (signInError) {
        const msg = signInError.message
        if (msg.toLowerCase().includes("invalid login credentials")) {
          setError(
            "Wrong email or password. Use your full email (e.g. name@gmail.com), check caps lock, or tap Forgot password.",
          )
        } else {
          setError(msg)
        }
        return
      }
      if (!data.session || !data.user) {
        setError("No session returned. Check your email or confirm your account.")
        return
      }

      try {
        if (rememberMe) localStorage.setItem(REMEMBER_KEY, rawIdentifier)
        else localStorage.removeItem(REMEMBER_KEY)
      } catch {
        /* ignore */
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

      markFreshLoginLanding()
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
    <>
      <WelcomePlatformModal />
      <StartupCapitalPromoModal />
      <AuthLayoutShell language={language} showBrand={false} showTrustStrip={false}>
        <header className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t.login.welcomeBack}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.login.subtitle}</p>
        </header>

        {isDevLocalOnly() ? (
          <p className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-xs text-cyan-100">
            <strong>Local dev:</strong> Sign in opens guest dashboard. Disable{" "}
            <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_DEV_LOCAL_ONLY</code> for real auth.
          </p>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="login-identifier" className="text-sm font-medium">
              {t.login.identifier}
            </Label>
            <Input
              id="login-identifier"
              type="text"
              autoComplete="username"
              inputMode="email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={t.login.identifierPlaceholder}
              required
              disabled={isSubmitting}
              className={inputClass}
              aria-invalid={!!error}
            />
          </div>

          <PasswordField
            id="login-password"
            label={t.login.password}
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            required
            disabled={isSubmitting}
            inputClassName={inputClass}
            aria-invalid={!!error}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
              <Checkbox
                checked={rememberMe}
                onCheckedChange={(v) => setRememberMe(v === true)}
                disabled={isSubmitting}
              />
              {t.login.rememberMe}
            </label>
            <Link
              href="/auth/recovery"
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t.login.forgotPassword}
            </Link>
          </div>

          {sessionCleared ? (
            <p className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2.5 text-sm text-sky-100" role="status">
              Session reset — sign in again. Your account data is intact.
            </p>
          ) : null}
          {resetSuccess ? (
            <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300" role="status">
              Password updated. Sign in with your new password.
            </p>
          ) : null}
          {info ? (
            <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300" role="status">
              {info}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="min-h-12 w-full text-base font-semibold" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
                {t.login.signingIn}
              </>
            ) : (
              t.login.accessDashboard
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="min-h-12 w-full gap-2 text-sm"
            disabled
            title="Biometric sign-in will be enabled in a future release"
          >
            <Fingerprint className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
            {t.login.biometricSoon}
          </Button>
        </form>

        {isGuestLoginEnabled() ? (
          <div className="mt-6 space-y-2 border-t border-border pt-6">
            <p className="text-center text-xs text-muted-foreground">{t.login.orDivider}</p>
            <Button
              type="button"
              variant="secondary"
              className="min-h-12 w-full"
              disabled={isSubmitting}
              onClick={() => goGuestDashboard()}
            >
              {t.login.guestContinue}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t.login.guestHint}</p>
          </div>
        ) : null}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t.login.noAccount}{" "}
          <Link href="/auth/register" className="font-semibold text-primary underline-offset-4 hover:underline">
            {t.login.register}
          </Link>
          {" · "}
          <Link href="/" className="underline-offset-4 hover:underline">
            {t.login.home}
          </Link>
        </p>

      </AuthLayoutShell>

      <AuthAssistantPanel
        scope="login"
        authStep="signin"
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
    </>
  )
}
