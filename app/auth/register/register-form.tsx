"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import { isValidRegisterPhone, normalizeRegisterPhone } from "@/lib/auth/register-contact"
import {
  clearRegisterDraft,
  getRegisterDraft,
  getRegisterDraftPassword,
  patchRegisterDraft,
  setRegisterDraftPassword,
} from "@/lib/auth/register-draft"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { AuthAssistantPanel } from "@/components/auth/auth-assistant-panel"
import { AuthLayoutShell } from "@/components/auth/auth-layout-shell"
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter"
import { PasswordField } from "@/components/auth/password-field"
import { RegisterStepIndicator } from "@/components/auth/register-step-indicator"
import { DashboardTestimonialStrip } from "@/components/dashboard/dashboard-testimonial-strip"
import { useAuthTestimonialNotifs } from "@/hooks/use-auth-testimonial-notifs"
import { WelcomePlatformModal } from "@/components/marketing/welcome-platform-modal"
import { NewMemberCampaignRegisterStrip } from "@/components/marketing/new-member-campaign-register-strip"
import { getAuthMessages } from "@/lib/i18n/auth-messages"
import { getRegisterMessages } from "@/lib/i18n/register-messages"
import { displayCurrencyForCustomer } from "@/lib/customer-display-currency"
import type { AppLanguage } from "@/lib/user-preferences"
import { markLanguageUserSet } from "@/lib/user-preferences"

const REGISTER_JOELIN_CHIPS = [
  { label: "Registration steps", prompt: "What happens after I submit this registration form?" },
  { label: "Security PIN", prompt: "What is my 6-digit Security PIN used for on Nexus Pro?" },
  { label: "Phone login", prompt: "How do I sign in with my phone number and password?" },
  { label: "Referral field", prompt: "How does the referral id or signup link help me or my inviter?" },
  { label: "Wallet basics", prompt: "Explain Nexus Main wallet vs Container mode at a simple level for a new user." },
]

const inputClass = "min-h-12 text-base sm:text-sm touch-manipulation"

function isValidSecurityPin(pin: string): boolean {
  return /^\d{6}$/.test(pin.trim())
}

