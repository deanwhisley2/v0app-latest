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
import { getRegisterMessages } from "@/lib/i18n/register-messages"
import type { AppLanguage } from "@/lib/user-preferences"
import { CURRENCY_OPTIONS, LANGUAGE_OPTIONS } from "@/lib/user-preferences"
import type { FiatCurrencyCode } from "@/lib/currency-display"

export default function RegisterPage() {
  const router = useRouter()
  const { language: ctxLang, currency: ctxCur, setPreferences } = useUserPreferences()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [language, setLanguage] = useState<AppLanguage>(ctxLang)
  const [currency, setCurrency] = useState<FiatCurrencyCode>(ctxCur as FiatCurrencyCode)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setLanguage(ctxLang)
  }, [ctxLang])

  useEffect(() => {
    setCurrency((ctxCur as FiatCurrencyCode) || "USD")
  }, [ctxCur])

  const reg = getRegisterMessages(language)

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
    </div>
  )
}
