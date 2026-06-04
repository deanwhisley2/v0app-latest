"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { AuthLayoutShell } from "@/components/auth/auth-layout-shell"
import { Button } from "@/components/ui/button"
import { markFreshLoginLanding } from "@/lib/dashboard-navigation-policy"
import { sanitizeInternalRedirect } from "@/lib/nexus-bot/trade-signal-share"

function MagicLinkVerifyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading")
  const [message, setMessage] = useState("Signing you in…")

  useEffect(() => {
    const token = searchParams.get("token")?.trim()
    const next = sanitizeInternalRedirect(searchParams.get("next")) ?? "/dashboard"

    if (!token) {
      setStatus("error")
      setMessage("Missing sign-in token. Request a new link from the login page.")
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch("/api/auth/verify-magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        })
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
        if (cancelled) return

        if (!res.ok || !json.ok) {
          setStatus("error")
          setMessage(json.error ?? "Could not sign in with this link.")
          return
        }

        setStatus("ok")
        setMessage("Signed in. Opening your dashboard…")
        markFreshLoginLanding()
        router.replace(next)
        router.refresh()
      } catch {
        if (!cancelled) {
          setStatus("error")
          setMessage("Network error. Try again or request a new link.")
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchParams, router])

  return (
    <AuthLayoutShell language="en" showBrand={false} showTrustStrip={false}>
      <div className="mx-auto max-w-md space-y-4 text-center">
        {status === "loading" ? (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" aria-hidden />
        ) : null}
        <p
          className={
            status === "error"
              ? "rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </p>
        {status === "error" ? (
          <Button asChild variant="secondary" className="min-h-11 w-full">
            <Link href="/auth/login">Back to login</Link>
          </Button>
        ) : null}
      </div>
    </AuthLayoutShell>
  )
}

export default function MagicLinkPage() {
  return (
    <Suspense
      fallback={
        <AuthLayoutShell language="en" showBrand={false} showTrustStrip={false}>
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        </AuthLayoutShell>
      }
    >
      <MagicLinkVerifyContent />
    </Suspense>
  )
}
