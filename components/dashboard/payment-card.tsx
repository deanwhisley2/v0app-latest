"use client"

import { useState, useMemo, useCallback } from "react"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Smartphone,
  Wallet,
  DollarSign,
  Check,
  X,
  AlertTriangle,
  Shield,
  Lock,
  ChevronRight,
  Loader2,
  Copy,
  Building2,
  CreditCard,
  User,
  Phone,
  Eye,
  EyeOff,
  ArrowLeft,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabaseClient"

type PaymentMode = "deposit" | "withdraw" | "airtime"

type AirtimeNetwork = "mtn" | "airtel" | "safaricom" | "other"

interface PaymentCardProps {
  /** Initial mode */
  initialMode?: PaymentMode
  /** Nexus Main balance for withdraw mode */
  mainBalance?: number
  /** Earnings balance for airtime mode */
  earningsBalance?: number
  /** Called when closed/minimized */
  onClose?: () => void
}

const NETWORKS: { id: AirtimeNetwork; label: string }[] = [
  { id: "mtn", label: "MTN" },
  { id: "airtel", label: "Airtel" },
  { id: "safaricom", label: "Safaricom" },
  { id: "other", label: "Other" },
]

const CURRENCIES = [
  { code: "KES", label: "KES", flag: "🇰🇪" },
  { code: "UGX", label: "UGX", flag: "🇺🇬" },
]

const MIN_AIRTIME_LOCAL: Record<string, number> = { KES: 70, UGX: 2000 }

