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
import { isValidRegisterPhone } from "@/lib/auth/register-contact"
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

  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
      if (saved) setPhone(saved)
      const params = new URLSearchParams(window.location.search)
      const phoneParam = params.get("phone")?.trim()
      if (phoneParam) setPhone(phoneParam)
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

    const phoneRaw = phone.trim()
    if (!phoneRaw) {
      setError("Enter your mobile number.")
      return
    }
    if (!isValidRegisterPhone(phoneRaw) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(phoneRaw)) {
      setError("Enter a valid mobile number (at least 9 digits).")
      return
    }
    if (!password) {
      setError("Enter your password.")
      return
    }

    setIsSubmitting(true)
    try {
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: phoneRaw, password }),
      })
      const loginJson = (await loginRes.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }

      if (!loginRes.ok) {
        const msg = loginJson.error ?? `Sign-in failed (${loginRes.status})`
        if (msg.toLowerCase().includes("invalid login credentials")) {
          setError("Wrong phone or password. Check caps lock or tap Forgot password.")
        } else if (msg.toLowerCase().includes("no account")) {
          setError("No account has this phone linked. Open a new Nexus account or sign in with your email.")
        } else {
          setError(msg)
        }
        return
      }

      if (!loginJson.ok) {
        setError("No session returned. Try again or contact support.")
        return
      }

      try {
        if (rememberMe) localStorage.setItem(REMEMBER_KEY, phoneRaw)
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
        setError("Cannot reach the server. Confirm your connection and try again.")
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const loginFooter = (
    <div className="mt-6 space-y-2">
      <AuthCollapsibleSection
        title="NEXUS PRO Account Security Reminder"
        open={showSecurityNotice}
        onToggle={() => setShowSecurityNotice((v) => !v)}
        panelId="login-security-reminder"
      >
        <p>Use your own verified phone number and avoid shared or public devices.</p>
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
        <header className="mb-7 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{t.login.welcomeBack}</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.login.subtitle}</p>
        </header>

        {isDevLocalOnly() ? (
          <p className="mb-5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            Local dev: opens guest dashboard.
          </p>
        ) : null}

        <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2.5">
            <Label htmlFor="login-phone" className="text-sm font-medium">
              Mobile number
            </Label>
            <Input
              id="login-phone"
              type="tel"
              autoComplete="username tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+256 7XX XXX XXX"
              required
              disabled={isSubmitting}
              className={inputClass}
              aria-invalid={!!error}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Registered with email? Enter your email address here — then add your phone in Settings for faster sign-in
              next time.
            </p>
          </div>

          <PasswordField
            id="login-password"
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            required
            disabled={isSubmitting}
            inputClassName={inputClass}
            aria-invalid={!!error}
            captureHardened
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-xs text-muted-foreground">
              <Checkbox
                checked={rememberMe}
                onCheckedChange={(v) => setRememberMe(v === true)}
                disabled={isSubmitting}
              />
              {t.login.rememberMe}
            </label>
            <Link
              href="/auth/recovery"
              className="inline-flex min-h-[44px] items-center text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              {t.login.forgotPassword}
            </Link>
          </div>

          {sessionCleared ? (
            <p className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2.5 text-xs text-sky-100" role="status">
              Session reset — sign in again.
            </p>
          ) : null}
          {sessionRequired ? (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100" role="status">
              Signed out on this device. Sign in with your phone and password.
            </p>
          ) : null}
          {resetSuccess ? (
            <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-300" role="status">
              Password updated. Sign in with your new password.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className="sticky bottom-0 -mx-5 border-t border-white/[0.06] bg-[rgba(20,28,52,0.92)] px-5 py-4 backdrop-blur-md sm:-mx-7 sm:px-7">
            <Button type="submit" className="min-h-12 w-full text-base font-semibold" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
                  {t.login.signingIn}
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </div>
        </form>

        {isGuestLoginEnabled() ? (
          <div className="mt-6 space-y-2 border-t border-white/[0.06] pt-6">
            <Button
              type="button"
              variant="secondary"
              className="min-h-12 w-full"
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

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t.login.noAccount}{" "}
          <Link href="/auth/register" className="font-semibold text-primary underline-offset-4 hover:underline">
            Open your Nexus account
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
