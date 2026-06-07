"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Building2, Check, ChevronLeft, Copy, Loader2, Lock, RefreshCw, Smartphone, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { SmartAmountInput } from "@/components/ui/smart-amount-input"
import { PaymentNetworkBadge, type NetworkBadgeKey } from "@/components/brand/payment-network-badge"
import type { L1FundSource } from "@/components/dashboard/funding-payment-panel"
import {
  type UgMoMoNetwork,
  ugMoMoPayeeForNetwork,
  UG_MTN_RECEIVE,
} from "@/lib/client/ug-momo-payment-rails"

export type NexusGatewayMethod = "mobile_money" | "bank_transfer" | "crypto"
export type NexusGatewayStep = 1 | 2 | 3 | 4
export type PaymentVerificationStatus = "idle" | "pending" | "confirmed" | "failed"

const NEXUS_GATE_EMERALD = "#00b87c"
const NEXUS_GATE_OBSIDIAN = "#0d1117"

type Props = {
  mode: "add" | "withdraw"
  activeSource?: L1FundSource
  onSourceChange?: (source: L1FundSource) => void
  customerFundingCountry?: string
  fundAmount: string
  onFundAmountChange: (value: string) => void
  fundAmountLocale: string
  fundAmountCurrency: string
  minDepositLabel?: string
  amountHint?: string
  showAmountField?: boolean
  isProcessing?: boolean
  t: (key: string) => string
  children?: React.ReactNode
  /** Self-service deposit pipeline (add mode). */
  useSelfServiceFlow?: boolean
  /** Uganda corridor: MTN / Airtel isolated 4-step wizard. */
  useUgNetworkIsolatedFlow?: boolean
  ugMoMoNetwork?: UgMoMoNetwork
  onUgMoMoNetworkChange?: (network: UgMoMoNetwork) => void
  /** Optional Airtel override from `/api/user/funding-payment-config`. */
  ugAirtelAccount?: string
  ugAirtelAccountName?: string
  gatewayStep?: NexusGatewayStep
  onGatewayStepChange?: (step: NexusGatewayStep) => void
  depositTierLabel?: string
  payerPhone?: string
  onPayerPhoneChange?: (value: string) => void
  payerName?: string
  onPayerNameChange?: (value: string) => void
  payeeName?: string
  payeeAccount?: string
  fundTxReference?: string
  onTxReferenceChange?: (value: string) => void
  onProceedToInstructions?: () => boolean | void
  onProceedToProof?: () => boolean | void
  /** Return true to open Step 4 in-card processing after submit. */
  onConfirmPaid?: () => void | boolean | Promise<void | boolean>
  onRefreshPaymentStatus?: () => void | Promise<void>
  paymentVerificationStatus?: PaymentVerificationStatus
  paymentStatusMessage?: string
  /** Nexus login email — shown in MTN MoMo reason / reference step. */
  userEmail?: string
}

function corridorCc(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 2)
}

/** @deprecated Use UG_MTN_RECEIVE — kept for import compatibility. */
export const UG_MOBILE_MONEY_PAYEE = UG_MTN_RECEIVE

export function isUgMobileMoneyCorridor(country: string, source: L1FundSource): boolean {
  return corridorCc(country) === "UG" && gatewayMethodFromFundSource(source) === "mobile_money"
}

export function gatewayMethodFromFundSource(source: L1FundSource): NexusGatewayMethod {
  if (source === "crypto") return "crypto"
  if (source === "local") return "bank_transfer"
  return "mobile_money"
}

export function fundSourceFromGatewayMethod(
  method: NexusGatewayMethod,
  countryCode: string,
): L1FundSource {
  if (method === "crypto") return "crypto"
  if (method === "bank_transfer") return "local"
  const cc = corridorCc(countryCode)
  if (cc === "UG") return "airtel"
  if (cc === "KE") return "mpesa_ke"
  return "local"
}