function localToUsd(amount: number, currency: string): number {
  const rate = currency === "KES" ? 130 : 3700
  return Math.round((amount / rate) * 100) / 100
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

/**
 * Fast inline payment card — no modals, no portals, no backdrop overlays.
 * Renders as a plain <div> within the normal document flow.
 */
export function PaymentCard({
  initialMode = "deposit",
  mainBalance = 0,
  earningsBalance = 0,
  onClose,
}: PaymentCardProps) {
  const [mode, setMode] = useState<PaymentMode>(initialMode)

  // ── Shared fields ──
  const [amount, setAmount] = useState("")
  const [showPreview, setShowPreview] = useState(true)
  // Per-field visibility: true = visible, false = masked
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({})

  const toggleField = useCallback((key: string) => {
    setVisibleFields(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const isFieldVisible = useCallback((key: string): boolean => {
    return visibleFields[key] !== false
  }, [visibleFields])

  // ── Withdraw fields ──
  const [withdrawMethod, setWithdrawMethod] = useState<"mobile" | "bank" | "crypto">("mobile")
  const [withdrawPhone, setWithdrawPhone] = useState("")
  const [withdrawName, setWithdrawName] = useState("")
  const [withdrawPin, setWithdrawPin] = useState("")

  // ── Deposit fields ──
  const [depositMethod, setDepositMethod] = useState<"mobile" | "bank" | "crypto">("mobile")
  const [depositName, setDepositName] = useState("")
  const [depositNumber, setDepositNumber] = useState("")

  // ── Airtime fields ──
  const [airNetwork, setAirNetwork] = useState<AirtimeNetwork | null>(null)
  const [airCurrency, setAirCurrency] = useState<"KES" | "UGX">("KES")
  const [airPhone, setAirPhone] = useState("")
  const [airName, setAirName] = useState("")
  const [airAmountLocal, setAirAmountLocal] = useState("")
  const [airPin, setAirPin] = useState("")

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [successMsg, setSuccessMsg] = useState("")

  const airLocal = Number(airAmountLocal) || 0
  const airUsd = localToUsd(airLocal, airCurrency)
  const airMinLocal = MIN_AIRTIME_LOCAL[airCurrency]
  const airValid = airLocal >= airMinLocal && airUsd <= earningsBalance
  const airCanSubmit = airNetwork && airPhone.replace(/\D/g, "").length >= 7 && airName.trim().length >= 2 && airValid && airPin.length === 6

  // ── Live preview data ──
  const previewData = useMemo(() => {
    if (mode === "deposit") {
      return [
        depositName.trim() && { label: "Name", value: depositName },
        depositNumber.trim() && { label: "Account/Phone", value: depositNumber },
        Number(amount) > 0 && { label: "Amount", value: `${formatUsd(Number(amount))}` },
        depositMethod && { label: "Method", value: depositMethod.toUpperCase() },
      ].filter(Boolean) as { label: string; value: string }[]
    }
    if (mode === "withdraw") {
      return [
        withdrawName.trim() && { label: "Name", value: withdrawName },
        withdrawPhone.trim() && { label: "Phone", value: withdrawPhone },
        Number(amount) > 0 && { label: "Amount", value: `${formatUsd(Number(amount))}` },
        withdrawMethod && { label: "Method", value: withdrawMethod.toUpperCase() },
      ].filter(Boolean) as { label: string; value: string }[]
    }
    if (mode === "airtime") {
      return [
        airName.trim() && { label: "Name", value: airName },
        airPhone.trim() && { label: "Phone", value: airPhone },
        airLocal > 0 && { label: "Amount", value: `${airLocal.toLocaleString()} ${airCurrency} (≈ ${formatUsd(airUsd)})` },
        airNetwork && { label: "Network", value: airNetwork.toUpperCase() },
      ].filter(Boolean) as { label: string; value: string }[]
    }
    return []
  }, [mode, amount, depositName, depositNumber, depositMethod, withdrawName, withdrawPhone, withdrawMethod, airName, airPhone, airLocal, airCurrency, airUsd, airNetwork])

  const reset = () => {
    setAmount(""); setError(null); setSuccess(false); setSuccessMsg("")
    setWithdrawPhone(""); setWithdrawName(""); setWithdrawPin("")
    setDepositName(""); setDepositNumber("")
    setAirNetwork(null); setAirPhone(""); setAirName(""); setAirAmountLocal(""); setAirPin("")
  }

  // ── Handlers ──
  const handleAirtimeSubmit = async () => {
    if (!airNetwork || !airCanSubmit) return
    setIsSubmitting(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setError("Please sign in again."); setIsSubmitting(false); return }
      const res = await fetch("/api/user/airtime", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amountLocal: airLocal,
          localCurrency: airCurrency,
          network: airNetwork.toUpperCase(),
          phoneNumber: airPhone.replace(/\D/g, ""),
          accountNames: airName.trim(),
          securityCode: airPin,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Airtime request failed")
      setSuccess(true)
      setSuccessMsg(`Airtime request submitted! ${airLocal} ${airCurrency} on ${airNetwork.toUpperCase()}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally { setIsSubmitting(false) }
  }

  const presetAmounts = mode === "deposit" ? [100, 250, 500, 1000] : mode === "withdraw" ? [25, 50, 100, 200] : []

  return (
    <div className="nexus-payment-card w-full max-w-md space-y-3">
      {/* ── Tab switcher ── */}
      <div className="flex gap-1.5 rounded-xl bg-muted/50 p-1">
        {(["deposit", "withdraw", "airtime"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); reset() }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-all",
              mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "deposit" && <ArrowDownLeft className="h-3.5 w-3.5" />}
            {m === "withdraw" && <ArrowUpRight className="h-3.5 w-3.5" />}
            {m === "airtime" && <Smartphone className="h-3.5 w-3.5" />}
            {m === "deposit" ? "Deposit" : m === "withdraw" ? "Withdraw" : "Airtime"}
          </button>
        ))}
      </div>

      {/* ── Live preview strip ── */}
      {showPreview && previewData.length > 0 && (
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-3.5 py-2.5 text-xs">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">Live preview</span>
            <button type="button" onClick={() => setShowPreview(false)} className="text-zinc-500 hover:text-zinc-300">
              <EyeOff className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-0.5">
            {previewData.map((d, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="text-zinc-500">{d.label}</span>
                <span className="font-medium text-zinc-200 truncate max-w-[60%] text-right">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">{error}</div>
      )}

      {/* ── Success ── */}
      {success ? (
        <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 p-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
            <Check className="h-6 w-6 text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-white">Submitted!</p>
          <p className="mt-1 text-xs text-zinc-400">{successMsg}</p>
          <Button onClick={reset} className="mt-4 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
            New transaction
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          {/* ── DEPOSIT ── */}
          {mode === "deposit" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <User className="h-3.5 w-3.5" /> Account Holder Name
                  <button type="button" onClick={() => toggleField("dname")} className="ml-auto text-zinc-500 hover:text-zinc-300">
                    {isFieldVisible("dname") ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </label>
                <Input value={depositName} onChange={(e) => setDepositName(e.target.value)}
                  type={isFieldVisible("dname") ? "text" : "password"}
                  placeholder="e.g. John Doe"
                  className="h-10 rounded-xl border-border bg-background text-sm" />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> Phone / Account Number
                  <button type="button" onClick={() => toggleField("dphone")} className="ml-auto text-zinc-500 hover:text-zinc-300">
                    {isFieldVisible("dphone") ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </label>
                <Input value={depositNumber} onChange={(e) => setDepositNumber(e.target.value)}
                  type={isFieldVisible("dphone") ? "text" : "password"}
                  placeholder="e.g. 0772123456"
                  className="h-10 rounded-xl border-border bg-background text-sm" />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" /> Amount (USD)
                  <button type="button" onClick={() => toggleField("damt")} className="ml-auto text-zinc-500 hover:text-zinc-300">
                    {isFieldVisible("damt") ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)}
                  type={isFieldVisible("damt") ? "text" : "password"}
                  placeholder="0.00" inputMode="decimal"
                  className="h-10 rounded-xl border-border bg-background text-sm font-mono" />
                <div className="mt-1.5 flex gap-1.5">
                  {presetAmounts.map((p) => (
                    <button key={p} type="button" onClick={() => setAmount(String(p))}
                      className="flex-1 rounded-lg bg-muted py-1.5 text-xs font-medium hover:bg-muted/80">
                      ${p}
                    </button>
                  ))}
                </div>
              </div>
              <Button disabled={!depositName.trim() || !depositNumber.trim() || !Number(amount)}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">
                <ArrowDownLeft className="mr-1.5 h-4 w-4" /> Submit Deposit
              </Button>
            </div>
          )}

          {/* ── WITHDRAW ── */}
          {mode === "withdraw" && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/30 p-3 text-xs">
                <span className="text-muted-foreground">Nexus Main: </span>
                <span className="font-mono font-semibold text-foreground">{formatUsd(mainBalance)}</span>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <User className="h-3.5 w-3.5" /> Account Holder Name
                  <button type="button" onClick={() => toggleField("wname")} className="ml-auto text-zinc-500 hover:text-zinc-300">
                    {isFieldVisible("wname") ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </label>
                <Input value={withdrawName} onChange={(e) => setWithdrawName(e.target.value)}
                  type={isFieldVisible("wname") ? "text" : "password"}
                  placeholder="e.g. John Doe"
                  className="h-10 rounded-xl border-border bg-background text-sm" />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> Phone Number
                  <button type="button" onClick={() => toggleField("wphone")} className="ml-auto text-zinc-500 hover:text-zinc-300">
                    {isFieldVisible("wphone") ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </label>
                <Input value={withdrawPhone} onChange={(e) => setWithdrawPhone(e.target.value)}
                  type={isFieldVisible("wphone") ? "text" : "password"}
                  placeholder="e.g. 0772123456" inputMode="tel"
                  className="h-10 rounded-xl border-border bg-background text-sm" />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" /> Amount (USD)
                  <button type="button" onClick={() => toggleField("wamt")} className="ml-auto text-zinc-500 hover:text-zinc-300">
                    {isFieldVisible("wamt") ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)}
                  type={isFieldVisible("wamt") ? "text" : "password"}
                  placeholder="0.00" inputMode="decimal"
                  className="h-10 rounded-xl border-border bg-background text-sm font-mono" />
                <div className="mt-1.5 flex gap-1.5">
                  {presetAmounts.map((p) => (
                    <button key={p} type="button" onClick={() => setAmount(String(p))}
                      className="flex-1 rounded-lg bg-muted py-1.5 text-xs font-medium hover:bg-muted/80">
                      ${p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> Security PIN
                  <button type="button" onClick={() => toggleField("wpin")} className="ml-auto text-zinc-500 hover:text-zinc-300">
                    {isFieldVisible("wpin") ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </label>
                <Input value={withdrawPin} onChange={(e) => setWithdrawPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="• • • • • •" type={isFieldVisible("wpin") ? "text" : "password"} inputMode="numeric" maxLength={6}
                  className="h-10 rounded-xl border-border bg-background text-center text-lg tracking-[0.3em] text-sm" />
              </div>
              <Button disabled={!withdrawName.trim() || !withdrawPhone.trim() || !Number(amount) || withdrawPin.length !== 6}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">
                <ArrowUpRight className="mr-1.5 h-4 w-4" /> Submit Withdrawal
              </Button>
            </div>
          )}

          {/* ── AIRTIME ── */}
          {mode === "airtime" && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/30 p-3 text-xs">
                <span className="text-muted-foreground">Earnings: </span>
                <span className="font-mono font-semibold text-emerald-400">{formatUsd(earningsBalance)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {NETWORKS.map((n) => (
                  <button key={n.id} type="button" onClick={() => setAirNetwork(n.id)}
                    className={cn("rounded-xl border p-2.5 text-xs font-medium transition-all text-center",
                      airNetwork === n.id ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-border bg-background text-muted-foreground hover:border-zinc-500"
                    )}>
                    {n.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                {CURRENCIES.map((c) => (
                  <button key={c.code} type="button" onClick={() => setAirCurrency(c.code as "KES" | "UGX")}
                    className={cn("flex-1 rounded-xl border p-2 text-xs font-medium transition-all",
                      airCurrency === c.code ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-border bg-background text-muted-foreground"
                    )}>
                    {c.flag} {c.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <User className="h-3.5 w-3.5" /> Account Name
                  <button type="button" onClick={() => toggleField("aname")} className="ml-auto text-zinc-500 hover:text-zinc-300">
                    {isFieldVisible("aname") ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </label>
                <Input value={airName} onChange={(e) => setAirName(e.target.value)}
                  type={isFieldVisible("aname") ? "text" : "password"}
                  placeholder="e.g. John Doe"
                  className="h-10 rounded-xl border-border bg-background text-sm" />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> Phone Number
                  <button type="button" onClick={() => toggleField("aphone")} className="ml-auto text-zinc-500 hover:text-zinc-300">
                    {isFieldVisible("aphone") ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </label>
                <Input value={airPhone} onChange={(e) => setAirPhone(e.target.value)}
                  type={isFieldVisible("aphone") ? "text" : "password"}
                  placeholder="e.g. 0772123456" inputMode="tel"
                  className="h-10 rounded-xl border-border bg-background text-sm" />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" /> Amount ({airCurrency})
                  <button type="button" onClick={() => toggleField("aamt")} className="ml-auto text-zinc-500 hover:text-zinc-300">
                    {isFieldVisible("aamt") ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </label>
                <Input value={airAmountLocal} onChange={(e) => setAirAmountLocal(e.target.value)}
                  placeholder={`Min ${airMinLocal.toLocaleString()} ${airCurrency}`} inputMode="numeric"
                  className="h-10 rounded-xl border-border bg-background text-sm font-mono" />
                {airLocal > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    ≈ {formatUsd(airUsd)}
                    {airUsd > earningsBalance && <span className="ml-1 text-red-400">(exceeds earnings)</span>}
                    {airLocal > 0 && airLocal < airMinLocal && <span className="ml-1 text-red-400">(min {airMinLocal})</span>}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> Security PIN
                  <button type="button" onClick={() => toggleField("apin")} className="ml-auto text-zinc-500 hover:text-zinc-300">
                    {isFieldVisible("apin") ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </label>
                <Input value={airPin} onChange={(e) => setAirPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="• • • • • •" type={isFieldVisible("apin") ? "text" : "password"} inputMode="numeric" maxLength={6}
                  className="h-10 rounded-xl border-border bg-background text-center text-lg tracking-[0.3em] text-sm" />
              </div>
              <Button disabled={!airCanSubmit || isSubmitting}
                onClick={() => void handleAirtimeSubmit()}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">
                {isSubmitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : <><Smartphone className="mr-1.5 h-4 w-4" /> Submit Airtime Request</>}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
