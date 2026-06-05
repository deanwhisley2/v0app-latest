"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
import { AuthTabSwitcher } from "@/components/auth/auth-tab-switcher"
import { VerificationCodeSentPanel } from "@/components/auth/verification-code-sent-panel"
import { VerificationDeliveryHint } from "@/components/auth/verification-delivery-hint"
import { markFreshLoginLanding } from "@/lib/dashboard-navigation-policy"
import { sanitizeInternalRedirect } from "@/lib/nexus-bot/trade-signal-share"
import { isValidRegisterEmail } from "@/lib/auth/register-contact"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordField } from "@/components/auth/password-field"
import { Checkbox } from "@/components/ui/checkbox"
import { getAuthMessages } from "@/lib/i18n/auth-messages"
import { setPendingEmailVerification } from "@/lib/auth/pending-email-verification"

const REMEMBER_KEY = "nexus_auth_remember_id"
const APK_URL = process.env.NEXT_PUBLIC_ANDROID_APK_URL ?? ""
const CODE_RESEND_SECONDS = 60

const LOGIN_JOELIN_CHIPS = [
  { label: "First steps after login", prompt: "What should I do first after I sign in to the dashboard?" },
  { label: "Wallet & withdrawals", prompt: "Explain Nexus Main wallet rules and how withdrawals work." },
  { label: "Human support", prompt: "How do I reach a human assistant or official support?" },
]

const inputClass = "min-h-12 text-base sm:text-sm touch-manipulation"

type SignInChannel = "email" | "phone"
type EmailMethod = "password" | "code"
type AccountHint = "unknown" | "existing" | "new"

