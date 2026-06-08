"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowDownUp, Check, Loader2, Phone, Shield } from "lucide-react"
import dynamic from "next/dynamic"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabaseClient"
import type { PublicSecurityProfile } from "@/lib/nexus-security-profile-types"
import { cn } from "@/lib/utils"
import { SecuritySetupProgressTracker } from "@/components/auth/security-setup-progress-tracker"
import Link from "next/link"

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
        "border-border bg-card p-5 shadow-sm",
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
  const [loginPhone, setLoginPhone] = useState("")
  const [phoneBindBusy, setPhoneBindBusy] = useState(false)
  const [phoneBindError, setPhoneBindError] = useState<string | null>(null)
  const [phoneBindOk, setPhoneBindOk] = useState<string | null>(null)

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

  const canUseFunding = Boolean(
    profile && profile.hasSecurityCode && profile.hasMinimumPayoutLine && !profile.needsFundingSetup,
  )

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
          Add Funds and Withdraw require your Security PIN plus at least one payout line with both the number and
          registered account holder name. Trading does not require payout details.
        </p>
      </div>

      {profile?.canBindLoginPhone ? (
        <GlassSection
          title="Login phone number"
          description="Save your mobile number here for faster phone sign-in. No admin appeal is required for your first bind."
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="bind-login-phone" className="text-xs font-medium text-foreground">
                Mobile number
              </label>
              <Input
                id="bind-login-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+256 7XX XXX XXX"
                value={loginPhone}
                onChange={(e) => {
                  setLoginPhone(e.target.value)
                  setPhoneBindError(null)
                  setPhoneBindOk(null)
                }}
                className="mt-1 min-h-[44px] touch-manipulation"
              />
            </div>
            <Button
              type="button"
              className="min-h-[44px] touch-manipulation sm:shrink-0"
              disabled={phoneBindBusy || !loginPhone.trim()}
              onClick={() => void (async () => {
                setPhoneBindBusy(true)
                setPhoneBindError(null)
                setPhoneBindOk(null)
                try {
                  const {
                    data: { session },
                  } = await supabase.auth.getSession()
                  const token = session?.access_token
                  if (!token) throw new Error("Session expired. Please sign in again.")
                  const res = await fetch("/api/user/security-profile", {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${token}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ action: "bind_login_phone", phone: loginPhone.trim() }),
                  })
                  const j = (await res.json().catch(() => ({}))) as { error?: string }
                  if (!res.ok) throw new Error(j.error ?? "Could not save phone number")
                  setLoginPhone("")
                  setPhoneBindOk("Login phone saved. You can sign in with this number next time.")
                  setRefreshKey((n) => n + 1)
                } catch (e) {
                  setPhoneBindError(e instanceof Error ? e.message : "Could not save phone number")
                } finally {
                  setPhoneBindBusy(false)
                }
              })()}
            >
              {phoneBindBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                <>
                  <Phone className="mr-2 h-4 w-4" aria-hidden />
                  Save login phone
                </>
              )}
            </Button>
          </div>
          {phoneBindError ? <p className="mt-2 text-sm text-destructive">{phoneBindError}</p> : null}
          {phoneBindOk ? <p className="mt-2 text-sm text-success">{phoneBindOk}</p> : null}
        </GlassSection>
      ) : profile?.profilePhoneMasked ? (
        <GlassSection title="Login phone number" description="Saved for phone sign-in.">
          <p className="font-mono text-sm">{profile.profilePhoneMasked}</p>
        </GlassSection>
      ) : null}

      {profile ? (
        <SecuritySetupProgressTracker
          items={profile.setupProgress}
          completedCount={profile.setupCompletedCount}
          totalCount={profile.setupTotalCount}
        />
      ) : null}

      {profile?.fundingReminder ? (
        <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          {profile.fundingReminder}
        </p>
      ) : null}

      {!canUseFunding ? (
        <Card className="border-border bg-muted/20 p-5">
          <p className="text-sm text-muted-foreground">
            Complete Security PIN and payment details below to unlock deposit and withdrawal panels on the dashboard.
          </p>
          <Button type="button" variant="outline" className="mt-3 min-h-11 w-full touch-manipulation" asChild>
            <Link href="/dashboard/security">Open Security & Recovery</Link>
          </Button>
        </Card>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {canUseFunding ? (
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
              Change withdrawal number or PIN (appeal)
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

      {!canUseFunding ? (
        <GlassSection
          title="Security setup"
          description="Set your PIN and payout details here. Each payment method needs the number and registered account holder name."
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
                You can use Add Funds and Withdraw from the dashboard. To change an existing withdrawal number or Security
                PIN, open a Security Appeal.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
