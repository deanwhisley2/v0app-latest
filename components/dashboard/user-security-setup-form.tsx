"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Lock, Wallet } from "lucide-react"
import type { SecurityProfileSetupFields } from "@/lib/nexus-security-profile-types"
import { SecurityNetworkSetupCard } from "@/components/dashboard/security-network-setup-card"
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
import {
  SECURITY_SETUP_FIELD_GROUP_CLASS,
  SECURITY_SETUP_INPUT_CLASS,
} from "@/lib/nexus-security-setup-field-styles"

type Props = {
  variant?: "settings"
  onComplete?: () => void
}

function hydrateNetwork(
  depositNum: string | null | undefined,
  depositNames: string | null | undefined,
  withdrawNum: string | null | undefined,
  withdrawNames: string | null | undefined,
): {
  number: string
  names: string
  same: boolean
  withdrawalNumber: string
  withdrawalNames: string
} {
  const dep = depositNum?.trim() ?? ""
  const wd = withdrawNum?.trim() ?? ""
  const depNames = depositNames?.trim() ?? ""
  const wdNames = withdrawNames?.trim() ?? ""
  if (dep) {
    const same = !wd || wd === dep
    return {
      number: dep,
      names: depNames || wdNames,
      same,
      withdrawalNumber: same ? "" : wd,
      withdrawalNames: same ? "" : wdNames,
    }
  }
  if (wd) {
    return { number: wd, names: wdNames, same: true, withdrawalNumber: "", withdrawalNames: "" }
  }
  return { number: "", names: "", same: true, withdrawalNumber: "", withdrawalNames: "" }
}

function lineOk(num: string, names: string): boolean {
  return num.trim().replace(/\s+/g, "").length >= 8 && Boolean(names.trim())
}