const METHODS: Array<{
  id: NexusGatewayMethod
  label: string
  sub: string
  icon: typeof Smartphone
  badge: NetworkBadgeKey
}> = [
  {
    id: "mobile_money",
    label: "Mobile Money",
    sub: "MTN · Airtel · M-Pesa",
    icon: Smartphone,
    badge: "MTN",
  },
  {
    id: "bank_transfer",
    label: "Bank Transfer",
    sub: "Institutional desk",
    icon: Building2,
    badge: "BANK",
  },
  {
    id: "crypto",
    label: "Crypto Web3",
    sub: "USDT · On-chain",
    icon: Wallet,
    badge: "USDT",
  },
]

function MtnTabIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="10" fill="#FFCC00" />
      <text x="24" y="30" textAnchor="middle" fontSize="14" fontWeight="700" fill="#1a1a1a">
        MTN
      </text>
    </svg>
  )
}

function AirtelTabIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="10" fill="#ED1C24" />
      <text x="24" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
        Airtel
      </text>
    </svg>
  )
}

function StepIndicator({ step, total }: { step: NexusGatewayStep; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors",
            step >= n ? "bg-emerald-500" : "bg-white/10",
          )}
          aria-hidden
        />
      ))}
    </div>
  )
}

function NetworkPayeeBlock({
  accountLabel,
  account,
  name,
  copied,
  onCopy,
}: {
  accountLabel: string
  account: string
  name: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-[#080b10] p-4">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">Account Name</p>
        <p className="mt-1 text-base font-semibold text-white">{name}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">{accountLabel}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="font-mono text-lg font-semibold text-emerald-300">{account}</p>
          <button
            type="button"
            onClick={() => void onCopy()}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  )
}

function WizardBackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
    >
      <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </button>
  )
}