export default function LoginForm() {
  const router = useRouter()
  const { reenterGuestMode } = useAuth()
  const { language } = useUserPreferences()
  const t = getAuthMessages(language)

  const [signInChannel, setSignInChannel] = useState<SignInChannel>("email")
  const [emailMethod, setEmailMethod] = useState<EmailMethod>("password")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loginCodeSent, setLoginCodeSent] = useState(false)
  const [loginCodeEmail, setLoginCodeEmail] = useState("")
  const [loginCode, setLoginCode] = useState("")
  const [codeSentAt, setCodeSentAt] = useState<number | null>(null)
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [accountHint, setAccountHint] = useState<AccountHint>("unknown")
  const [accountHintLoading, setAccountHintLoading] = useState(false)

  const [resetSuccess, setResetSuccess] = useState(false)
  const [sessionCleared, setSessionCleared] = useState(false)
  const [sessionRequired, setSessionRequired] = useState(false)
  const [postLoginPath, setPostLoginPath] = useState("/dashboard")
  const [android, setAndroid] = useState(false)
  const [showSecurityNotice, setShowSecurityNotice] = useState(false)
  const [showServiceAgreement, setShowServiceAgreement] = useState(false)

  const lookupAbort = useRef<AbortController | null>(null)

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
      if (saved) {
        if (saved.includes("@")) setEmail(saved)
        else setPhone(saved)
      }
      const params = new URLSearchParams(window.location.search)
      const emailParam = params.get("email")?.trim()
      if (emailParam) setEmail(emailParam)
      if (params.get("verify_later") === "1") {
        setSuccess("Account created. Sign in with your email and password. You can verify your email anytime from Settings.")
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!codeSentAt) return
    const tick = () => {
      const left = Math.max(0, CODE_RESEND_SECONDS - Math.floor((Date.now() - codeSentAt) / 1000))
      setResendSecondsLeft(left)
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [codeSentAt])

  useEffect(() => {
    if (signInChannel !== "email") {
      setAccountHint("unknown")
      return
    }
    const trimmed = email.trim().toLowerCase()
    if (!isValidRegisterEmail(trimmed)) {
      setAccountHint("unknown")
      return
    }

    lookupAbort.current?.abort()
    const controller = new AbortController()
    lookupAbort.current = controller
    const timer = window.setTimeout(async () => {
      setAccountHintLoading(true)
      try {
        const res = await fetch("/api/auth/lookup-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
          signal: controller.signal,
        })
        const json = (await res.json().catch(() => ({}))) as { exists?: boolean }
        if (controller.signal.aborted) return
        setAccountHint(json.exists ? "existing" : "new")
      } catch {
        if (!controller.signal.aborted) setAccountHint("unknown")
      } finally {
        if (!controller.signal.aborted) setAccountHintLoading(false)
      }
    }, 450)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [email, signInChannel])

  const goGuestDashboard = useCallback(() => {
    try {
      sessionStorage.setItem("nexus_guest_enter", "1")
    } catch {
      reenterGuestMode()
    }
    router.replace("/dashboard")
    router.refresh()
  }, [router, reenterGuestMode])

  async function resolveEmailForPhone(rawPhone: string): Promise<string | null> {
    const trimmed = rawPhone.trim()
    if (!trimmed) return null
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
    setCodeSentAt(Date.now())
    setSuccess(null)
    setError(null)
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
      const rememberValue = signInChannel === "email" ? email.trim() : phone.trim()
      if (rememberMe && rememberValue) localStorage.setItem(REMEMBER_KEY, rememberValue)
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
      if (signInChannel === "email") {
        const emailForAuth = email.trim().toLowerCase()
        if (!isValidRegisterEmail(emailForAuth)) {
          setError("Enter your email address.")
          return
        }

        if (emailMethod === "code") {
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
          body: JSON.stringify({ email: emailForAuth, password }),
        })
        const loginJson = (await loginRes.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          emailVerificationPending?: boolean
        }

        if (!loginRes.ok) {
          const msg = loginJson.error ?? `Sign-in failed (${loginRes.status})`
          if (msg.toLowerCase().includes("invalid login credentials")) {
            setError("Wrong email or password. Check caps lock or tap Forgot password.")
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
          if (rememberMe) localStorage.setItem(REMEMBER_KEY, emailForAuth)
          else localStorage.removeItem(REMEMBER_KEY)
        } catch {
          /* ignore */
        }

        if (loginJson.emailVerificationPending) {
          try {
            setPendingEmailVerification({ email: emailForAuth })
          } catch {
            /* ignore */
          }
        }

        markFreshLoginLanding()
        window.location.assign(postLoginPath)
        return
      }

      const rawPhone = phone.trim()
      if (!rawPhone) {
        setError("Enter the mobile number linked to your account.")
        return
      }

      const emailForAuth = await resolveEmailForPhone(rawPhone)
      if (!emailForAuth) {
        setError("No account has this phone linked. Sign in with email or open a new Nexus account.")
        return
      }

      if (loginCodeSent) {
        if (!/^\d{6}$/.test(loginCode)) {
          setError("Enter the 6-digit verification code.")
          return
        }
        await handleLoginCodeVerify(loginCodeEmail || emailForAuth, loginCode)
      } else {
        await handleLoginCodeRequest(emailForAuth)
      }
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
          "Cannot reach the server. Confirm your connection and try again.",
        )
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  function resetCodeState() {
    setLoginCodeSent(false)
    setLoginCode("")
    setCodeSentAt(null)
    setResendSecondsLeft(0)
    setSuccess(null)
    setError(null)
  }

  function switchChannel(channel: SignInChannel) {
    setSignInChannel(channel)
    resetCodeState()
    setError(null)
    setSuccess(null)
  }

  const showCodeEntry = loginCodeSent
  const codeTargetEmail = loginCodeEmail || email.trim().toLowerCase()
  const canResendCode = resendSecondsLeft <= 0

  const submitLabel = (() => {
    if (isSubmitting) {
      if (showCodeEntry) return "Signing in…"
      if (signInChannel === "email" && emailMethod === "code") return "Sending code…"
      if (signInChannel === "phone") return "Sending code…"
      return t.login.signingIn
    }
    if (showCodeEntry) return "Sign in"
    if (signInChannel === "email" && emailMethod === "code") return "Continue securely"
    if (signInChannel === "phone") return "Continue securely"
    return "Sign in"
  })()

  const loginFooter = (
    <div className="mt-6 space-y-2">
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
        <header className="mb-7 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{t.login.welcomeBack}</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.login.subtitle}</p>
        </header>

        {isDevLocalOnly() ? (
          <p className="mb-5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            Local dev: opens guest dashboard.
          </p>
        ) : null}

        <AuthTabSwitcher
          className="mb-6"
          tabs={[
            { id: "email" as const, label: "Email" },
            { id: "phone" as const, label: "Phone" },
          ]}
          active={signInChannel}
          onChange={switchChannel}
          disabled={isSubmitting}
        />

        <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
          {signInChannel === "email" ? (
            <>
              <div className="space-y-2.5">
                <Label htmlFor="login-email" className="text-sm font-medium">
                  Email address
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    resetCodeState()
                  }}
                  placeholder="you@example.com"
                  required
                  disabled={isSubmitting || showCodeEntry}
                  className={inputClass}
                  aria-invalid={!!error}
                />
                {accountHintLoading ? (
                  <p className="text-xs text-muted-foreground">Checking account…</p>
                ) : accountHint === "existing" ? (
                  <p className="text-xs text-emerald-400/90">Welcome back — sign in or use a secure code.</p>
                ) : accountHint === "new" ? (
                  <p className="text-xs text-muted-foreground">
                    New here?{" "}
                    <Link
                      href={`/auth/register?email=${encodeURIComponent(email.trim())}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Open your Nexus account
                    </Link>
                  </p>
                ) : null}
              </div>

              {!showCodeEntry ? (
                <AuthTabSwitcher
                  size="compact"
                  tabs={[
                    { id: "password" as const, label: "Password" },
                    { id: "code" as const, label: "Email code" },
                  ]}
                  active={emailMethod}
                  onChange={(method) => {
                    setEmailMethod(method)
                    resetCodeState()
                  }}
                  disabled={isSubmitting}
                />
              ) : null}

              {emailMethod === "password" && !showCodeEntry ? (
                <>
                  <PasswordField
                    id="login-password"
                    label="Account password"
                    autoComplete="current-password"
                    value={password}
                    onChange={setPassword}
                    required
                    disabled={isSubmitting}
                    inputClassName={inputClass}
                    aria-invalid={!!error}
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
                </>
              ) : null}

              {emailMethod === "code" && showCodeEntry ? (
                <div className="space-y-4">
                  <VerificationCodeSentPanel
                    email={codeTargetEmail}
                    secondsLeft={resendSecondsLeft}
                    canResend={canResendCode}
                  />
                  <VerificationDeliveryHint codeSentAt={codeSentAt} />
                  <div className="space-y-2">
                    <Label htmlFor="login-code" className="text-sm font-medium">
                      Verification code
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
                      className={`${inputClass} text-center text-2xl font-semibold tracking-[0.35em]`}
                      aria-invalid={!!error}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        className="min-h-[44px] text-xs text-primary underline-offset-4 hover:underline"
                        disabled={isSubmitting}
                        onClick={resetCodeState}
                      >
                        Use a different email
                      </button>
                      <button
                        type="button"
                        className="min-h-[44px] text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
                        disabled={isSubmitting || !canResendCode}
                        onClick={() => void handleLoginCodeRequest(codeTargetEmail)}
                      >
                        {canResendCode ? "Resend code" : `Resend in ${resendSecondsLeft}s`}
                      </button>
                    </div>
                  </div>
                </div>
              ) : emailMethod === "code" && !showCodeEntry ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  We will email a 6-digit sign-in code to your inbox. No password required.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="space-y-2.5">
                <Label htmlFor="login-phone" className="text-sm font-medium">
                  Mobile number
                </Label>
                <Input
                  id="login-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value)
                    resetCodeState()
                  }}
                  placeholder="+256 7XX XXX XXX"
                  required
                  disabled={isSubmitting || showCodeEntry}
                  className={inputClass}
                  aria-invalid={!!error}
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Use a number already linked to your Nexus account. A verification code is sent to your registered
                  email.
                </p>
              </div>

              {showCodeEntry ? (
                <div className="space-y-4">
                  <VerificationCodeSentPanel
                    email={codeTargetEmail}
                    secondsLeft={resendSecondsLeft}
                    canResend={canResendCode}
                  />
                  <VerificationDeliveryHint codeSentAt={codeSentAt} />
                  <div className="space-y-2">
                    <Label htmlFor="login-phone-code" className="text-sm font-medium">
                      Verification code
                    </Label>
                    <Input
                      id="login-phone-code"
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
                      className={`${inputClass} text-center text-2xl font-semibold tracking-[0.35em]`}
                      aria-invalid={!!error}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        className="min-h-[44px] text-xs text-primary underline-offset-4 hover:underline"
                        disabled={isSubmitting}
                        onClick={resetCodeState}
                      >
                        Use a different phone
                      </button>
                      <button
                        type="button"
                        className="min-h-[44px] text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
                        disabled={isSubmitting || !canResendCode}
                        onClick={() => void handleLoginCodeRequest(codeTargetEmail)}
                      >
                        {canResendCode ? "Resend code" : `Resend in ${resendSecondsLeft}s`}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}

          {sessionCleared ? (
            <p className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2.5 text-xs text-sky-100" role="status">
              Session reset — sign in again.
            </p>
          ) : null}
          {sessionRequired ? (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100" role="status">
              Signed out on this device. Use your email and password.
            </p>
          ) : null}
          {resetSuccess ? (
            <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-300" role="status">
              Password updated. Sign in with your new password.
            </p>
          ) : null}
          {success ? (
            <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-300" role="status">
              {success}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {!showCodeEntry && (signInChannel === "email" && emailMethod === "code" || signInChannel === "phone") ? (
            <VerificationDeliveryHint />
          ) : null}

          <div className="sticky bottom-0 -mx-5 border-t border-white/[0.06] bg-[rgba(20,28,52,0.92)] px-5 py-4 backdrop-blur-md sm:-mx-7 sm:px-7">
            <Button type="submit" className="min-h-12 w-full text-base font-semibold" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
                  {submitLabel}
                </>
              ) : (
                submitLabel
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
