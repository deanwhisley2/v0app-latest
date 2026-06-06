"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { VerificationDeliveryHint } from "@/components/auth/verification-delivery-hint"
import { isValidRegisterEmail } from "@/lib/auth/register-contact"
import {
  getPendingEmailVerification,
  recordVerificationResendSent,
  setPendingEmailVerification,
} from "@/lib/auth/pending-email-verification"
import {
  isVerificationEmailSent,
  type VerificationEmailStatus,
} from "@/lib/auth/verification-email-status"
import {
  clearRegisterDraft,
  getRegisterDraft,
  getRegisterDraftPassword,
  patchRegisterDraft,
  setRegisterDraftPassword,
} from "@/lib/auth/register-draft"
import { suggestPreferencesForCountry } from "@/lib/i18n/region-defaults"
import { displayCurrencyForCustomer } from "@/lib/customer-display-currency"
import type { AppLanguage } from "@/lib/user-preferences"
import { LANGUAGE_OPTIONS, markLanguageUserSet } from "@/lib/user-preferences"
import {
  isSupportedOperatingCountry,
  operatingCountriesByRegion,
} from "@/lib/operating-countries"
import { cn } from "@/lib/utils"

const REGISTER_JOELIN_CHIPS = [
  { label: "Registration steps", prompt: "What happens step by step after I submit this registration form?" },
  { label: "Email verification", prompt: "Why do I need to verify my email and how long does it take?" },
  { label: "Referral field", prompt: "How does the referral id or signup link help me or my inviter?" },
  { label: "Security PIN later", prompt: "When do I set my Nexus Security PIN and payout details after signup?" },
  { label: "Currency choice", prompt: "How should I choose my display currency on Nexus Pro?" },
  { label: "Wallet basics", prompt: "Explain Nexus Main wallet vs Container mode at a simple level for a new user." },
  { label: "Trust & fees", prompt: "What should a new member know about deposits and Container Mode fees?" },
]

const inputClass = "min-h-12 text-base sm:text-sm touch-manipulation"

