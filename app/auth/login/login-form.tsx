"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import { getSupabaseBrowserConfigIssue } from "@/lib/supabaseClient"
import { useAuth } from "@/contexts/AuthContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { isGuestLoginEnabled } from "@/lib/free-entry"
import { AuthAssistantPanel } from "@/components/auth/auth-assistant-panel"
import { AuthCollapsibleSection } from "@/components/auth/auth-collapsible-section"
import { AuthLayoutShell } from "@/components/auth/auth-layout-shell"
import { markFreshLoginLanding } from "@/lib/dashboard-navigation-policy"
import { sanitizeInternalRedirect } from "@/lib/nexus-bot/trade-signal-share"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordField } from "@/components/auth/password-field"
import { Checkbox } from "@/components/ui/checkbox"
import { getAuthMessages } from "@/lib/i18n/auth-messages"

const REMEMBER_KEY = "nexus_auth_remember_id"
const APK_URL = process.env.NEXT_PUBLIC_ANDROID_APK_URL ?? ""

const LOGIN_JOELIN_CHIPS = [
  { label: "First steps after login", prompt: "What should I do first after I sign in to the dashboard?" },
  { label: "Wallet & withdrawals", prompt: "Explain Nexus Main wallet rules and how withdrawals work." },
  { label: "Human support", prompt: "How do I reach a human assistant or official support?" },
]

const inputClass = "min-h-12 text-base sm:text-sm touch-manipulation"

