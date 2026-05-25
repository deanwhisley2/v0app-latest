"use client"

import { useState } from "react"
import { Check, Lock, Smartphone, Wallet } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabaseClient"
import {
  CRYPTO_WITHDRAWAL_NOTICE,
  isValidTrc20UsdtAddress,
  type NexusPayoutMethod,
} from "@/lib/nexus-payout-methods"
import { cn } from "@/lib/utils"

type Props = {
  /** Gate blocks dashboard until continue; settings stays on security screen. */
  variant?: "gate" | "settings"
  onComplete?: () => void
}

/** First-time mandatory setup only — no appeals, no support threads. */
export function UserSecuritySetupForm({ variant = "gate", onComplete }: Props) {
  const [phase, setPhase] = useState<"form" | "success">("form")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [code, setCode] = useState("")
  const [codeConfirm, setCodeConfirm] = useState("")
  const [deposit, setDeposit] = useState("")
  const [withdrawal, setWithdrawal] = useState("")
  const [payoutMethod, setPayoutMethod] = useState<NexusPayoutMethod>("mobile_money")
  const [cryptoWallet, setCryptoWallet] = useState("")

  const submitSetup = async () => {
    if (code.length !== 6 || code !== codeConfirm) {
      setError("Enter matching 6-digit security codes.")
      return
    }
    if (!deposit.trim() || !withdrawal.trim()) {
      setError("Deposit and withdrawal numbers are required.")
      return
    }
    if (payoutMethod === "crypto_trc20" && !isValidTrc20UsdtAddress(cryptoWallet)) {
      setError("Enter a valid USDT TRC20 (TRON) wallet address.")
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setError("Session expired. Please sign in again.")
      return
    }

    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/user/security-profile", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
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
      setPhase("success")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed")
    } finally {
      setBusy(false)
    }
  }

  if (phase === "success") {
    return (
      <Card className="border-emerald-500/35 bg-emerald-500/5 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
            <Check className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-foreground">Security setup completed</h4>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Your Nexus Security Code and payout details are saved. You can request changes later through
              Security Appeal Center.
            </p>
            <Button
              className="mt-4 w-full touch-manipulation sm:w-auto"
              onClick={() => onComplete?.()}
            >
              {variant === "gate" ? "Continue to dashboard" : "Back to Security & Recovery"}
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="border-primary/30 bg-card p-4 shadow-sm">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Lock className="h-4 w-4" />
        Security setup
      </h4>
      <p className="mb-4 text-xs text-muted-foreground">
        Required before trading, funding, or withdrawals. Your code is stored securely and never shown again.
      </p>
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
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
          <div className="space-y-2 sm:col-span-2">
            <Label className="text-xs">TRON TRC20 USDT wallet</Label>
            <Input
              value={cryptoWallet}
              onChange={(e) => setCryptoWallet(e.target.value.trim())}
              className="mt-1 font-mono text-xs"
            />
            <p className="text-[10px] leading-relaxed text-amber-900/90 dark:text-amber-100">
              {CRYPTO_WITHDRAWAL_NOTICE}
            </p>
          </div>
        ) : null}
      </div>
      <Button className="mt-4 w-full touch-manipulation" onClick={() => void submitSetup()} disabled={busy}>
        {busy ? "Saving…" : "Save security setup"}
      </Button>
    </Card>
  )
}
