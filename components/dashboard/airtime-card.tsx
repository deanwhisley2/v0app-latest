"use client"

import { useState, useEffect } from "react"
import {
  Smartphone,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Shield,
  Lock,
  ChevronRight,
  Wallet,
  Phone,
  User,
  DollarSign,
  ArrowLeft,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabaseClient"

type AirtimeNetwork = "mtn" | "airtel" | "safaricom" | "other"

interface AirtimeCardProps {
  /** Earnings balance available for airtime */
  earningsBalance: number
  /** Called when dialog should close */
  onClose: () => void
  /** Called after successful submission */
  onSuccess?: (message: string) => void
}

const NETWORKS: { id: AirtimeNetwork; label: string; countries: string[] }[] = [
  { id: "mtn", label: "MTN", countries: ["UG", "GH", "CM", "CI", "ZA"] },
  { id: "airtel", label: "Airtel", countries: ["UG", "KE", "MW", "ZM", "CD"] },
  { id: "safaricom", label: "Safaricom", countries: ["KE"] },
  { id: "other", label: "Other Network", countries: ["*"] },
]

const CURRENCIES = [
  { code: "KES", label: "KES (Kenyan Shilling)", flag: "🇰🇪" },
  { code: "UGX", label: "UGX (Ugandan Shilling)", flag: "🇺🇬" },
]

const MIN_AIRTIME_LOCAL: Record<string, number> = {
  KES: 70,
  UGX: 2000,
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`
}

export function AirtimeCard({ earningsBalance, onClose, onSuccess }: AirtimeCardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [network, setNetwork] = useState<AirtimeNetwork | null>(null)
  const [currency, setCurrency] = useState<"KES" | "UGX">("KES")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [accountNames, setAccountNames] = useState("")
  const [amountLocal, setAmountLocal] = useState("")
  const [securityPin, setSecurityPin] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submittedRequest, setSubmittedRequest] = useState<Record<string, unknown> | null>(null)

  // Reset error on step change
  useEffect(() => { setError(null) }, [step])

  // Estimate USD value
  const usdEstimate = (() => {
    const local = Number(amountLocal) || 0
    if (local <= 0) return 0
    const rate = currency === "KES" ? 130 : 3700
    return Math.round((local / rate) * 100) / 100
  })()

  const minLocal = MIN_AIRTIME_LOCAL[currency]
  const isValidAmount = Number(amountLocal) >= minLocal
  const earningsSufficient = usdEstimate <= earningsBalance

  const canProceedToStep2 = network !== null
  const canProceedToStep3 =
    phoneNumber.replace(/[\s\-\(\)]/g, "").length >= 7 &&
    accountNames.trim().length >= 2 &&
    isValidAmount &&
    earningsSufficient
  const canProceedToStep4 = securityPin.length === 6

  const handleSubmit = async () => {
    if (!network || !canProceedToStep4) return

    setIsSubmitting(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setError("Please sign in again."); setIsSubmitting(false); return }

      const res = await fetch("/api/user/airtime", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amountLocal: Number(amountLocal),
          localCurrency: currency,
          network: network.toUpperCase(),
          phoneNumber: phoneNumber.replace(/[\s\-\(\)]/g, ""),
          accountNames: accountNames.trim(),
          securityCode: securityPin,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? "Airtime request failed")
      }

      setSuccess(true)
      setSubmittedRequest(data)
      setIsSubmitting(false)

      onSuccess?.(`Airtime request submitted! ${Number(amountLocal)} ${currency} on ${network?.toUpperCase()}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit airtime request")
      setIsSubmitting(false)
    }
  }

  // Success screen
  if (success) {
    return (
      <div className="mx-auto max-w-sm">
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
            <Check className="h-8 w-8 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Airtime Request Submitted!</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Your request for {String(submittedRequest?.amountLocal ?? amountLocal)} {currency} on {String(network?.toUpperCase() ?? "")} is pending admin approval.
          </p>
          <div className="mt-4 rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-3 text-left text-sm">
            <div className="flex justify-between py-1">
              <span className="text-zinc-400">Amount</span>
              <span className="font-medium text-white">{amountLocal} {currency}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-zinc-400">Network</span>
              <span className="font-medium text-white">{network?.toUpperCase()}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-zinc-400">Phone</span>
              <span className="font-medium text-white">{phoneNumber}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-zinc-400">Status</span>
              <span className="flex items-center gap-1 font-medium text-amber-400">
                <Clock className="h-3.5 w-3.5" /> Pending
              </span>
            </div>
          </div>
          <Button
            onClick={onClose}
            className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Done
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15">
            <Smartphone className="h-4.5 w-4.5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Buy Airtime</h3>
            <p className="text-[11px] text-zinc-500">Cash out earnings as mobile airtime</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Balance reminder */}
      <div className="mb-4 rounded-xl border border-zinc-700/50 bg-zinc-800/20 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">Earnings balance</span>
          <span className="font-mono font-semibold text-emerald-400">{formatUsd(earningsBalance)}</span>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="mb-5 flex items-center gap-1.5">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium transition-colors",
                step === s
                  ? "bg-emerald-500/20 text-emerald-400"
                  : step > s
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "bg-zinc-800 text-zinc-500",
              )}
            >
              {step > s ? <Check className="h-3 w-3" /> : s}
            </div>
            {s < 4 && <div className={cn("h-px w-5", step > s ? "bg-emerald-500/30" : "bg-zinc-800")} />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Network & Currency */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Select Network</p>
          <div className="grid grid-cols-2 gap-3">
            {NETWORKS.map((n) => (
              <button
                key={n.id}
                onClick={() => { setNetwork(n.id); setError(null) }}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all",
                  network === n.id
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                    : "border-zinc-700/50 bg-zinc-800/20 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/40",
                )}
              >
                <Smartphone className={cn("h-6 w-6", network === n.id ? "text-emerald-400" : "text-zinc-400")} />
                {n.label}
              </button>
            ))}
          </div>

          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Currency</p>
          <div className="grid grid-cols-2 gap-3">
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                onClick={() => setCurrency(c.code as "KES" | "UGX")}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all",
                  currency === c.code
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                    : "border-zinc-700/50 bg-zinc-800/20 text-zinc-300 hover:border-zinc-600",
                )}
              >
                <span className="text-lg">{c.flag}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          <Button
            onClick={() => setStep(2)}
            disabled={!canProceedToStep2}
            className="mt-2 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            Continue
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 2: Phone Number & Amount */}
      {step === 2 && (
        <div className="space-y-4">
          <button
            onClick={() => setStep(1)}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </button>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <User className="h-3.5 w-3.5" /> Account Holder Name(s)
            </label>
            <Input
              value={accountNames}
              onChange={(e) => setAccountNames(e.target.value)}
              placeholder="e.g. John Doe"
              className="h-11 rounded-xl border-zinc-700 bg-zinc-800/30 text-sm text-white placeholder:text-zinc-500"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <Phone className="h-3.5 w-3.5" /> Phone Number ({network?.toUpperCase()})
            </label>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g. 0772123456"
              inputMode="tel"
              className="h-11 rounded-xl border-zinc-700 bg-zinc-800/30 text-sm text-white placeholder:text-zinc-500"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <DollarSign className="h-3.5 w-3.5" /> Amount ({currency})
            </label>
            <Input
              value={amountLocal}
              onChange={(e) => setAmountLocal(e.target.value)}
              placeholder={`Min ${minLocal.toLocaleString()} ${currency}`}
              inputMode="numeric"
              className="h-11 rounded-xl border-zinc-700 bg-zinc-800/30 text-sm text-white placeholder:text-zinc-500"
            />
            {Number(amountLocal) > 0 && (
              <p className="mt-1.5 text-xs text-zinc-500">
                ≈ {formatUsd(usdEstimate)} @ {currency === "KES" ? "130 KES" : "3,700 UGX"}/USD
                {!earningsSufficient && usdEstimate > 0 && (
                  <span className="ml-1 text-red-400">(exceeds balance)</span>
                )}
              </p>
            )}
            {Number(amountLocal) > 0 && !isValidAmount && (
              <p className="mt-1.5 text-xs text-red-400">
                Minimum amount is {minLocal.toLocaleString()} {currency}
              </p>
            )}
          </div>

          <Button
            onClick={() => setStep(3)}
            disabled={!canProceedToStep3}
            className="mt-2 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            Review
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-4">
          <button
            onClick={() => setStep(2)}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </button>

          <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/20 p-4">
            <h4 className="mb-3 text-sm font-semibold text-white">Review Your Request</h4>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Network</span>
                <span className="font-medium text-white">{network?.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Currency</span>
                <span className="font-medium text-white">{currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Phone Number</span>
                <span className="font-medium text-white">{phoneNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Account Name</span>
                <span className="font-medium text-white">{accountNames}</span>
              </div>
              <div className="border-t border-zinc-700/50 pt-2">
                <div className="flex justify-between text-base">
                  <span className="text-zinc-300">Amount</span>
                  <span className="font-bold text-white">{amountLocal} {currency}</span>
                </div>
                <p className="mt-0.5 text-right text-xs text-zinc-500">≈ {formatUsd(usdEstimate)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-xs leading-relaxed text-amber-200/80">
                This amount will be deducted from your earnings balance and sent as mobile airtime. Request is subject to admin approval.
              </p>
            </div>
          </div>

          <Button
            onClick={() => setStep(4)}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Enter Security PIN
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 4: Security PIN & Submit */}
      {step === 4 && (
        <div className="space-y-4">
          <button
            onClick={() => setStep(3)}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </button>

          <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/20 p-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <Shield className="h-6 w-6 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-white">Confirm with Security PIN</p>
            <p className="mt-1 text-xs text-zinc-500">
              Enter your 6-digit Nexus PIN to authorize this airtime purchase
            </p>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <Lock className="h-3.5 w-3.5" /> 6-Digit Security PIN
            </label>
            <Input
              value={securityPin}
              onChange={(e) => setSecurityPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="• • • • • •"
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              className="h-12 rounded-xl border-zinc-700 bg-zinc-800/30 text-center text-lg tracking-[0.3em] text-white placeholder:text-zinc-600"
            />
          </div>

          <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/20 p-3 text-xs text-zinc-400">
            <p className="flex items-start gap-2">
              <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span>
                <strong className="text-zinc-300">{amountLocal} {currency}</strong> on <strong className="text-zinc-300">{network?.toUpperCase()}</strong> will be sent to <strong className="text-zinc-300">{phoneNumber}</strong>
              </span>
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!canProceedToStep4 || isSubmitting}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                Confirm & Submit
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
