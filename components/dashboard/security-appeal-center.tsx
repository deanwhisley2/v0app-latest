"use client"

import { useCallback, useEffect, useState } from "react"
import { MessageCircle, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabaseClient"
import type { PublicSecurityProfile, SecurityAppealRow } from "@/lib/nexus-security-profile-types"

type Props = {
  onOpenSupportThread?: (threadId: string) => void
}

/** Dedicated appeal flow — only mounted when user opens Security Appeal Center. */
export function SecurityAppealCenter({ onOpenSupportThread }: Props) {
  const [profile, setProfile] = useState<PublicSecurityProfile | null>(null)
  const [appeals, setAppeals] = useState<SecurityAppealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [appealType, setAppealType] = useState("withdrawal_number")
  const [appealValue, setAppealValue] = useState("")
  const [appealMessage, setAppealMessage] = useState("")

  const authHeaders = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return null
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } as HeadersInit
  }, [])

  const reload = useCallback(async () => {
    const h = await authHeaders()
    if (!h) return
    setLoading(true)
    setError(null)
    try {
      const [pRes, aRes] = await Promise.all([
        fetch("/api/user/security-profile", { headers: h, cache: "no-store" }),
        fetch("/api/user/security-change-request", { headers: h, cache: "no-store" }),
      ])
      const pj = (await pRes.json()) as { profile?: PublicSecurityProfile; error?: string }
      const aj = (await aRes.json()) as { requests?: SecurityAppealRow[] }
      if (!pRes.ok) throw new Error(pj.error ?? "Failed to load security profile")
      setProfile(pj.profile ?? null)
      setAppeals(aj.requests ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [authHeaders])

  useEffect(() => {
    void reload()
  }, [reload])

  const submitAppeal = async () => {
    const h = await authHeaders()
    if (!h) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/user/security-change-request", {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          request_type: appealType,
          new_value: appealValue,
          message: appealMessage,
        }),
      })
      const j = (await res.json()) as { error?: string; threadId?: string }
      if (!res.ok) throw new Error(j.error ?? "Appeal failed")
      setAppealValue("")
      setAppealMessage("")
      await reload()
      if (j.threadId) onOpenSupportThread?.(j.threadId)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Appeal failed")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (profile?.needsSetup) {
    return (
      <Card className="border-warning/40 bg-warning/10 p-4">
        <p className="text-sm text-foreground">
          Complete security setup before submitting change requests.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <MessageCircle className="h-5 w-5 text-primary" />
          Security Appeal Center
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Request payout or security detail updates. Operations reviews every change in a secure thread.
        </p>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card className="border-border/80 bg-card p-4">
        <h4 className="mb-3 text-sm font-semibold">New change request</h4>
        <div className="grid gap-2">
          <label className="text-xs text-muted-foreground">Request type</label>
          <select
            value={appealType}
            onChange={(e) => setAppealType(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            disabled={!profile?.canChangeSensitive}
          >
            <option value="withdrawal_number">Withdrawal number</option>
            <option value="deposit_number">Deposit number</option>
            <option value="crypto_wallet">Crypto wallet</option>
            <option value="payout_method">Payout method</option>
            <option value="security_code">Security code</option>
          </select>
          <Input
            placeholder="New value"
            value={appealValue}
            onChange={(e) => setAppealValue(e.target.value)}
            disabled={!profile?.canChangeSensitive}
          />
          <textarea
            rows={4}
            placeholder="Explain why this change is needed…"
            value={appealMessage}
            onChange={(e) => setAppealMessage(e.target.value)}
            disabled={!profile?.canChangeSensitive}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <Button
            size="sm"
            className="touch-manipulation"
            onClick={() => void submitAppeal()}
            disabled={busy || !profile?.canChangeSensitive || !appealValue.trim() || !appealMessage.trim()}
          >
            Submit secure appeal
          </Button>
        </div>
        {!profile?.canChangeSensitive && profile?.inCooldown ? (
          <p className="mt-3 text-xs text-amber-800 dark:text-amber-100">
            Changes are paused during review cooldown until {profile.cooldownUntil?.slice(0, 10)}.
          </p>
        ) : null}
      </Card>

      {appeals.length > 0 ? (
        <Card className="border-border/80 bg-muted/10 p-4">
          <h4 className="mb-3 text-sm font-semibold">Your appeals</h4>
          <ul className="space-y-2">
            {appeals.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/80 px-3 py-2 text-xs"
              >
                <span>
                  <span className="font-medium capitalize">{a.request_type.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground"> · {a.status}</span>
                </span>
                {a.thread_id ? (
                  <button
                    type="button"
                    className="font-semibold text-primary underline-offset-2 hover:underline touch-manipulation"
                    onClick={() => onOpenSupportThread?.(a.thread_id!)}
                  >
                    Open conversation
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
