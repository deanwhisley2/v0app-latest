"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import { AuthJoelinPanel } from "@/components/auth/auth-joelin-panel"
import { DashboardTestimonialStrip } from "@/components/dashboard/dashboard-testimonial-strip"
import { useAuthTestimonialNotifs } from "@/hooks/use-auth-testimonial-notifs"
import { getRegisterMessages } from "@/lib/i18n/register-messages"
import type { AppLanguage } from "@/lib/user-preferences"
import { CURRENCY_OPTIONS, LANGUAGE_OPTIONS } from "@/lib/user-preferences"
import type { FiatCurrencyCode } from "@/lib/currency-display"
import {
  imageDataUrlToFaceTemplate,
  imageDataUrlToHash,
  optimizeSelfieUpload,
  validateSelfieQuality,
} from "@/lib/selfie-hash"

const REGISTER_JOELIN_CHIPS = [
  { label: "Registration steps", prompt: "What happens step by step after I submit this registration form?" },
  { label: "Email verification", prompt: "Why do I need to verify my email and how long does it take?" },
  { label: "Referral field", prompt: "How does the referral id or signup link help me or my inviter?" },
  { label: "Security selfie", prompt: "What is the optional security selfie for and should I add it now?" },
  { label: "Currency choice", prompt: "How should I choose my display currency on Nexus Pro?" },
  { label: "Wallet basics", prompt: "Explain Nexus Main wallet vs Container mode at a simple level for a new user." },
  { label: "Trust & fees", prompt: "What should a new member know about deposits and Container Mode fees?" },
]

export default function RegisterPage() {
  const router = useRouter()
  const { language: ctxLang, currency: ctxCur, setPreferences, formatUserMoney } = useUserPreferences()
  const testimonialNotif = useAuthTestimonialNotifs({
    enabled: true,
    pageKey: "register",
    formatUserMoney,
  })
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [selfieDataUrl, setSelfieDataUrl] = useState("")
  const [selfiePreview, setSelfiePreview] = useState("")
  const [selfieHash, setSelfieHash] = useState("")
  const [selfieTemplate, setSelfieTemplate] = useState("")
  const [language, setLanguage] = useState<AppLanguage>(ctxLang)
  const [currency, setCurrency] = useState<FiatCurrencyCode>(ctxCur as FiatCurrencyCode)
  const [referralCode, setReferralCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setLanguage(ctxLang)
  }, [ctxLang])

  useEffect(() => {
    setCurrency((ctxCur as FiatCurrencyCode) || "USD")
  }, [ctxCur])

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      const r = sp.get("ref")
      if (r) setReferralCode(r.trim())
    } catch {
      /* ignore */
    }
  }, [])

  const reg = getRegisterMessages(language)

  async function handleSelfieFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Selfie must be an image file.")
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("Selfie image is too large. Please take a new clear photo.")
      return
    }
    const result = await optimizeSelfieUpload(file)
    await validateSelfieQuality(result)
    const hash = await imageDataUrlToHash(result)
    const template = await imageDataUrlToFaceTemplate(result)
    setSelfieDataUrl(result)
    setSelfiePreview(result)
    setSelfieHash(hash)
    setSelfieTemplate(template)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    setIsSubmitting(true)
    setPreferences({ language, currency })
    try {
      const trimmedEmail = email.trim()
      const trimmedName = fullName.trim()
      const trimmedPhone = phone.trim()

      // Server-only signup: no profiles.insert — DB trigger creates profile after auth.users insert.
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
          ...(referralCode.trim() ? { referral_code: referralCode.trim() } : {}),
          ...(selfieDataUrl && selfieTemplate && selfieHash
            ? {
                selfie_image: selfieDataUrl,
                selfie_template: selfieTemplate,
                selfie_hash: selfieHash,
              }
            : {}),
        }),
      })

      const ct = res.headers.get("content-type") ?? ""
      if (ct.includes("application/json")) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          setError(json.error || "Registration failed")
          return
        }
      } else if (!res.ok) {
        setError("Registration failed")
        return
      }

      try {
        sessionStorage.setItem("nexus_pending_verify_email", trimmedEmail)
      } catch {
        /* ignore */
      }
      router.replace("/auth/verify")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isDevLocalOnly()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl text-center">
          <h1 className="mt-2 text-xl font-semibold text-foreground">Local dev mode</h1>
          <p className="text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1">NEXT_PUBLIC_DEV_LOCAL_ONLY=1</code> is on. Sign-up and
            external APIs are disabled. Use the guest dashboard only.
          </p>
          <Button
            className="w-full"
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
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/auth/login" className="text-primary underline-offset-4 hover:underline">
              Login page
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-center">
          <h1 className="mt-1 text-2xl font-semibold text-foreground">{reg.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{reg.subtitle}</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{reg.language}</Label>
              <Select
                value={language}
                onValueChange={(v) => setLanguage(v as AppLanguage)}
                disabled={isSubmitting}
              >
                <SelectTrigger className="w-full">
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
            </div>
            <div className="space-y-2">
              <Label>{reg.currency}</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as FiatCurrencyCode)}
                disabled={isSubmitting}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.code} value={o.code}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
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
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-phone">{reg.phone}</Label>
            <Input
              id="register-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              disabled={isSubmitting}
              placeholder="+1 555 0100"
            />
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
            />
            <p className="text-xs text-muted-foreground">
              If someone invited you, paste their referral id or use their signup link.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-email">{reg.email}</Label>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isSubmitting}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-selfie">Security Selfie (optional, recommended)</Label>
            <Input
              id="register-selfie"
              type="file"
              accept="image/*"
              capture="user"
              disabled={isSubmitting}
              onChange={async (e) => {
                setError(null)
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  await handleSelfieFile(file)
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not process selfie.")
                }
              }}
            />
            {selfiePreview ? (
              <div className="space-y-2">
                <img
                  src={selfiePreview}
                  alt="Selfie preview"
                  className="h-24 w-24 rounded-xl border border-border object-cover"
                />
                <p className="text-xs text-emerald-400">
                  Face added. A compact selfie fingerprint is encoded for secure recovery checks.
                </p>
              </div>
            ) : (
              <p className="text-xs text-warning">
                Optional at signup. You can add it later in Security Center for stronger recovery protection.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-password">{reg.password}</Label>
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">{reg.passwordHint}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-confirm-password">Confirm password</Label>
            <Input
              id="register-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              disabled={isSubmitting}
            />
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? reg.submitting : reg.submit}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
            {reg.signInLink}
          </Link>
          {" · "}
          <Link href="/" className="underline-offset-4 hover:underline">
            {reg.homeLink}
          </Link>
        </p>
      </div>

      <AuthJoelinPanel
        scope="register"
        authStep="signup"
        defaultOpen
        initialMessages={[
          {
            role: "assistant",
            text: "Hi — I’m Joelin. Ask me about verification, referrals, the optional selfie, currency & language, or what to expect after you create your account.",
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
    </div>
  )
}
