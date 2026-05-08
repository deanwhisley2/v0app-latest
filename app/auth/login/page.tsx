"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bot, MessageCircle, X } from "lucide-react"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import { getSupabaseBrowserConfigIssue, supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/contexts/AuthContext"
import { isGuestLoginEnabled } from "@/lib/free-entry"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestNexusAssistantReply } from "@/lib/nexus-assistant/client"

export default function LoginPage() {
  const router = useRouter()
  const { reenterGuestMode } = useAuth()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showJoelin, setShowJoelin] = useState(false)
  const [joelinInput, setJoelinInput] = useState("")
  const [joelinBusy, setJoelinBusy] = useState(false)
  const [joelinMessages, setJoelinMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    {
      role: "assistant",
      text: "I am Joelin. I can explain how Nexus works, container mode benefits, and guide you to human support (admin desk coming soon).",
    },
  ])
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

  async function askJoelin(seed?: string) {
    const prompt = (seed ?? joelinInput).trim()
    if (!prompt || joelinBusy) return
    setJoelinMessages((prev) => [...prev, { role: "user", text: prompt }])
    setJoelinInput("")
    setJoelinBusy(true)
    try {
      const reply = await requestNexusAssistantReply({
        userMessage: prompt,
        surface: "auth_screen",
        isGuest: false,
        tradingUserLevel: 1,
      })
      setJoelinMessages((prev) => [...prev, { role: "assistant", text: reply }])
    } finally {
      setJoelinBusy(false)
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
      <button
        type="button"
        onClick={() => setShowJoelin(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        aria-label="Open Joelin assistant"
      >
        <Bot className="h-6 w-6" />
      </button>

      {showJoelin && (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <p className="font-semibold">Joelin Assistant</p>
            </div>
            <button type="button" onClick={() => setShowJoelin(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto p-3 text-sm">
            {joelinMessages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <div className={`inline-block max-w-[90%] rounded-xl px-3 py-2 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-3">
            <div className="mb-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => void askJoelin("Explain container mode benefits")} className="rounded-md border border-border px-2 py-1 text-xs">
                Container mode
              </button>
              <button type="button" onClick={() => void askJoelin("Why should I trust Nexus Pro?")} className="rounded-md border border-border px-2 py-1 text-xs">
                Why trust us?
              </button>
              <button type="button" onClick={() => void askJoelin("How do I contact a human assistant?")} className="rounded-md border border-border px-2 py-1 text-xs">
                Human assistant
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={joelinInput}
                onChange={(e) => setJoelinInput(e.target.value)}
                placeholder="Ask Joelin..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") void askJoelin()
                }}
                disabled={joelinBusy}
              />
              <Button type="button" size="icon" onClick={() => void askJoelin()} disabled={joelinBusy || !joelinInput.trim()}>
                <MessageCircle className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Human assistant (admin login) is planned next release.</p>
          </div>
        </div>
      )}
    </div>
  )
}