export default function LoginForm() {
  const router = useRouter()
  const { reenterGuestMode } = useAuth()
  const { language } = useUserPreferences()
  const t = getAuthMessages(language)
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loginMode, setLoginMode] = useState<"password" | "magic">("password")
  const [loginCodeSent, setLoginCodeSent] = useState(false)
  const [loginCodeEmail, setLoginCodeEmail] = useState("")
  const [loginCode, setLoginCode] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [resetSuccess, setResetSuccess] = useState(false)
  const [sessionCleared, setSessionCleared] = useState(false)
  const [sessionRequired, setSessionRequired] = useState(false)
  const [postLoginPath, setPostLoginPath] = useState("/dashboard")
  const [android, setAndroid] = useState(false)
  const [showSecurityNotice, setShowSecurityNotice] = useState(false)
  const [showServiceAgreement, setShowServiceAgreement] = useState(false)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      setResetSuccess(params.get("reset") === "success")
      setSessionCleared(params.get("reason") === "session_cleared")
      setSessionRequired(params.get("reason") === "session_required")
      setPostLoginPath(sanitizeInternalRedirect(params.get("next")) ?? "/dashboard")
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      setAndroid(/android/i.test(navigator.userAgent))
    } catch {
      setAndroid(false)
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

  async function resolveEmailForAuth(rawIdentifier: string): Promise<string | null> {
    const trimmed = rawIdentifier.trim()
    if (!trimmed) return null
    if (trimmed.includes("@")) return trimmed
    const resolveRes = await fetch("/api/auth/resolve-identifier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: trimmed }),
    })
    const resolveData = (await resolveRes.json().catch(() => ({}))) as { email?: string }
    if (!resolveRes.ok || !resolveData.email) return null
    return resolveData.email
  }

  async function handleLoginCodeRequest(emailForAuth: string) {
    const res = await fetch("/api/auth/request-magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailForAuth.trim() }),
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string }
    if (!res.ok) {
      setError(json.error ?? "Could not send sign-in code.")
      return
    }
    setLoginCodeEmail(emailForAuth.trim())
    setLoginCodeSent(true)
    setLoginCode("")
    setSuccess(json.message ?? "Enter the 6-digit code from your email below.")
  }

  async function handleLoginCodeVerify(emailForAuth: string, code: string) {
    const res = await fetch("/api/auth/verify-magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: emailForAuth.trim(), code: code.trim() }),
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Invalid or expired code.")
      return
    }
    try {
      if (rememberMe) localStorage.setItem(REMEMBER_KEY, identifier.trim())
      else localStorage.removeItem(REMEMBER_KEY)
    } catch {
      /* ignore */
    }
    markFreshLoginLanding()
    window.location.assign(postLoginPath)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
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

      const emailForAuth = await resolveEmailForAuth(rawIdentifier)
      if (!emailForAuth) {
        setError(
          loginMode === "magic"
            ? "Enter the full email address for your account."
            : "No account matches that phone or username. Sign in with your full email address (the one you registered with).",
        )
        return
      }

      if (loginMode === "magic") {
        if (loginCodeSent) {
          if (!/^\d{6}$/.test(loginCode)) {
            setError("Enter the 6-digit code from your email.")
            return
          }
          await handleLoginCodeVerify(loginCodeEmail || emailForAuth, loginCode)
        } else {
          await handleLoginCodeRequest(emailForAuth)
        }
        return
      }

      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: emailForAuth.trim(), password }),
      })
      const loginJson = (await loginRes.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        code?: string
        email?: string
      }

      if (!loginRes.ok) {
        if (loginJson.code === "EMAIL_NOT_VERIFIED") {
          setError("Verify your email before signing in.")
          router.replace(
            `/auth/verify?email=${encodeURIComponent(loginJson.email ?? emailForAuth.trim())}`,
          )
          return
        }
        const msg = loginJson.error ?? `Sign-in failed (${loginRes.status})`
        if (msg.toLowerCase().includes("invalid login credentials")) {
          setError(
            "Wrong email or password. Use your full email (e.g. name@gmail.com), check caps lock, or tap Forgot password.",
          )
        } else {
          setError(msg)
        }
        return
      }

      if (!loginJson.ok) {
        setError("No session returned. Check your email or confirm your account.")
        return
      }

      try {
        if (rememberMe) localStorage.setItem(REMEMBER_KEY, rawIdentifier)
        else localStorage.removeItem(REMEMBER_KEY)
      } catch {
        /* ignore */
      }

      markFreshLoginLanding()
      window.location.assign(postLoginPath)
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
          "Cannot reach Supabase (network). Confirm the project URL in .env.local, that the project is not paused, and try disabling VPN/ad-block for *.supabase.co.",
        )
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const loginFooter = (
    <div className="mt-4 space-y-2">
      <AuthCollapsibleSection
        title="NEXUS PRO Account Security Reminder"
        open={showSecurityNotice}
        onToggle={() => setShowSecurityNotice((v) => !v)}
        panelId="login-security-reminder"
      >
        <p>Use only your own verified email and avoid shared or public devices.</p>
        <p className="mt-1.5">Never share your password or 6-digit Nexus Security PIN with anyone.</p>
        <p className="mt-1.5">
          Confirm you are on <span className="font-medium text-foreground">www.nexuspro.it.com</span> before signing
          in.
        </p>
      </AuthCollapsibleSection>
      <AuthCollapsibleSection
        title="Service Agreement"
        open={showServiceAgreement}
        onToggle={() => setShowServiceAgreement((v) => !v)}
        panelId="login-service-agreement"
      >
        <p>Last updated: 2023/05/26</p>
        <Link
          href="/legal/service-agreement"
          className="mt-2 inline-flex min-h-[40px] items-center font-medium text-primary underline-offset-4 hover:underline"
        >
          Open Service Agreement
        </Link>
      </AuthCollapsibleSection>
      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-2 text-center text-[11px] text-muted-foreground">
        <Link href="/legal/terms" className="min-h-[44px] inline-flex items-center hover:text-foreground">
          {t.footer.terms}
        </Link>
        <Link href="/legal/privacy" className="min-h-[44px] inline-flex items-center hover:text-foreground">
          {t.footer.privacy}
        </Link>
        <Link href="/auth/recovery" className="min-h-[44px] inline-flex items-center hover:text-foreground">
          {t.footer.support}
        </Link>
      </footer>
    </div>
  )

  return (
    <>
      <AuthLayoutShell language={language} showBrand={false} showTrustStrip={false} footer={loginFooter}>
        <header className="mb-5 text-center">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t.login.welcomeBack}</h1>
        </header>

        {isDevLocalOnly() ? (
          <p className="mb-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            Local dev: opens guest dashboard.
          </p>
        ) : null}

        <div className="mb-4 flex rounded-lg border border-border p-1 text-sm">
          <button
            type="button"
            className={`min-h-10 flex-1 rounded-md px-2 font-medium transition-colors ${
              loginMode === "password"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setLoginMode("password")
              setLoginCodeSent(false)
              setLoginCode("")
              setSuccess(null)
              setError(null)
            }}
            disabled={isSubmitting}
          >
            Password
          </button>
          <button
            type="button"
            className={`min-h-10 flex-1 rounded-md px-2 font-medium transition-colors ${
              loginMode === "magic"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setLoginMode("magic")
              setLoginCodeSent(false)
              setLoginCode("")
              setSuccess(null)
              setError(null)
            }}
            disabled={isSubmitting}
          >
            Email code
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="login-identifier" className="text-sm font-medium">
              {loginMode === "magic" ? "Email address" : t.login.identifier}
            </Label>
            <Input
              id="login-identifier"
              type="text"
              autoComplete="username"
              inputMode="email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={loginMode === "magic" ? "you@example.com" : t.login.identifierPlaceholder}
              required
              disabled={isSubmitting}
              className={inputClass}
              aria-invalid={!!error}
            />
          </div>

          {loginMode === "password" ? (
            <>
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

              <div className="flex flex-wrap items-center justify-between gap-3">
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
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {loginCodeSent
                  ? "Enter the 6-digit code we sent to your email. It expires in 15 minutes."
                  : "We will email you a 6-digit sign-in code. No password or link required."}
              </p>
              {loginCodeSent ? (
                <div className="space-y-2">
                  <Label htmlFor="login-code" className="text-sm font-medium">
                    Sign-in code
                  </Label>
                  <Input
                    id="login-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={loginCode}
                    onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    required
                    disabled={isSubmitting}
                    className={`${inputClass} text-center text-2xl tracking-[0.35em] font-semibold`}
                    aria-invalid={!!error}
                  />
                  <button
                    type="button"
                    className="text-sm text-primary underline-offset-4 hover:underline"
                    disabled={isSubmitting}
                    onClick={() => {
                      setLoginCodeSent(false)
                      setLoginCode("")
                      setSuccess(null)
                      setError(null)
                    }}
                  >
                    Use a different email
                  </button>
                </div>
              ) : null}
            </>
          )}

          {sessionCleared ? (
            <p className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-100" role="status">
              Session reset — sign in again.
            </p>
          ) : null}
          {sessionRequired ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100" role="status">
              Signed out on this device. Use your full email and password.
            </p>
          ) : null}
          {resetSuccess ? (
            <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300" role="status">
              Password updated. Sign in with your new password.
            </p>
          ) : null}
          {success ? (
            <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300" role="status">
              {success}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="min-h-12 w-full text-base font-semibold" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
                {loginMode === "magic"
                  ? loginCodeSent
                    ? "Signing in…"
                    : "Sending code…"
                  : t.login.signingIn}
              </>
            ) : loginMode === "magic" ? (
              loginCodeSent ? "Sign in with code" : "Send sign-in code"
            ) : (
              t.login.accessDashboard
            )}
          </Button>
        </form>

        {isGuestLoginEnabled() ? (
          <div className="mt-5 space-y-2 border-t border-border pt-5">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full"
              disabled={isSubmitting}
              onClick={() => goGuestDashboard()}
            >
              {t.login.guestContinue}
            </Button>
          </div>
        ) : null}

        {android && APK_URL ? (
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            <a href={APK_URL} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Download Android app
            </a>
          </p>
        ) : null}

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {t.login.noAccount}{" "}
          <Link href="/auth/register" className="font-semibold text-primary underline-offset-4 hover:underline">
            {t.login.register}
          </Link>
        </p>
      </AuthLayoutShell>

      <AuthAssistantPanel
        scope="login"
        authStep="signin"
        initialMessages={[
          {
            role: "assistant",
            text: "Ask about wallet rules, deposits, withdrawals, or what to do after sign-in.",
          },
        ]}
        chips={LOGIN_JOELIN_CHIPS}
      />
    </>
  )
}
