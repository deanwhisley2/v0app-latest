"use client"

import { useCallback, useEffect, useState } from "react"
import { Shield, Lock, Smartphone, Wallet, MessageCircle, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabaseClient"
import { CRYPTO_WITHDRAWAL_NOTICE, SECURITY_CODE_EDUCATION } from "@/lib/nexus-payout-methods"
import { isValidTrc20UsdtAddress } from "@/lib/nexus-payout-methods"
import type { NexusPayoutMethod } from "@/lib/nexus-payout-methods"
import { cn } from "@/lib/utils"

type PublicProfile = {
  hasSecurityCode: boolean
  needsSetup: boolean
  payoutMethod: NexusPayoutMethod
  depositNumberMasked: string | null
  withdrawalNumberMasked: string | null
  cryptoWalletMasked: string | null
  cooldownUntil: string | null
  inCooldown: boolean
  canChangeSensitive: boolean
}

type AppealRow = {
  id: string
  request_type: string
  status: string
  new_value_masked: string
  thread_id: string | null
  created_at: string
}

export function UserSecuritySettingsPanel({
  onOpenSupportThread,
}: {
  onOpenSupportThread?: (threadId: string) => void
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [appeals, setAppeals] = useState<AppealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [setupMode, setSetupMode] = useState(false)
  const [code, setCode] = useState("")
  const [codeConfirm, setCodeConfirm] = useState("")
  const [deposit, setDeposit] = useState("")
  const [withdrawal, setWithdrawal] = useState("")
  const [payoutMethod, setPayoutMethod] = useState<NexusPayoutMethod>("mobile_money")
  const [cryptoWallet, setCryptoWallet] = useState("")

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
      const pj = (await pRes.json()) as { profile?: PublicProfile; error?: string }
      const aj = (await aRes.json()) as { requests?: AppealRow[] }
      if (!pRes.ok) throw new Error(pj.error ?? "Failed to load security profile")
      setProfile(pj.profile ?? null)
      setAppeals(aj.requests ?? [])
      setSetupMode(Boolean(pj.profile?.needsSetup))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [authHeaders])

  useEffect(() => {
    void reload()
  }, [reload])

  const submitSetup = async () => {
    if (code.length !== 6 || code !== codeConfirm) {
      setError("Enter matching 6-digit security codes.")
      return
    }
    if (payoutMethod === "crypto_trc20" && !isValidTrc20UsdtAddress(cryptoWallet)) {
      setError("Enter a valid USDT TRC20 (TRON) wallet address.")
      return
    }
    const h = await authHeaders()
    if (!h) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/user/security-profile", {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          security_code: code,
          deposit_number: deposit,
          withdrawal_number: withdrawal,
          payout_method: payoutMethod,
          crypto_wallet: payoutMethod === "crypto_trc20" ? cryptoWallet : undefined,
        }),
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? "Setup failed")
      setCode("")
      setCodeConfirm("")
      await reload()
      setSetupMode(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed")
    } finally {
      setBusy(false)
    }
  }

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

      {setupMode || profile?.needsSetup ? (
        <Card className="border-primary/30 bg-card p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4" />
            Create Nexus Security Code
          </h4>
          <p className="mb-4 text-xs text-muted-foreground">
            Required before trading, funding, or withdrawals. Your code is stored securely and never shown again.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">6-digit security code</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-1 font-mono tracking-widest"
                autoComplete="off"
              />
            </div>
            <div>
              <Label className="text-xs">Confirm code</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={codeConfirm}
                onChange={(e) => setCodeConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-1 font-mono tracking-widest"
                autoComplete="off"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Deposit number (MTN/Airtel for adding funds)</Label>
              <Input value={deposit} onChange={(e) => setDeposit(e.target.value)} className="mt-1" placeholder="+256…" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Withdrawal number (receives payouts)</Label>
              <Input
                value={withdrawal}
                onChange={(e) => setWithdrawal(e.target.value)}
                className="mt-1"
                placeholder="+256…"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Default payout method</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPayoutMethod("mobile_money")}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-medium touch-manipulation",
                    payoutMethod === "mobile_money" ? "border-primary bg-primary/10" : "border-border",
                  )}
                >
                  <Smartphone className="mr-1 inline h-3.5 w-3.5" />
                  Mobile Money
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutMethod("crypto_trc20")}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-medium touch-manipulation",
                    payoutMethod === "crypto_trc20" ? "border-primary bg-primary/10" : "border-border",
                  )}
                >
                  <Wallet className="mr-1 inline h-3.5 w-3.5" />
                  USDT TRC20
                </button>
              </div>
            </div>
            {payoutMethod === "crypto_trc20" ? (
              <div className="sm:col-span-2 space-y-2">
                <Label className="text-xs">TRON TRC20 USDT wallet</Label>
                <Input value={cryptoWallet} onChange={(e) => setCryptoWallet(e.target.value.trim())} className="mt-1 font-mono text-xs" />
                <p className="text-[10px] leading-relaxed text-amber-900/90 dark:text-amber-100">{CRYPTO_WITHDRAWAL_NOTICE}</p>
              </div>
            ) : null}
          </div>
          <Button className="mt-4 w-full touch-manipulation" onClick={() => void submitSetup()} disabled={busy}>
            {busy ? "Saving…" : "Activate security profile"}
          </Button>
        </Card>
      ) : (
        <>
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
          </Card>

          <Card className="border-border/80 bg-card p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <MessageCircle className="h-4 w-4" />
              Security Appeal Center
            </h4>
            <p className="mb-3 text-xs text-muted-foreground">
              Request account detail updates — operations reviews every change. You cannot edit payout details directly.
            </p>
            <div className="grid gap-2">
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
                placeholder="New value (masked in history)"
                value={appealValue}
                onChange={(e) => setAppealValue(e.target.value)}
                disabled={!profile?.canChangeSensitive}
              />
              <textarea
                rows={3}
                placeholder="Explain why this change is needed…"
                value={appealMessage}
                onChange={(e) => setAppealMessage(e.target.value)}
                disabled={!profile?.canChangeSensitive}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <Button
                size="sm"
                onClick={() => void submitAppeal()}
                disabled={busy || !profile?.canChangeSensitive || !appealValue.trim() || !appealMessage.trim()}
              >
                Submit secure appeal
              </Button>
            </div>
            {appeals.length > 0 ? (
              <ul className="mt-4 space-y-2 border-t border-border/50 pt-3">
                {appeals.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      {a.request_type} · {a.status}
                    </span>
                    {a.thread_id ? (
                      <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        onClick={() => onOpenSupportThread?.(a.thread_id!)}
                      >
                        Open thread
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </>
      )}
    </div>
  )
}
