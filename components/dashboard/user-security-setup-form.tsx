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
  variant?: "settings"
  onComplete?: () => void
}

function NetworkBlock({
  title,
  number,
  onNumber,
  names,
  onNames,
  numberPlaceholder,
}: {
  title: string
  number: string
  onNumber: (v: string) => void
  names: string
  onNames: (v: string) => void
  numberPlaceholder: string
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-muted/15 p-3">
      <p className="mb-2 text-xs font-semibold text-foreground">{title}</p>
      <Label className="text-[10px] text-muted-foreground">Mobile money number</Label>
      <Input
        value={number}
        onChange={(e) => onNumber(e.target.value)}
        className="mt-1"
        placeholder={numberPlaceholder}
        inputMode="tel"
        autoComplete="tel"
      />
      <Label className="mt-2 block text-[10px] text-muted-foreground">Registered account name(s)</Label>
      <Input
        value={names}
        onChange={(e) => onNames(e.target.value)}
        className="mt-1"
        placeholder="e.g. RICHARD KATO"
        autoComplete="name"
      />
    </div>
  )
}

export function UserSecuritySetupForm({ variant = "settings", onComplete }: Props) {
  const [phase, setPhase] = useState<"form" | "success">("form")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [code, setCode] = useState("")
  const [codeConfirm, setCodeConfirm] = useState("")
  const [mtnDeposit, setMtnDeposit] = useState("")
  const [mtnDepositNames, setMtnDepositNames] = useState("")
  const [airtelDeposit, setAirtelDeposit] = useState("")
  const [airtelDepositNames, setAirtelDepositNames] = useState("")
  const [mtnWithdrawal, setMtnWithdrawal] = useState("")
  const [mtnWithdrawalNames, setMtnWithdrawalNames] = useState("")
  const [airtelWithdrawal, setAirtelWithdrawal] = useState("")
  const [airtelWithdrawalNames, setAirtelWithdrawalNames] = useState("")
  const [payoutMethod, setPayoutMethod] = useState<NexusPayoutMethod>("mobile_money")
  const [cryptoWallet, setCryptoWallet] = useState("")
  const [hasExistingPin, setHasExistingPin] = useState(false)
  const [prefillLoaded, setPrefillLoaded] = useState(false)

  const applySetupFields = useCallback((fields: SecurityProfileSetupFields) => {
    setHasExistingPin(fields.hasSecurityCode)
    if (fields.mtnDepositNumber) setMtnDeposit(fields.mtnDepositNumber)
    if (fields.mtnDepositAccountNames) setMtnDepositNames(fields.mtnDepositAccountNames)
    if (fields.airtelDepositNumber) setAirtelDeposit(fields.airtelDepositNumber)
    if (fields.airtelDepositAccountNames) setAirtelDepositNames(fields.airtelDepositAccountNames)
    if (fields.mtnWithdrawalNumber) setMtnWithdrawal(fields.mtnWithdrawalNumber)
    if (fields.mtnWithdrawalAccountNames) setMtnWithdrawalNames(fields.mtnWithdrawalAccountNames)
    if (fields.airtelWithdrawalNumber) setAirtelWithdrawal(fields.airtelWithdrawalNumber)
    if (fields.airtelWithdrawalAccountNames) setAirtelWithdrawalNames(fields.airtelWithdrawalAccountNames)
    if (fields.cryptoWallet) {
      setCryptoWallet(fields.cryptoWallet)
      setPayoutMethod("crypto_trc20")
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
        }
        if (!cancelled && res.ok && j.setupFields) {
          applySetupFields(j.setupFields)
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setPrefillLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applySetupFields])

  const lineOk = (num: string, names: string) =>
    num.trim().replace(/\s+/g, "").length >= 8 && Boolean(names.trim())

  const submitSetup = async () => {
    if (code.length !== 6 || code !== codeConfirm) {
      setError("Enter matching 6-digit security codes.")
      return
    }
    const mtnDepOk = lineOk(mtnDeposit, mtnDepositNames)
    const airtelDepOk = lineOk(airtelDeposit, airtelDepositNames)
    const mtnWdOk = lineOk(mtnWithdrawal, mtnWithdrawalNames)
    const airtelWdOk = lineOk(airtelWithdrawal, airtelWithdrawalNames)
    if (!mtnDepOk && !airtelDepOk && !mtnWdOk && !airtelWdOk) {
      setError("Enter at least one MTN or Airtel number (8+ digits) with registered account name(s).")
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
          mtn_deposit_number: mtnDepOk ? mtnDeposit.trim() : "",
          mtn_deposit_account_names: mtnDepOk ? mtnDepositNames.trim() : "",
          airtel_deposit_number: airtelDepOk ? airtelDeposit.trim() : "",
          airtel_deposit_account_names: airtelDepOk ? airtelDepositNames.trim() : "",
          mtn_withdrawal_number: mtnWdOk ? mtnWithdrawal.trim() : "",
          mtn_withdrawal_account_names: mtnWdOk ? mtnWithdrawalNames.trim() : "",
          airtel_withdrawal_number: airtelWdOk ? airtelWithdrawal.trim() : "",
          airtel_withdrawal_account_names: airtelWdOk ? airtelWithdrawalNames.trim() : "",
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
              Your PIN and MTN/Airtel payout details are saved. The system will use the correct network for each
              transaction.
            </p>
            <Button className="mt-4 w-full touch-manipulation sm:w-auto" onClick={() => onComplete?.()}>
              Back to Security & Recovery
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  const hasPrefill =
    mtnDeposit || airtelDeposit || mtnWithdrawal || airtelWithdrawal || mtnDepositNames || airtelDepositNames

  return (
    <Card className="border-primary/30 bg-card p-4 shadow-sm">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Lock className="h-4 w-4" />
        Security setup (required for Add Funds & Withdraw)
      </h4>
      <p className="mb-4 text-xs text-muted-foreground">
        Set your 6-digit PIN and register MTN and Airtel numbers separately so deposits and withdrawals use the correct
        network. You only need one line to start; add the rest anytime.
      </p>
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      {!prefillLoaded ? (
        <p className="mb-3 text-xs text-muted-foreground" aria-busy="true">
          Loading your saved details…
        </p>
      ) : null}
      {prefillLoaded && hasPrefill ? (
        <p className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          Saved MTN and Airtel details are pre-filled below when available.
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
        <div className="space-y-3 sm:col-span-2">
          <NetworkBlock
            title="MTN — deposits"
            number={mtnDeposit}
            onNumber={setMtnDeposit}
            names={mtnDepositNames}
            onNames={setMtnDepositNames}
            numberPlaceholder="+256… MTN"
          />
          <NetworkBlock
            title="Airtel — deposits"
            number={airtelDeposit}
            onNumber={setAirtelDeposit}
            names={airtelDepositNames}
            onNames={setAirtelDepositNames}
            numberPlaceholder="+256… Airtel"
          />
          <NetworkBlock
            title="MTN — withdrawals"
            number={mtnWithdrawal}
            onNumber={setMtnWithdrawal}
            names={mtnWithdrawalNames}
            onNames={setMtnWithdrawalNames}
            numberPlaceholder="+256… MTN (optional if same as deposit)"
          />
          <NetworkBlock
            title="Airtel — withdrawals"
            number={airtelWithdrawal}
            onNumber={setAirtelWithdrawal}
            names={airtelWithdrawalNames}
            onNames={setAirtelWithdrawalNames}
            numberPlaceholder="+256… Airtel (optional if same as deposit)"
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
