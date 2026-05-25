"use client"

import { useCallback, useEffect, useState } from "react"
import { Shield, ChevronRight, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabaseClient"
import { SECURITY_CODE_EDUCATION } from "@/lib/nexus-payout-methods"
import type { PublicSecurityProfile } from "@/lib/nexus-security-profile-types"

type Props = {
  onOpenAppealCenter: () => void
}

/** Settings summary only — protected details, link to appeal center. */
export function UserSecurityRecoverySummary({ onOpenAppealCenter }: Props) {
  const [profile, setProfile] = useState<PublicSecurityProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/user/security-profile", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      const j = (await res.json()) as { profile?: PublicSecurityProfile; error?: string }
      if (!res.ok) throw new Error(j.error ?? "Failed to load")
      setProfile(j.profile ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-card/90 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Security & Recovery</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{SECURITY_CODE_EDUCATION}</p>
          </div>
        </div>
      </Card>

      <Card className="border-border/80 bg-muted/10 p-4">
        <h4 className="mb-3 text-sm font-semibold">Your protected details</h4>
        <dl className="grid gap-2 text-xs">
          <div className="flex justify-between gap-2 border-b border-border/40 pb-2">
            <dt className="text-muted-foreground">Security code</dt>
            <dd className="font-mono">••••••</dd>
          </div>
          <div className="flex justify-between gap-2 border-b border-border/40 pb-2">
            <dt className="text-muted-foreground">Deposit number</dt>
            <dd className="font-mono">{profile?.depositNumberMasked ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2 border-b border-border/40 pb-2">
            <dt className="text-muted-foreground">Withdrawal number</dt>
            <dd className="font-mono">{profile?.withdrawalNumberMasked ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Payout method</dt>
            <dd>{profile?.payoutMethod === "crypto_trc20" ? "USDT TRC20" : "Mobile Money"}</dd>
          </div>
          {profile?.payoutMethod === "crypto_trc20" ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Crypto wallet</dt>
              <dd className="font-mono">{profile.cryptoWalletMasked ?? "—"}</dd>
            </div>
          ) : null}
        </dl>
        {profile?.inCooldown ? (
          <p className="mt-3 text-xs text-amber-800 dark:text-amber-100">
            Sensitive changes in cooldown until {profile.cooldownUntil?.slice(0, 10) ?? "review complete"}.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          Payout and security details cannot be edited directly. Submit a secure request for operations review.
        </p>
        <Button
          variant="outline"
          className="mt-4 w-full touch-manipulation justify-between"
          onClick={onOpenAppealCenter}
        >
          Open Security Appeal Center
          <ChevronRight className="h-4 w-4" />
        </Button>
      </Card>
    </div>
  )
}
