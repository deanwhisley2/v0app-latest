"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MessageCircle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabaseClient"
import type { PublicSecurityProfile, SecurityAppealRow } from "@/lib/nexus-security-profile-types"
import {
  fetchSecurityProfilePassive,
  securityProfileDebug,
} from "@/lib/nexus-security-profile-client"

const APPEAL_FETCH_MS = 5_000

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
  const [appealType, setAppealType] = useState<"withdrawal_number" | "security_code">("withdrawal_number")
  const [appealValue, setAppealValue] = useState("")
  const [appealMessage, setAppealMessage] = useState("")
  const loadedRef = useRef(false)

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
    if (!h) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token ?? ""
      const profileResult = token
        ? await fetchSecurityProfilePassive(token)
        : { profile: null, error: "Session expired" }
      setProfile(profileResult.profile)
      if (profileResult.error) setError(profileResult.error)

      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), APPEAL_FETCH_MS)
      try {
        const aRes = await fetch("/api/user/security-change-request", {
          headers: h,
          cache: "no-store",
          signal: controller.signal,
        })
        const aj = (await aRes.json()) as { requests?: SecurityAppealRow[]; error?: string }
        if (aRes.ok) setAppeals(aj.requests ?? [])
      } catch {
        /* appeals list optional */
      } finally {
        window.clearTimeout(timer)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [authHeaders])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    securityProfileDebug("appeal_center_mount")
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

  if (profile?.needsSetup && !loading) {
    return (
      <Card className="border-warning/40 bg-warning/10 p-4">
        <p className="text-sm text-foreground">
          Complete security setup in Settings → Security & Recovery before submitting change requests.
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
          Submit an appeal only to change an existing withdrawal mobile number or an existing Security PIN. First-time
          setup is done instantly in Settings — no appeal needed.
        </p>
        {loading ? <p className="mt-2 text-xs text-muted-foreground">Loading appeal center…</p> : null}
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading ? (
        <>
          <Card className="border-border/80 bg-card p-4">
            <h4 className="mb-3 text-sm font-semibold">New change request</h4>
            <div className="grid gap-2">
              <label className="text-xs text-muted-foreground">Request type</label>
              <select
                value={appealType}
                onChange={(e) => setAppealType(e.target.value as "withdrawal_number" | "security_code")}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                disabled={!profile?.canChangeSensitive}
              >
                <option value="withdrawal_number" disabled={!profile?.hasWithdrawalPayoutLine}>
                  Change withdrawal mobile number
                </option>
                <option value="security_code" disabled={!profile?.hasSecurityCode}>
                  Change Security PIN
                </option>
              </select>
              <Input
                placeholder={appealType === "security_code" ? "New 6-digit PIN" : "New withdrawal mobile number"}
                value={appealValue}
                onChange={(e) =>
                  setAppealValue(
                    appealType === "security_code"
                      ? e.target.value.replace(/\D/g, "").slice(0, 6)
                      : e.target.value,
                  )
                }
                disabled={!profile?.canChangeSensitive}
                inputMode={appealType === "security_code" ? "numeric" : "tel"}
                maxLength={appealType === "security_code" ? 6 : undefined}
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
                disabled={
                  busy ||
                  !profile?.canChangeSensitive ||
                  !appealValue.trim() ||
                  !appealMessage.trim() ||
                  (appealType === "withdrawal_number" && !profile?.hasWithdrawalPayoutLine) ||
                  (appealType === "security_code" && !profile?.hasSecurityCode)
                }
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
        </>
      ) : null}
    </div>
  )
}
