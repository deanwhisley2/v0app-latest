"use client"

import { useEffect, useState } from "react"
import { Shield, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { UserSecuritySettingsPanel } from "@/components/dashboard/user-security-settings-panel"

/** Blocks dashboard until Nexus Security Code profile is configured. */
export function NexusSecuritySetupGate({ children }: { children: React.ReactNode }) {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) {
          if (!cancelled) setNeedsSetup(false)
          return
        }
        const res = await fetch("/api/user/security-profile", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        const j = (await res.json()) as { profile?: { needsSetup?: boolean } }
        if (!cancelled) setNeedsSetup(Boolean(j.profile?.needsSetup))
      } catch {
        if (!cancelled) setNeedsSetup(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (needsSetup === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
        <UserSecuritySettingsPanel />
      </div>
    )
  }

  return <>{children}</>
}