export function UserSecuritySetupForm({ variant = "settings", onComplete }: Props) {
  const [phase, setPhase] = useState<"form" | "success">("form")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [code, setCode] = useState("")
  const [codeConfirm, setCodeConfirm] = useState("")
  const [mtnNumber, setMtnNumber] = useState("")
  const [mtnNames, setMtnNames] = useState("")
  const [mtnSame, setMtnSame] = useState(true)
  const [mtnWithdrawNumber, setMtnWithdrawNumber] = useState("")
  const [mtnWithdrawNames, setMtnWithdrawNames] = useState("")
  const [airtelNumber, setAirtelNumber] = useState("")
  const [airtelNames, setAirtelNames] = useState("")
  const [airtelSame, setAirtelSame] = useState(true)
  const [airtelWithdrawNumber, setAirtelWithdrawNumber] = useState("")
  const [airtelWithdrawNames, setAirtelWithdrawNames] = useState("")
  const [payoutMethod, setPayoutMethod] = useState<NexusPayoutMethod>("mobile_money")
  const [cryptoWallet, setCryptoWallet] = useState("")
  const [hasExistingPin, setHasExistingPin] = useState(false)
  const [prefillLoaded, setPrefillLoaded] = useState(false)

  const applySetupFields = useCallback((fields: SecurityProfileSetupFields) => {
    setHasExistingPin(fields.hasSecurityCode)
    const mtn = hydrateNetwork(
      fields.mtnDepositNumber,
      fields.mtnDepositAccountNames,
      fields.mtnWithdrawalNumber,
      fields.mtnWithdrawalAccountNames,
    )
    setMtnNumber(mtn.number)
    setMtnNames(mtn.names)
    setMtnSame(mtn.same)
    setMtnWithdrawNumber(mtn.withdrawalNumber)
    setMtnWithdrawNames(mtn.withdrawalNames)
    const airtel = hydrateNetwork(
      fields.airtelDepositNumber,
      fields.airtelDepositAccountNames,
      fields.airtelWithdrawalNumber,
      fields.airtelWithdrawalAccountNames,
    )
    setAirtelNumber(airtel.number)
    setAirtelNames(airtel.names)
    setAirtelSame(airtel.same)
    setAirtelWithdrawNumber(airtel.withdrawalNumber)
    setAirtelWithdrawNames(airtel.withdrawalNames)
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

  const buildNetworkPayload = (
    number: string,
    names: string,
    same: boolean,
    withdrawNumber: string,
    withdrawNames: string,
    prefix: "mtn" | "airtel",
  ): Record<string, string> => {
    const depOk = lineOk(number, names)
    if (!depOk) {
      return {
        [`${prefix}_deposit_number`]: "",
        [`${prefix}_deposit_account_names`]: "",
        [`${prefix}_withdrawal_number`]: "",
        [`${prefix}_withdrawal_account_names`]: "",
      }
    }
    const wdOk = !same && lineOk(withdrawNumber, withdrawNames)
    return {
      [`${prefix}_deposit_number`]: number.trim(),
      [`${prefix}_deposit_account_names`]: names.trim(),
      [`${prefix}_withdrawal_number`]: same ? number.trim() : wdOk ? withdrawNumber.trim() : "",
      [`${prefix}_withdrawal_account_names`]: same ? names.trim() : wdOk ? withdrawNames.trim() : "",
    }
  }

  const submitSetup = async () => {
    const mtnDepOk = lineOk(mtnNumber, mtnNames)
    const mtnWdOk = !mtnSame && lineOk(mtnWithdrawNumber, mtnWithdrawNames)
    const airtelDepOk = lineOk(airtelNumber, airtelNames)
    const airtelWdOk = !airtelSame && lineOk(airtelWithdrawNumber, airtelWithdrawNames)
    const anyPayout = mtnDepOk || mtnWdOk || airtelDepOk || airtelWdOk
    const pinOk = code.length === 6 && code === codeConfirm

    if (!anyPayout && !hasExistingPin && !pinOk) {
      setError("Enter your 6-digit Security PIN, or add a payout number with the registered account holder name.")
      return
    }
    if (!anyPayout && hasExistingPin) {
      setError("Add at least one payout number with the registered account holder name.")
      return
    }
    if (anyPayout && !hasExistingPin && !pinOk) {
      setError("Enter matching 6-digit security codes before saving payout details.")
      return
    }
    if (!anyPayout && !hasExistingPin && pinOk) {
      /* PIN-only save — payout lines added later */
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
          ...buildNetworkPayload(mtnNumber, mtnNames, mtnSame, mtnWithdrawNumber, mtnWithdrawNames, "mtn"),
          ...buildNetworkPayload(
            airtelNumber,
            airtelNames,
            airtelSame,
            airtelWithdrawNumber,
            airtelWithdrawNames,
            "airtel",
          ),
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
              Your PIN and mobile-money details are saved. MTN and Airtel are kept separate for accurate deposits and
              withdrawals.
            </p>
            <Button className="mt-4 w-full touch-manipulation sm:w-auto" onClick={() => onComplete?.()}>
              Back to Security & Recovery
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  const hasPrefill = Boolean(mtnNumber || airtelNumber || mtnNames || airtelNames)

  return (
    <Card className="border-primary/25 bg-card p-4 shadow-sm sm:p-5">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Lock className="h-4 w-4 text-primary" aria-hidden />
        Security setup
      </h4>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        Set your 6-digit PIN and register at least one mobile-money network. Use the toggle if deposits and withdrawals
        share the same number.
      </p>

      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      {!prefillLoaded ? (
        <p className="mb-3 text-xs text-muted-foreground" aria-busy="true">
          Loading your saved details…
        </p>
      ) : null}
      {prefillLoaded && hasPrefill ? (
        <p className="mb-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Your saved numbers are pre-filled below.
        </p>
      ) : null}

      <div className="space-y-4">
        <div className={SECURITY_SETUP_FIELD_GROUP_CLASS}>
          <p className="text-xs font-semibold text-foreground">Step 1 — Security PIN</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Tap each box below and enter your 6-digit PIN twice.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-medium text-foreground">
                {hasExistingPin ? "Confirm 6-digit PIN" : "6-digit Nexus Security PIN"}
              </Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={cn(SECURITY_SETUP_INPUT_CLASS, "font-mono tracking-[0.35em] text-center")}
                placeholder="000000"
                autoComplete="off"
                aria-label={hasExistingPin ? "Confirm 6-digit security PIN" : "6-digit Nexus Security PIN"}
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-foreground">
                {hasExistingPin ? "Re-enter PIN" : "Confirm PIN"}
              </Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={codeConfirm}
                onChange={(e) => setCodeConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={cn(SECURITY_SETUP_INPUT_CLASS, "font-mono tracking-[0.35em] text-center")}
                placeholder="000000"
                autoComplete="off"
                aria-label={hasExistingPin ? "Re-enter security PIN" : "Confirm security PIN"}
              />
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-foreground">Step 2 — Mobile money details</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Fill in at least one network. Each field below is a tap-to-type box.
          </p>
        </div>

        <SecurityNetworkSetupCard
          network="MTN"
          number={mtnNumber}
          onNumberChange={setMtnNumber}
          accountNames={mtnNames}
          onAccountNamesChange={setMtnNames}
          sameForDepositWithdraw={mtnSame}
          onSameForDepositWithdrawChange={setMtnSame}
          withdrawalNumber={mtnWithdrawNumber}
          onWithdrawalNumberChange={setMtnWithdrawNumber}
          withdrawalNames={mtnWithdrawNames}
          onWithdrawalNamesChange={setMtnWithdrawNames}
        />

        <SecurityNetworkSetupCard
          network="Airtel"
          number={airtelNumber}
          onNumberChange={setAirtelNumber}
          accountNames={airtelNames}
          onAccountNamesChange={setAirtelNames}
          sameForDepositWithdraw={airtelSame}
          onSameForDepositWithdrawChange={setAirtelSame}
          withdrawalNumber={airtelWithdrawNumber}
          onWithdrawalNumberChange={setAirtelWithdrawNumber}
          withdrawalNames={airtelWithdrawNames}
          onWithdrawalNamesChange={setAirtelWithdrawNames}
        />

        <div>
          <Label className="text-xs text-muted-foreground">Optional: crypto withdrawal</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPayoutMethod("mobile_money")}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-medium touch-manipulation",
                payoutMethod === "mobile_money" ? "border-primary bg-primary/10" : "border-border",
              )}
            >
              Mobile money only
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
              Add USDT TRC20
            </button>
          </div>
          {payoutMethod === "crypto_trc20" ? (
            <div className="mt-2">
              <Input
                value={cryptoWallet}
                onChange={(e) => setCryptoWallet(e.target.value.trim())}
                className={cn(SECURITY_SETUP_INPUT_CLASS, "font-mono text-xs")}
                placeholder="TRC20 wallet address"
              />
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{CRYPTO_WITHDRAWAL_NOTICE}</p>
            </div>
          ) : null}
        </div>
      </div>

      <Button className="mt-5 w-full min-h-[48px] touch-manipulation text-base font-semibold" onClick={() => void submitSetup()} disabled={busy}>
        {busy ? "Saving…" : "Save security setup"}
      </Button>
      {variant === "settings" ? null : null}
    </Card>
  )
}