function MtnMoMoQuickGuide({
  recipientNumber,
  recipientName,
  amountLabel,
  reasonEmail,
}: {
  recipientNumber: string
  recipientName: string
  amountLabel: string
  reasonEmail: string
}) {
  const steps = [
    { title: "Dial the USSD code", detail: "Open your phone dialer and enter *165#." },
    { title: "Select Send Money", detail: "Choose Send Money (usually option 1)." },
    { title: "Choose Mobile User", detail: "Select MTN User or Mobile User." },
    {
      title: "Enter the phone number",
      detail: (
        <>
          Recipient MTN number:{" "}
          <span className="font-mono font-semibold text-[#FFCC00]">{recipientNumber}</span>
          {recipientName ? (
            <>
              {" "}
              · <span className="font-medium text-white">{recipientName}</span>
            </>
          ) : null}
        </>
      ),
    },
    {
      title: "Enter amount",
      detail: (
        <>
          Send exactly{" "}
          <span className="font-mono font-semibold text-emerald-300">{amountLabel || "your Step 1 amount"}</span>.
        </>
      ),
    },
    {
      title: "Enter reason",
      detail: (
        <>
          Use your Nexus login email:{" "}
          <span className="break-all font-medium text-white">{reasonEmail}</span>
        </>
      ),
    },
    { title: "Confirm with PIN", detail: "Enter your Mobile Money PIN to authorize the transfer." },
  ]

  return (
    <div className="rounded-xl border border-[#FFCC00]/30 bg-[#FFCC00]/5 p-3.5 sm:p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#FFCC00]">
        MTN MoMo quick guide
      </p>
      <ol className="mt-3 space-y-2.5">
        {steps.map((item, index) => (
          <li key={item.title} className="flex gap-2.5 text-[11px] leading-snug text-zinc-300">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FFCC00]/20 text-[10px] font-bold text-[#FFCC00]"
              aria-hidden
            >
              {index + 1}
            </span>
            <span>
              <span className="font-semibold text-white">{item.title}.</span> {item.detail}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function NexusPaymentGatewayCard({
  mode,
  activeSource = "crypto",
  onSourceChange,
  customerFundingCountry = "",
  fundAmount,
  onFundAmountChange,
  fundAmountLocale,
  fundAmountCurrency,
  minDepositLabel,
  amountHint,
  showAmountField = true,
  isProcessing = false,
  t,
  children,
  useSelfServiceFlow = true,
  useUgNetworkIsolatedFlow = false,
  ugMoMoNetwork: controlledUgNetwork,
  onUgMoMoNetworkChange,
  ugAirtelAccount,
  ugAirtelAccountName,
  gatewayStep: controlledStep,
  onGatewayStepChange,
  depositTierLabel,
  payerPhone = "",
  onPayerPhoneChange,
  payerName = "",
  onPayerNameChange,
  payeeName,
  payeeAccount,
  fundTxReference = "",
  onTxReferenceChange,
  onProceedToInstructions,
  onProceedToProof,
  onConfirmPaid,
  onRefreshPaymentStatus,
  paymentVerificationStatus = "idle",
  paymentStatusMessage,
  userEmail = "",
}: Props) {
  const [internalStep, setInternalStep] = useState<NexusGatewayStep>(1)
  const [internalUgNetwork, setInternalUgNetwork] = useState<UgMoMoNetwork>("MTN")
  const [copied, setCopied] = useState(false)
  const [countdownTick, setCountdownTick] = useState(0)

  const step = controlledStep ?? internalStep
  const setStep = useCallback(
    (next: NexusGatewayStep) => {
      onGatewayStepChange?.(next)
      if (controlledStep == null) setInternalStep(next)
    },
    [controlledStep, onGatewayStepChange],
  )

  const ugNetwork = controlledUgNetwork ?? internalUgNetwork
  const setUgNetwork = useCallback(
    (next: UgMoMoNetwork) => {
      onUgMoMoNetworkChange?.(next)
      if (controlledUgNetwork == null) setInternalUgNetwork(next)
    },
    [controlledUgNetwork, onUgMoMoNetworkChange],
  )

  const activeMethod = useMemo(
    () => gatewayMethodFromFundSource(activeSource),
    [activeSource],
  )

  const selfService = mode === "add" && useSelfServiceFlow
  const ugIsolated = selfService && useUgNetworkIsolatedFlow
  const stepTotal = ugIsolated ? 4 : 3

  const ugPayee = useMemo(() => {
    const base = ugMoMoPayeeForNetwork(ugNetwork)
    if (ugNetwork === "Airtel") {
      return {
        ...base,
        account: ugAirtelAccount ?? base.account,
        name: ugAirtelAccountName ?? base.name,
      }
    }
    return base
  }, [ugNetwork, ugAirtelAccount, ugAirtelAccountName])

  const legacyCopyPay = !ugIsolated && isUgMobileMoneyCorridor(customerFundingCountry, activeSource)
  const resolvedPayeeName = legacyCopyPay ? (payeeName ?? UG_MTN_RECEIVE.name) : payeeName
  const resolvedPayeeAccount = legacyCopyPay ? (payeeAccount ?? UG_MTN_RECEIVE.account) : payeeAccount
  const showLegacyNativeCopyPay = Boolean(
    legacyCopyPay || (resolvedPayeeName && resolvedPayeeAccount),
  )

  useEffect(() => {
    if (step !== stepTotal || paymentVerificationStatus !== "pending") return
    const id = window.setInterval(() => setCountdownTick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [step, paymentVerificationStatus, stepTotal])

  useEffect(() => {
    if (ugIsolated && step === 4 && paymentVerificationStatus === "pending") {
      void onRefreshPaymentStatus?.()
    }
  }, [ugIsolated, step, paymentVerificationStatus, onRefreshPaymentStatus])

  const copyAccount = useCallback(async (value: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked */
    }
  }, [])

  const title =
    mode === "add" ? t("funding.modal.titleAdd") : t("funding.modal.titleWithdraw")

  const handleProceed = () => {
    const ok = onProceedToInstructions?.()
    if (ok === false) return
    setStep(2)
  }

  const handleSentMoney = () => {
    const ok = onProceedToProof?.()
    if (ok === false) return
    setStep(3)
  }

  const handleConfirmPaid = () => {
    void Promise.resolve(onConfirmPaid?.()).then((result) => {
      if (result === true) setStep(ugIsolated ? 4 : 3)
    })
  }

  const mtnGuideAmountLabel = useMemo(() => {
    if (depositTierLabel?.trim()) return depositTierLabel
    if (fundAmount.trim()) return `${fundAmount} ${fundAmountCurrency}`.trim()
    return ""
  }, [depositTierLabel, fundAmount, fundAmountCurrency])

  const mtnReasonEmail = userEmail.trim() || t("funding.payment.yourLoginEmail")

  const statusLine =
    paymentStatusMessage ??
    (paymentVerificationStatus === "confirmed"
      ? "Payment confirmed — refreshing your Nexus Main balance."
      : paymentVerificationStatus === "failed"
        ? "We could not verify this payment yet. Tap refresh or contact support."
        : ugIsolated && step === 4
          ? "Processing… Expected in 2–10 minutes."
          : "Checking payment status… Expected completion within 2–10 minutes.")

  return (
    <div
      className="relative overflow-hidden rounded-2xl border shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      style={{
        backgroundColor: NEXUS_GATE_OBSIDIAN,
        borderColor: `${NEXUS_GATE_EMERALD}33`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-emerald-500/10 to-transparent"
        aria-hidden
      />

      <div className="relative border-b border-white/5 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
              Nexus Payment Gate
            </p>
            <h3 id="fund-modal-title" className="mt-1 text-base font-semibold text-white sm:text-lg">
              {title}
            </h3>
            <p className="mt-1 text-[11px] leading-snug text-zinc-400">
              {ugIsolated
                ? "Uganda Mobile Money — network-isolated deposit wizard."
                : selfService
                  ? "Self-service deposit — three quick steps."
                  : mode === "add"
                    ? "Secure deposit checkout — native to your Nexus workspace."
                    : "Secure withdrawal gateway — funds route to your verified payout line."}
            </p>
            {selfService ? (
              <div className="mt-3 max-w-xs">
                <StepIndicator step={step} total={stepTotal} />
                <p className="mt-1 text-[10px] text-zinc-500">
                  Step {step} of {stepTotal}
                </p>
              </div>
            ) : null}
          </div>
          <div
            className="flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium text-emerald-300"
            style={{
              borderColor: `${NEXUS_GATE_EMERALD}55`,
              backgroundColor: `${NEXUS_GATE_EMERALD}14`,
            }}
          >
            <Lock className="h-3 w-3" aria-hidden />
            Secured by Nexus Gate
          </div>
        </div>
      </div>

      {ugIsolated && step === 1 ? (
        <div className="relative space-y-4 px-3 py-3 sm:px-4 sm:py-4">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Select network
            </p>
            <div className="grid grid-cols-2 gap-2" role="tablist">
              {(["MTN", "Airtel"] as const).map((network) => {
                const selected = ugNetwork === network
                return (
                  <button
                    key={network}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setUgNetwork(network)}
                    className={cn(
                      "flex min-h-[56px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                      selected
                        ? network === "MTN"
                          ? "border-[#FFCC00]/50 bg-[#FFCC00]/10 shadow-[0_0_20px_rgba(255,204,0,0.12)]"
                          : "border-[#ED1C24]/50 bg-[#ED1C24]/10 shadow-[0_0_20px_rgba(237,28,36,0.12)]"
                        : "border-white/8 bg-white/[0.03] hover:border-emerald-500/25",
                    )}
                  >
                    {network === "MTN" ? (
                      <MtnTabIcon className="h-9 w-9 shrink-0" />
                    ) : (
                      <AirtelTabIcon className="h-9 w-9 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-white">
                      {network === "MTN" ? "MTN Mobile Money" : "Airtel Money"}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {showAmountField ? (
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {t("funding.field.fundingAmount").replace("{{currency}}", fundAmountCurrency)}
              </label>
              <div
                className="rounded-xl border px-3 py-2"
                style={{ borderColor: `${NEXUS_GATE_EMERALD}44`, backgroundColor: "#080b10" }}
              >
                <SmartAmountInput
                  value={fundAmount}
                  onValueChange={onFundAmountChange}
                  locale={fundAmountLocale}
                  currency={fundAmountCurrency}
                  placeholder="0"
                  className="w-full border-0 bg-transparent py-1 font-mono text-xl font-semibold text-white outline-none placeholder:text-zinc-600"
                />
              </div>
              {minDepositLabel ? (
                <p className="mt-1 text-[10px] font-medium text-emerald-400/80">{minDepositLabel}</p>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleProceed}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white shadow-[0_0_24px_rgba(0,184,124,0.2)] hover:bg-emerald-500"
          >
            Proceed to Payment Details
          </button>
        </div>
      ) : null}

      {ugIsolated && step === 2 ? (
        <div className="relative space-y-4 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-center gap-2">
            <PaymentNetworkBadge network={ugNetwork === "MTN" ? "MTN" : "Airtel"} />
            <p className="text-sm font-medium text-white">
              {ugNetwork === "MTN" ? "MTN Mobile Money" : "Airtel Money"} transfer details
            </p>
          </div>

          <NetworkPayeeBlock
            accountLabel={ugPayee.accountLabel}
            account={ugPayee.account}
            name={ugPayee.name}
            copied={copied}
            onCopy={() => void copyAccount(ugPayee.account)}
          />

          {ugNetwork === "MTN" ? (
            <MtnMoMoQuickGuide
              recipientNumber={ugPayee.account}
              recipientName={ugPayee.name}
              amountLabel={mtnGuideAmountLabel}
              reasonEmail={mtnReasonEmail}
            />
          ) : (
            <p className="text-[11px] leading-relaxed text-zinc-400">
              Copy these exact details, open your Airtel Money app, make the manual transfer, and
              return here.
            </p>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
            <WizardBackButton onClick={() => setStep(1)} label="Edit amount" />
            <button
              type="button"
              onClick={handleSentMoney}
              className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              I Have Sent the Money
            </button>
          </div>
        </div>
      ) : null}

      {ugIsolated && step === 3 ? (
        <div className="relative space-y-4 px-3 py-3 sm:px-4 sm:py-4">
          <p className="text-sm font-medium text-white">Confirm your transfer</p>

          {ugNetwork === "MTN" ? (
            <p className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
              Paste the MTN confirmation code from your SMS. Reason on the transfer should match{" "}
              <span className="break-all font-medium text-white">{mtnReasonEmail}</span>.
            </p>
          ) : null}

          {onTxReferenceChange ? (
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Transaction ID / TX Reference Number
              </label>
              <input
                type="text"
                value={fundTxReference}
                onChange={(e) => onTxReferenceChange(e.target.value)}
                placeholder="Paste your network confirmation code"
                autoComplete="off"
                className="w-full rounded-xl border border-white/10 bg-[#080b10] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/40"
              />
            </div>
          ) : null}

          {onPayerNameChange ? (
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Sender&apos;s Mobile Name
              </label>
              <input
                type="text"
                value={payerName}
                onChange={(e) => onPayerNameChange(e.target.value)}
                placeholder="Exact legal name on the wallet you paid from"
                autoComplete="name"
                className="w-full rounded-xl border border-white/10 bg-[#080b10] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/40"
              />
            </div>
          ) : null}

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
            <WizardBackButton onClick={() => setStep(2)} label="Back" />
            <button
              type="button"
              onClick={handleConfirmPaid}
              disabled={isProcessing}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isProcessing ? "Submitting request…" : "Confirm Payment Completed"}
            </button>
          </div>
        </div>
      ) : null}

      {ugIsolated && step === 4 ? (
        <div className="relative space-y-4 px-3 py-4 sm:px-5 sm:py-5">
          <div className="flex items-center gap-3">
            {paymentVerificationStatus === "confirmed" ? (
              <Check className="h-8 w-8 text-emerald-400" aria-hidden />
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" aria-hidden />
            )}
            <div>
              <p className="text-sm font-semibold text-white">{statusLine}</p>
              {paymentVerificationStatus === "pending" ? (
                <p className="mt-1 text-[11px] text-zinc-400">
                  Verifying your {ugNetwork} transfer — typical window 2–10 minutes
                  {countdownTick > 0 ? ` · checking (${countdownTick})` : ""}
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onRefreshPaymentStatus?.()}
            disabled={isProcessing}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", isProcessing && "animate-spin")} aria-hidden />
            Refresh Payment Status
          </button>
        </div>
      ) : null}

      {!ugIsolated && selfService && step === 1 ? (
        <div className="relative space-y-4 px-3 py-3 sm:px-4 sm:py-4">
          {depositTierLabel ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">
                Deposit tier
              </p>
              <p className="mt-0.5 font-mono text-lg font-semibold text-white">{depositTierLabel}</p>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Payment method
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="tablist">
              {METHODS.filter((m) => m.id !== "bank_transfer").map((method) => {
                const selected = activeMethod === method.id
                return (
                  <button
                    key={method.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() =>
                      onSourceChange?.(fundSourceFromGatewayMethod(method.id, customerFundingCountry))
                    }
                    className={cn(
                      "group flex min-h-[64px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                      selected
                        ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_24px_rgba(0,184,124,0.18)]"
                        : "border-white/8 bg-white/[0.03] hover:border-emerald-500/25",
                    )}
                  >
                    <PaymentNetworkBadge network={method.badge} size="md" />
                    <div>
                      <span className="block text-xs font-semibold text-white">{method.label}</span>
                      <span className="text-[10px] text-zinc-500">{method.sub}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {showAmountField ? (
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {t("funding.field.fundingAmount").replace("{{currency}}", fundAmountCurrency)}
              </label>
              <div
                className="rounded-xl border px-3 py-2"
                style={{ borderColor: `${NEXUS_GATE_EMERALD}44`, backgroundColor: "#080b10" }}
              >
                <SmartAmountInput
                  value={fundAmount}
                  onValueChange={onFundAmountChange}
                  locale={fundAmountLocale}
                  currency={fundAmountCurrency}
                  placeholder="0"
                  className="w-full border-0 bg-transparent py-1 font-mono text-xl font-semibold text-white outline-none placeholder:text-zinc-600"
                />
              </div>
              {minDepositLabel ? (
                <p className="mt-1 text-[10px] font-medium text-emerald-400/80">{minDepositLabel}</p>
              ) : null}
            </div>
          ) : null}

          {onPayerPhoneChange ? (
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {t("funding.field.senderPhone")}
              </label>
              <input
                type="tel"
                value={payerPhone}
                onChange={(e) => onPayerPhoneChange(e.target.value)}
                placeholder={t("funding.placeholder.phoneExample")}
                autoComplete="tel"
                className="w-full rounded-xl border border-white/10 bg-[#080b10] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/40"
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleProceed}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white shadow-[0_0_24px_rgba(0,184,124,0.2)] hover:bg-emerald-500"
          >
            Proceed to Instructions
          </button>
        </div>
      ) : null}

      {!ugIsolated && selfService && step === 2 ? (
        <div className="relative space-y-4 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-center gap-2">
            <PaymentNetworkBadge
              network={activeMethod === "crypto" ? "USDT" : activeMethod === "mobile_money" ? "MTN" : "BANK"}
            />
            <p className="text-sm font-medium text-white">{t("funding.payment.instructionPanelTitle")}</p>
          </div>

          {showLegacyNativeCopyPay ? (
            <NetworkPayeeBlock
              accountLabel={legacyCopyPay ? "MTN Account" : "Account number"}
              account={resolvedPayeeAccount ?? ""}
              name={resolvedPayeeName ?? ""}
              copied={copied}
              onCopy={() => void copyAccount(resolvedPayeeAccount ?? "")}
            />
          ) : children ? (
            <div className="nexus-gateway-rail-details space-y-3">{children}</div>
          ) : null}

          {showLegacyNativeCopyPay ? (
            <p className="text-[11px] leading-relaxed text-zinc-400">
              Send the exact amount from Step 1 to this line in your Mobile Money app, then continue.
            </p>
          ) : null}

          {showLegacyNativeCopyPay && onTxReferenceChange ? (
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {t("funding.txRefLabel")}
              </label>
              <input
                type="text"
                value={fundTxReference}
                onChange={(e) => onTxReferenceChange(e.target.value)}
                placeholder={t("funding.payment.txRefPlaceholderCrypto")}
                className="w-full rounded-xl border border-white/10 bg-[#080b10] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/40"
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleConfirmPaid}
            disabled={isProcessing}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isProcessing ? "Submitting request…" : "I Have Paid"}
          </button>
        </div>
      ) : null}

      {!ugIsolated && selfService && step === 3 ? (
        <div className="relative space-y-4 px-3 py-4 sm:px-5 sm:py-5">
          <div className="flex items-center gap-3">
            {paymentVerificationStatus === "confirmed" ? (
              <Check className="h-8 w-8 text-emerald-400" aria-hidden />
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" aria-hidden />
            )}
            <div>
              <p className="text-sm font-semibold text-white">{statusLine}</p>
              {paymentVerificationStatus === "pending" ? (
                <p className="mt-1 text-[11px] text-zinc-400">
                  Awaiting payment — typical window 2–10 minutes
                  {countdownTick > 0 ? ` · checking (${countdownTick})` : ""}
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onRefreshPaymentStatus?.()}
            disabled={isProcessing}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", isProcessing && "animate-spin")} aria-hidden />
            Refresh Payment Status
          </button>
        </div>
      ) : null}

      {!selfService && mode === "add" ? (
        <div className="relative px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Select payment method
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="tablist">
            {METHODS.map((method) => {
              const Icon = method.icon
              const selected = activeMethod === method.id
              return (
                <button
                  key={method.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() =>
                    onSourceChange?.(fundSourceFromGatewayMethod(method.id, customerFundingCountry))
                  }
                  className={cn(
                    "group flex min-h-[72px] flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
                    selected
                      ? "scale-[1.02] border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_24px_rgba(0,184,124,0.18)]"
                      : "border-white/8 bg-white/[0.03] hover:border-emerald-500/25 hover:bg-white/[0.05]",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      selected ? "text-emerald-400" : "text-zinc-400 group-hover:text-emerald-300",
                    )}
                    aria-hidden
                  />
                  <span className="text-xs font-semibold text-white">{method.label}</span>
                  <span className="text-[10px] leading-tight text-zinc-500">{method.sub}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {!selfService && showAmountField ? (
        <div className="relative border-t border-white/5 px-3 py-3 sm:px-4 sm:py-4">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {mode === "withdraw"
              ? t("withdrawal.amountLabel").replace("{{currency}}", fundAmountCurrency)
              : t("funding.field.fundingAmount").replace("{{currency}}", fundAmountCurrency)}
          </label>
          <div
            className="rounded-xl border px-3 py-2 transition-shadow focus-within:shadow-[0_0_0_1px_rgba(0,184,124,0.45)]"
            style={{ borderColor: `${NEXUS_GATE_EMERALD}44`, backgroundColor: "#080b10" }}
          >
            <SmartAmountInput
              value={fundAmount}
              onValueChange={onFundAmountChange}
              locale={fundAmountLocale}
              currency={fundAmountCurrency}
              placeholder="0"
              className="w-full border-0 bg-transparent py-1 font-mono text-xl font-semibold text-white outline-none placeholder:text-zinc-600"
            />
          </div>
          {amountHint ? (
            <p className="mt-1.5 text-[10px] leading-snug text-zinc-500">{amountHint}</p>
          ) : null}
          {minDepositLabel ? (
            <p className="mt-1 text-[10px] font-medium text-emerald-400/80">{minDepositLabel}</p>
          ) : null}
        </div>
      ) : null}

      {!selfService && children ? (
        <div className="relative border-t border-white/5 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">{children}</div>
      ) : null}

      {isProcessing && !selfService && mode !== "withdraw" ? (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#0d1117]/88 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" aria-hidden />
          <p className="text-sm font-medium text-white">Processing secure payment…</p>
          <p className="text-[11px] text-zinc-400">Do not close this window.</p>
        </div>
      ) : null}
    </div>
  )
}
