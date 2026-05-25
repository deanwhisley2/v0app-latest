"use client"

import { useCallback, useEffect, useState } from "react"
import { Shield, Loader2, AlertTriangle } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { UserSecuritySetupForm } from "@/components/dashboard/user-security-setup-form"
import { Button } from "@/components/ui/button"

const PROFILE_CHECK_MS = 12_000

async function fetchNeedsSetup(token: string): Promise<{ needsSetup: boolean; error: string | null }> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), PROFILE_CHECK_MS)
  try {
    const res = await fetch("/api/user/security-profile", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: controller.signal,
    })
    const j = (await res.json().catch(() => ({}))) as {
      profile?: { needsSetup?: boolean }
      error?: string
    }
    if (!res.ok) {
      if (res.status === 401) {
        return { needsSetup: false, error: null }
      }
      return {
        needsSetup: false,
        error: j.error ?? `Security check unavailable (${res.status}).`,
      }
    }
    return { needsSetup: Boolean(j.profile?.needsSetup), error: null }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return {
        needsSetup: false,
        error: "Security check timed out. You can continue; complete setup from Settings when ready.",
      }
    }
    return {
      needsSetup: false,
      error: e instanceof Error ? e.message : "Security check failed.",
    }
  } finally {
    window.clearTimeout(timer)
  }
}

/** Blocks dashboard until Nexus Security Code profile is configured. */
export function NexusSecuritySetupGate({
  children,
  bypass = false,
}: {
  children: React.ReactNode
  /** Guest / preview sessions must not block on institutional security setup. */
  bypass?: boolean
}) {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(bypass ? false : null)
  const [gateError, setGateError] = useState<string | null>(null)
  const [checking, setChecking] = useState(!bypass)

  const runCheck = useCallback(async () => {
    if (bypass) {
      setNeedsSetup(false)
      setChecking(false)
      return
    }
    setChecking(true)
    setGateError(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setNeedsSetup(false)
        return
      }
      const result = await fetchNeedsSetup(token)
      setNeedsSetup(result.needsSetup)
      setGateError(result.error)
    } catch {
      setNeedsSetup(false)
      setGateError("Could not verify security profile. Open Settings → Security & Recovery.")
    } finally {
      setChecking(false)
    }
  }, [bypass])

  useEffect(() => {
    void runCheck()
  }, [runCheck])

  const handleSetupComplete = useCallback(() => {
    void (async () => {
      setChecking(true)
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setNeedsSetup(false)
        setChecking(false)
        return
      }
      const result = await fetchNeedsSetup(token)
      setNeedsSetup(result.needsSetup)
      setGateError(result.error)
      setChecking(false)
    })()
  }, [])

  if (checking || needsSetup === null) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Checking security profile…</p>
      </div>
    )
  }

  if (needsSetup) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Complete security setup</h1>
            <p className="text-sm text-muted-foreground">
              Nexus Security Code is required to protect withdrawals and account recovery.
            </p>
          </div>
        </div>
        <UserSecuritySetupForm variant="gate" onComplete={handleSetupComplete} />
      </div>
    )
  }

  return (
    <>
      {gateError ? (
        <div className="mx-auto mb-3 flex max-w-3xl items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p>{gateError}</p>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void runCheck()}>
              Retry check
            </Button>
          </div>
        </div>
      ) : null}
      {children}
    </>
  )
}