export default function RegisterForm() {
  const router = useRouter()
  const { language: ctxLang, setPreferences, formatUserMoney } = useUserPreferences()
  const testimonialNotif = useAuthTestimonialNotifs({
    enabled: true,
    pageKey: "register",
    formatUserMoney,
  })

  const [step, setStep] = useState(1)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [language, setLanguage] = useState<AppLanguage>(ctxLang)
  const [referralCode, setReferralCode] = useState("")
  const [campaignSlug, setCampaignSlug] = useState("")
  const [operatingCountry, setOperatingCountry] = useState("UG")
  const currency = useMemo(
    () => displayCurrencyForCustomer(operatingCountry, null),
    [operatingCountry],
  )
  const [error, setError] = useState<string | null>(null)
  const [corridorWarning, setCorridorWarning] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const authT = getAuthMessages(language)
  const reg = getRegisterMessages(language)

  const steps = useMemo(
    () => [
      { id: 1, label: authT.register.stepPersonal },
      { id: 2, label: "Password & region" },
    ],
    [authT],
  )

  useEffect(() => {
    setLanguage(ctxLang)
  }, [ctxLang])

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      const r = sp.get("ref")
      if (r) setReferralCode(r.trim())
      const c = sp.get("campaign")
      if (c) setCampaignSlug(c.trim())
      const prefillEmail = sp.get("email")?.trim()
      if (prefillEmail && isValidRegisterEmail(prefillEmail)) setEmail(prefillEmail)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const pending = getPendingEmailVerification()
    if (pending?.email && pending.email.includes("@") && !pending.email.endsWith("@accounts.nexuspro.it.com")) {
      router.replace("/auth/verify")
      return
    }
    const draft = getRegisterDraft()
    if (draft) {
      setStep(draft.step)
      setEmail(draft.email)
      setPhone(draft.phone)
      setFullName(draft.full_name)
      setLanguage((draft.language as AppLanguage) || ctxLang)
      if (draft.operating_country) setOperatingCountry(draft.operating_country)
      setReferralCode(draft.referral_code)
      setCampaignSlug(draft.campaign_slug)
      const pw = getRegisterDraftPassword()
      if (pw) {
        setPassword(pw.password)
        setConfirmPassword(pw.confirmPassword)
      }
    }
  }, [router, ctxLang])

  useEffect(() => {
    patchRegisterDraft({
      step: step as 1 | 2,
      email,
      phone,
      full_name: fullName,
      language,
      operating_country: operatingCountry,
      referral_code: referralCode,
      campaign_slug: campaignSlug,
    })
    if (step === 2 && (password || confirmPassword)) {
      setRegisterDraftPassword(password, confirmPassword)
    }
  }, [step, email, phone, fullName, language, operatingCountry, referralCode, campaignSlug, password, confirmPassword])

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!fullName.trim()) return "Enter your full name."
      if (!isValidRegisterEmail(email.trim())) return "Enter a valid email address."
      const hasPhone = phone.trim().replace(/\D/g, "").length >= 9
      if (phone.trim() && !hasPhone) return "Enter a valid phone number (at least 9 digits) or leave it blank."
      return null
    }
    if (s === 2) {
      if (!operatingCountry || !isSupportedOperatingCountry(operatingCountry)) {
        return authT.register.countryRequired ?? "Select your operating country."
      }
      if (password.length < 6) return reg.passwordHint
      if (password !== confirmPassword) return "Passwords do not match."
      return null
    }
    return null
  }

  async function goNext() {
    const err = validateStep(step)
    if (err) {
      setError(err)
      return
    }
    if (step === 2 && operatingCountry) {
      try {
        const res = await fetch(
          `/api/auth/corridor-check?country=${encodeURIComponent(operatingCountry)}`,
          { credentials: "same-origin" },
        )
        const json = (await res.json().catch(() => ({}))) as {
          allowed?: boolean
          error?: string
          warning?: string | null
        }
        if (!res.ok || json.allowed === false) {
          setCorridorWarning(null)
          setError(json.error || authT.register.countryMismatch)
          return
        }
        setCorridorWarning(json.warning?.trim() || null)
      } catch {
        setCorridorWarning(null)
        setError("Could not verify your region. Try again.")
        return
      }
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
      ...(operatingCountry ? { country: operatingCountry } : {}),
    })
    try {
      const trimmedEmail = email.trim()
      const trimmedName = fullName.trim()
      const trimmedPhone = phone.trim()

      const res = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          full_name: trimmedName,
          phone: trimmedPhone,
          preferred_language: language,
          preferred_currency: currency,
          ...(operatingCountry ? { funding_country_code: operatingCountry } : {}),
          ...(referralCode.trim() ? { referral_code: referralCode.trim() } : {}),
          ...(campaignSlug.trim() ? { campaign_slug: campaignSlug.trim() } : {}),
        }),
      })

      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        requiresEmailVerification?: boolean
        email?: string
        session?: boolean
        verificationEmailStatus?: VerificationEmailStatus
        verificationEmailError?: string
      }
      if (!res.ok) {
        setError(json.error || "Registration failed")
        return
      }

      if (json.requiresEmailVerification) {
        const verifyEmail = json.email ?? trimmedEmail
        if (verifyEmail) {
          const verificationStatus = json.verificationEmailStatus ?? "generation_failed"
          setPendingEmailVerification({
            email: verifyEmail,
            ...(operatingCountry ? { funding_country_code: operatingCountry } : {}),
            verification_email_status: verificationStatus,
          })
          if (isVerificationEmailSent(verificationStatus)) {
            recordVerificationResendSent()
          }
          clearRegisterDraft()
          if (json.session) {
            window.location.replace("/dashboard")
            return
          }
          router.replace("/auth/verify")
          router.refresh()
          return
        }
      }

      clearRegisterDraft()
      if (json.session) {
        window.location.replace("/dashboard")
        return
      }

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
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{authT.register.subtitle}</p>
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
                <Label htmlFor="register-email">{reg.email}</Label>
                <Input
                  id="register-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                  placeholder="you@example.com"
                  className={inputClass}
                />
                <VerificationDeliveryHint />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-phone">Mobile Number (optional)</Label>
                <Input
                  id="register-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="+256 7XX XXX XXX"
                  className={inputClass}
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Used as an additional sign-in and account recovery method.
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
              <p className="text-xs text-muted-foreground">
                Set your 6-digit Security PIN and payment details later in Settings → Security & Recovery.
              </p>
              <div className="space-y-2">
                <Label>{reg.language}</Label>
                <Select
                  value={language}
                  onValueChange={(v) => setLanguage(v as AppLanguage)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className={cn("w-full", inputClass)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((o) => (
                      <SelectItem key={o.code} value={o.code}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Account balances and trading use USD. Local amounts appear only when you add funds or withdraw via
                  mobile money.
                </p>
              </div>
              <div className="space-y-2">
                <Label>{reg.operatingCountry ?? "Operating country"}</Label>
                <Select
                  value={operatingCountry}
                  onValueChange={(v) => {
                    const code = v
                    setOperatingCountry(code)
                    setCorridorWarning(null)
                    if (code) {
                      const hint = suggestPreferencesForCountry(code)
                      if (hint.language) setLanguage(hint.language)
                    }
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className={cn("w-full", inputClass)}>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[min(70vh,320px)]">
                    {operatingCountriesByRegion().map((group) => (
                      <div key={group.region}>
                        <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.region}
                        </p>
                        {group.countries.map((o) => (
                          <SelectItem key={o.code} value={o.code}>
                            {o.label} · {o.currency}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{authT.register.countryHint}</p>
                {corridorWarning ? (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                    {corridorWarning}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
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
        fundingCountryCode={operatingCountry}
        initialMessages={[
          {
            role: "assistant",
            text: "Hi — I’m the Nexus assistant. Ask me about email verification, optional mobile number, Security PIN in Settings, referrals, or what to expect after you create your account.",
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