export default function RegisterForm() {
  const router = useRouter()
  const { language: ctxLang, setPreferences, formatUserMoney } = useUserPreferences()
  const testimonialNotif = useAuthTestimonialNotifs({
    enabled: true,
    pageKey: "register",
    formatUserMoney,
  })

  const [step, setStep] = useState(1)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [securityPin, setSecurityPin] = useState("")
  const [confirmSecurityPin, setConfirmSecurityPin] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [language] = useState<AppLanguage>(ctxLang)
  const [referralCode, setReferralCode] = useState("")
  const [campaignSlug, setCampaignSlug] = useState("")
  const currency = useMemo(() => displayCurrencyForCustomer("UG", null), [])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const authT = getAuthMessages(language)
  const reg = getRegisterMessages(language)

  const steps = useMemo(
    () => [
      { id: 1, label: "Your details" },
      { id: 2, label: "Password & PIN" },
    ],
    [],
  )

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      const r = sp.get("ref")
      if (r) setReferralCode(r.trim())
      const c = sp.get("campaign")
      if (c) setCampaignSlug(c.trim())
      const prefillPhone = sp.get("phone")?.trim()
      if (prefillPhone && isValidRegisterPhone(prefillPhone)) setPhone(prefillPhone)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const draft = getRegisterDraft()
    if (draft) {
      setStep(draft.step)
      setPhone(draft.phone)
      setFullName(draft.full_name)
      setReferralCode(draft.referral_code)
      setCampaignSlug(draft.campaign_slug)
      const pw = getRegisterDraftPassword()
      if (pw) {
        setPassword(pw.password)
        setConfirmPassword(pw.confirmPassword)
      }
    }
  }, [])

  useEffect(() => {
    patchRegisterDraft({
      step: step as 1 | 2,
      email: "",
      phone,
      full_name: fullName,
      language,
      operating_country: "",
      referral_code: referralCode,
      campaign_slug: campaignSlug,
    })
    if (step === 2 && (password || confirmPassword)) {
      setRegisterDraftPassword(password, confirmPassword)
    }
  }, [step, phone, fullName, language, referralCode, campaignSlug, password, confirmPassword])

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!fullName.trim()) return "Enter your full name."
      if (!isValidRegisterPhone(phone)) {
        return "Enter a valid phone number (at least 9 digits)."
      }
      return null
    }
    if (s === 2) {
      if (password.length < 6) return reg.passwordHint
      if (password !== confirmPassword) return "Passwords do not match."
      if (!isValidSecurityPin(securityPin)) return "Enter a 6-digit Security PIN (numbers only)."
      if (securityPin !== confirmSecurityPin) return "Security PIN entries do not match."
      return null
    }
    return null
  }

  function goNext() {
    const err = validateStep(step)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setStep((s) => Math.min(2, s + 1))
  }

  function goBack() {
    setError(null)
    setStep((s) => Math.max(1, s - 1))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validateStep(2)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setIsSubmitting(true)
    markLanguageUserSet()
    setPreferences({
      language,
      currency,
      country: "UG",
    })
    try {
      const trimmedName = fullName.trim()
      const trimmedPhone = normalizeRegisterPhone(phone)

      const res = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: trimmedPhone,
          password,
          full_name: trimmedName,
          security_pin: securityPin.trim(),
          preferred_language: language,
          preferred_currency: currency,
          ...(referralCode.trim() ? { referral_code: referralCode.trim() } : {}),
          ...(campaignSlug.trim() ? { campaign_slug: campaignSlug.trim() } : {}),
        }),
      })

      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        ok?: boolean
      }
      if (!res.ok) {
        setError(json.error || "Registration failed")
        return
      }

      clearRegisterDraft()
      window.location.replace("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isDevLocalOnly()) {
    return (
      <AuthLayoutShell language={language} showTrustStrip={false}>
        <h2 className="text-center text-xl font-semibold">{reg.title}</h2>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Local dev mode — registration disabled. Use guest dashboard.
        </p>
        <Button
          className="mt-6 min-h-12 w-full"
          onClick={() => {
            try {
              sessionStorage.setItem("nexus_guest_enter", "1")
            } catch {
              /* ignore */
            }
            router.push("/dashboard")
          }}
        >
          Open dashboard (guest)
        </Button>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/auth/login" className="text-primary underline-offset-4 hover:underline">
            {reg.signInLink}
          </Link>
        </p>
      </AuthLayoutShell>
    )
  }

  return (
    <>
      <WelcomePlatformModal />
      <AuthLayoutShell language={language}>
        <header className="mb-2 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{authT.register.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Phone, password, and a 6-digit PIN — no email required.
          </p>
        </header>

        <RegisterStepIndicator steps={steps} current={step} />

        <NewMemberCampaignRegisterStrip />

        <form
          className="space-y-4"
          onSubmit={step === 2 ? handleSubmit : (e) => e.preventDefault()}
          noValidate
        >
          {step === 1 ? (
            <div className="space-y-4 animate-in fade-in duration-200" key="step1">
              <div className="space-y-2">
                <Label htmlFor="register-full-name">{reg.fullName}</Label>
                <Input
                  id="register-full-name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-phone">{reg.phone}</Label>
                <Input
                  id="register-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  disabled={isSubmitting}
                  placeholder="+256 7XX XXX XXX"
                  className={inputClass}
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  This is your login number. No SMS code needed — use it with your password to sign in.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-referral">{reg.referralCodeOptional ?? "Referral ID (optional)"}</Label>
                <Input
                  id="register-referral"
                  type="text"
                  autoComplete="off"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="NX…"
                  className={inputClass}
                />
                <p className="text-xs text-muted-foreground">{authT.register.referralHint}</p>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4 animate-in fade-in duration-200" key="step2">
              <PasswordField
                id="register-password"
                label="Account password"
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
                required
                minLength={6}
                disabled={isSubmitting}
                inputClassName={inputClass}
                hint={
                  <>
                    <PasswordStrengthMeter password={password} language={language} />
                    <p className="text-xs text-muted-foreground">{reg.passwordHint}</p>
                  </>
                }
              />
              <PasswordField
                id="register-confirm-password"
                label={authT.register.confirmPassword}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                required
                minLength={6}
                disabled={isSubmitting}
                inputClassName={inputClass}
              />
              <div className="space-y-2">
                <Label htmlFor="register-security-pin">6-digit Security PIN</Label>
                <Input
                  id="register-security-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  pattern="\d{6}"
                  value={securityPin}
                  onChange={(e) => setSecurityPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  disabled={isSubmitting}
                  placeholder="••••••"
                  className={inputClass}
                />
                <p className="text-xs text-muted-foreground">
                  Required for withdrawals. Choose something you will remember.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-confirm-security-pin">Confirm Security PIN</Label>
                <Input
                  id="register-confirm-security-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  pattern="\d{6}"
                  value={confirmSecurityPin}
                  onChange={(e) => setConfirmSecurityPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  disabled={isSubmitting}
                  placeholder="••••••"
                  className={inputClass}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <p
              className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-12 flex-1 gap-1"
                disabled={isSubmitting}
                onClick={goBack}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                {authT.register.back}
              </Button>
            ) : null}
            {step < 2 ? (
              <Button type="button" className="min-h-12 flex-1 gap-1 font-semibold" disabled={isSubmitting} onClick={goNext}>
                {authT.register.next}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button type="submit" className="min-h-12 flex-1 font-semibold" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
                    {authT.register.submitting}
                  </>
                ) : (
                  "Open your Nexus account"
                )}
              </Button>
            )}
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {authT.register.alreadyHave}{" "}
          <Link href="/auth/login" className="font-semibold text-primary underline-offset-4 hover:underline">
            {authT.register.signIn}
          </Link>
          {" · "}
          <Link href="/" className="underline-offset-4 hover:underline">
            {authT.register.home}
          </Link>
        </p>
      </AuthLayoutShell>

      <AuthAssistantPanel
        scope="register"
        authStep="signup"
        appLanguage={language}
        initialMessages={[
          {
            role: "assistant",
            text: "Hi — I’m the Nexus assistant. Ask me about phone signup, your 6-digit Security PIN, or what to expect after you create your account.",
          },
        ]}
        chips={REGISTER_JOELIN_CHIPS}
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
