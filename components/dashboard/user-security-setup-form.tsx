"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Lock, Smartphone, Wallet } from "lucide-react"
import type { SecurityProfileSetupFields } from "@/lib/nexus-security-profile-types"
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
  /** Settings-only form — no dashboard gate variant. */
  variant?: "settings"
  onComplete?: () => void
}

/** First-time setup — isolated page only, no global gating. */
export function UserSecuritySetupForm({ variant = "settings", onComplete }: Props) {
  const [phase, setPhase] = useState<"form" | "success">("form")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [code, setCode] = useState("")
  const [codeConfirm, setCodeConfirm] = useState("")
  const [deposit, setDeposit] = useState("")
  const [depositNames, setDepositNames] = useState("")
  const [withdrawal, setWithdrawal] = useState("")
  const [withdrawalNames, setWithdrawalNames] = useState("")
  const [payoutMethod, setPayoutMethod] = useState<NexusPayoutMethod>("mobile_money")
  const [cryptoWallet, setCryptoWallet] = useState("")
  const [hasExistingPin, setHasExistingPin] = useState(false)
  const [prefillLoaded, setPrefillLoaded] = useState(false)

  const applySetupFields = useCallback((fields: SecurityProfileSetupFields) => {
    setHasExistingPin(fields.hasSecurityCode)
    if (fields.depositNumber) setDeposit(fields.depositNumber)
    if (fields.depositAccountNames) setDepositNames(fields.depositAccountNames)
    if (fields.withdrawalNumber) setWithdrawal(fields.withdrawalNumber)
    if (fields.withdrawalAccountNames) setWithdrawalNames(fields.withdrawalAccountNames)
    if (fields.cryptoWallet) {
      setCryptoWallet(fields.cryptoWallet)
      setPayoutMethod("crypto_trc20")
    }
    if (fields.depositNumber && !fields.withdrawalNumber) {
      setWithdrawal(fields.depositNumber)
      if (fields.depositAccountNames && !fields.withdrawalAccountNames) {
        setWithdrawalNames(fields.depositAccountNames)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) {
          if (!cancelled) setPrefillLoaded(true)
          return
        }
        const res = await fetch("/api/user/security-profile", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        const j = (await res.json().catch(() => ({}))) as {
          setupFields?: SecurityProfileSetupFields
          error?: string
        }
        if (!cancelled && res.ok && j.setupFields) {
          applySetupFields(j.setupFields)
        }
      } catch {
        /* ignore — form still works empty */
      } finally {
        if (!cancelled) setPrefillLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applySetupFields])

  const submitSetup = async () => {
    if (code.length !== 6 || code !== codeConfirm) {
      setError("Enter matching 6-digit security codes.")
      return
    }
    const depositTrim = deposit.trim()
    const withdrawalTrim = withdrawal.trim()
    const depositOk = depositTrim.replace(/\s+/g, "").length >= 8
    const withdrawalOk = withdrawalTrim.replace(/\s+/g, "").length >= 8
    if (!depositOk && !withdrawalOk) {
      setError("Enter at least one mobile money number (8+ digits). You may add the second number later.")
      return
    }
    if (depositOk && !depositNames.trim()) {
      setError("Registered account names are required for the deposit number.")
      return
    }
    if (withdrawalOk && !withdrawalNames.trim()) {
      setError("Registered account names are required for the withdrawal number.")
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
          deposit_number: depositOk ? depositTrim : "",
          withdrawal_number: withdrawalOk ? withdrawalTrim : "",
          deposit_account_names: depositOk ? depositNames.trim() : "",
          withdrawal_account_names: withdrawalOk ? withdrawalNames.trim() : "",
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
              Your Nexus Security PIN and payout details are saved and locked. Verify carefully — changes require
              Security Appeal review.
            </p>
            <Button
              className="mt-4 w-full touch-manipulation sm:w-auto"
              onClick={() => onComplete?.()}
            >
              Back to Security & Recovery
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
        Security setup (required for Add Funds & Withdraw)
      </h4>
      <p className="mb-4 text-xs text-muted-foreground">
        Set your 6-digit PIN and at least one mobile money number. You may use the same number for deposit and
        withdrawal. Optional TRC20 wallet can be added now or later via appeal.
      </p>
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      {!prefillLoaded ? (
        <p className="mb-3 text-xs text-muted-foreground" aria-busy="true">
          Loading your saved details…
        </p>
      ) : null}
      {prefillLoaded && (deposit || withdrawal || depositNames || withdrawalNames) ? (
        <p className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          Registered numbers and names from your account are pre-filled below. Update only what you need, then save.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">
            {hasExistingPin ? "Confirm 6-digit Nexus Security PIN" : "6-digit Nexus Security PIN"}
          </Label>
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
          <Label className="text-xs">{hasExistingPin ? "Re-enter PIN" : "Confirm PIN"}</Label>
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
          <Label className="text-xs">MTN / Airtel number (deposits)</Label>
          <Input value={deposit} onChange={(e) => setDeposit(e.target.value)} className="mt-1" placeholder="+256…" />
          <Input
            value={depositNames}
            onChange={(e) => setDepositNames(e.target.value)}
            className="mt-2"
            placeholder="Registered account names (e.g. RICHARD KATO)"
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">MTN / Airtel number (withdrawals)</Label>
          <Input
            value={withdrawal}
            onChange={(e) => setWithdrawal(e.target.value)}
            className="mt-1"
            placeholder="+256… (optional if same as deposit)"
          />
          <Input
            value={withdrawalNames}
            onChange={(e) => setWithdrawalNames(e.target.value)}
            className="mt-2"
            placeholder="Registered account names"
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
              USDT TRC20 (optional)
            </button>
          </div>
        </div>
        {payoutMethod === "crypto_trc20" ? (
          <div className="space-y-2 sm:col-span-2">
            <Label className="text-xs">TRON TRC20 USDT wallet (optional)</Label>
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
      {variant === "settings" ? null : null}
    </Card>
  )
}
