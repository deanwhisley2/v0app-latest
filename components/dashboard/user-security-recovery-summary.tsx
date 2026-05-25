"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Shield, ChevronRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabaseClient"
import { SECURITY_CODE_EDUCATION } from "@/lib/nexus-payout-methods"
import type { PublicSecurityProfile } from "@/lib/nexus-security-profile-types"
import {
  fetchSecurityProfilePassive,
  securityProfileDebug,
} from "@/lib/nexus-security-profile-client"

type Props = {
  /** Separate route — appeal center never mounts during dashboard render. */
  appealCenterHref: string
}

/** Settings summary only — protected details, link to appeal center. */
export function UserSecurityRecoverySummary({ appealCenterHref }: Props) {
  const [profile, setProfile] = useState<PublicSecurityProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadedRef = useRef(false)

  const reload = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const result = await fetchSecurityProfilePassive(token)
    setProfile(result.profile)
    setError(result.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    securityProfileDebug("recovery_summary_mount")
    void reload()
  }, [reload])

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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card className="border-border/80 bg-muted/10 p-4">
        <h4 className="mb-3 text-sm font-semibold">Your protected details</h4>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading protected details…</p>
        ) : (
          <>
            <dl className="grid gap-2 text-xs">
              <div className="flex justify-between gap-2 border-b border-border/40 pb-2">
                <dt className="text-muted-foreground">Security code</dt>
                <dd className="font-mono">••••••</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-border/40 pb-2">
                <dt className="text-muted-foreground">Deposit number</dt>
                <dd className="font-mono text-right">{profile?.depositNumberMasked ?? "—"}</dd>
              </div>
              {profile?.depositAccountNames ? (
                <div className="flex justify-between gap-2 border-b border-border/40 pb-2">
                  <dt className="text-muted-foreground">Deposit names</dt>
                  <dd className="text-right">{profile.depositAccountNames}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2 border-b border-border/40 pb-2">
                <dt className="text-muted-foreground">Withdrawal number</dt>
                <dd className="font-mono text-right">{profile?.withdrawalNumberMasked ?? "—"}</dd>
              </div>
              {profile?.withdrawalAccountNames ? (
                <div className="flex justify-between gap-2 border-b border-border/40 pb-2">
                  <dt className="text-muted-foreground">Withdrawal names</dt>
                  <dd className="text-right">{profile.withdrawalAccountNames}</dd>
                </div>
              ) : null}
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
          </>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Payout and security details cannot be edited directly. Submit a secure request for operations review.
        </p>
        <Button variant="outline" className="mt-4 w-full touch-manipulation justify-between" asChild>
          <Link href={appealCenterHref}>
            Open Security Appeal Center
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </Card>
    </div>
  )
}
