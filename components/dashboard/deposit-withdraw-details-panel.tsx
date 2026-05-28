"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowDownUp, Check, Loader2, Shield } from "lucide-react"
import dynamic from "next/dynamic"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabaseClient"
import type { PublicSecurityProfile } from "@/lib/nexus-security-profile-types"
import { cn } from "@/lib/utils"

const UserSecuritySetupForm = dynamic(
  () => import("@/components/dashboard/user-security-setup-form").then((m) => m.UserSecuritySetupForm),
  { ssr: false },
)

function GlassSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <Card
      className={cn(
        "border-border/80 bg-card/95 p-5 shadow-sm backdrop-blur-sm dark:bg-card/90",
        className,
      )}
    >
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </Card>
  )
}

export function DepositWithdrawDetailsPanel() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<PublicSecurityProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setProfile(null)
        setLoading(false)
        return
      }
      const res = await fetch("/api/user/security-profile", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      const j = (await res.json().catch(() => ({}))) as { profile?: PublicSecurityProfile; error?: string }
      if (!res.ok) throw new Error(j.error ?? "Could not load details")
      setProfile(j.profile ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load details")
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const setupComplete = Boolean(profile && !profile.needsSetup)

  const payoutSummary = useMemo(() => {
    if (!profile) return []
    const out: Array<{ label: string; value: string }> = []
    for (const opt of profile.payoutOptions) {
      if (opt.id === "crypto") {
        out.push({ label: opt.label, value: opt.numberMasked })
      } else {
        out.push({
          label: opt.label,
          value: `${opt.numberMasked}${opt.accountNames ? ` · ${opt.accountNames}` : ""}`,
        })
      }
    }
    return out
  }, [profile])

  if (loading) {
    return (
      <div className="flex justify-center py-10" aria-busy="true">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    )
  }

  if (!profile) {
    return (
      <Card className="border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Sign in to manage deposit and withdrawal details.</p>
      </Card>
    )
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
          <ArrowDownUp className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Minimum for Add Funds, trading, and Withdraw: 6-digit PIN plus one mobile money number with registered names.
          Extra payout methods are optional. Changes after setup go through Security Appeal review.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {setupComplete ? (
        <GlassSection
          title="Registered details"
          description="Numbers and wallets on file for deposits and withdrawals."
        >
          <div className="space-y-3 text-sm">
            {payoutSummary.length === 0 ? (
              <p className="text-muted-foreground">No payout lines on file yet.</p>
            ) : (
              payoutSummary.map((row) => (
                <div
                  key={row.label}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
                >
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="text-right font-medium text-foreground">{row.value}</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="touch-manipulation"
              onClick={() => (window.location.href = "/dashboard/security/appeals")}
            >
              <Shield className="mr-2 h-4 w-4" aria-hidden />
              Edit via Security Appeal
            </Button>
            <Button type="button" variant="ghost" className="touch-manipulation" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </GlassSection>
      ) : (
        <GlassSection
          title="Registered details"
          description="Complete setup below to register your first mobile money or bank lines."
        >
          <p className="text-sm text-muted-foreground">No registered details yet.</p>
        </GlassSection>
      )}

      {!setupComplete ? (
        <GlassSection
          title="Add new detail"
          description="Set your 6-digit Nexus Security PIN and at least one mobile money number for deposits and withdrawals."
        >
          <UserSecuritySetupForm variant="settings" onComplete={() => setRefreshKey((n) => n + 1)} />
        </GlassSection>
      ) : (
        <Card className="border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
              <Check className="h-5 w-5 text-emerald-700 dark:text-emerald-300" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-foreground">Setup complete</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                You can use Add Funds and Withdraw from the dashboard. To change numbers, open a Security Appeal.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
