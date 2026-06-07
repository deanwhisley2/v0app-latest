"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Building2, Check, Copy, Loader2, Lock, RefreshCw, Smartphone, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { SmartAmountInput } from "@/components/ui/smart-amount-input"
import { PaymentNetworkBadge, type NetworkBadgeKey } from "@/components/brand/payment-network-badge"
import type { L1FundSource } from "@/components/dashboard/funding-payment-panel"

export type NexusGatewayMethod = "mobile_money" | "bank_transfer" | "crypto"
export type NexusGatewayStep = 1 | 2 | 3
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
  /** 3-step self-service deposit pipeline (add mode). */
  useSelfServiceFlow?: boolean
  gatewayStep?: NexusGatewayStep
  onGatewayStepChange?: (step: NexusGatewayStep) => void
  depositTierLabel?: string
  payerPhone?: string
  onPayerPhoneChange?: (value: string) => void
  payeeName?: string
  payeeAccount?: string
  fundTxReference?: string
  onTxReferenceChange?: (value: string) => void
  onProceedToInstructions?: () => boolean | void
  /** Return true only when Step 3 in-card polling should open (default: close after submit). */
  onConfirmPaid?: () => void | boolean | Promise<void | boolean>
  onRefreshPaymentStatus?: () => void | Promise<void>
  paymentVerificationStatus?: PaymentVerificationStatus
  paymentStatusMessage?: string
}

function corridorCc(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 2)
}

/** Uganda MoMo self-service rail — structured copy & pay (Step 2). */
export const UG_MOBILE_MONEY_PAYEE = {
  account: "0791226253",
  name: "Jamadah Kayemba",
} as const

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

function StepIndicator({ step }: { step: NexusGatewayStep }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map((n) => (
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
  gatewayStep: controlledStep,
  onGatewayStepChange,
  depositTierLabel,
  payerPhone = "",
  onPayerPhoneChange,
  payeeName,
  payeeAccount,
  fundTxReference = "",
  onTxReferenceChange,
  onProceedToInstructions,
  onConfirmPaid,
  onRefreshPaymentStatus,
  paymentVerificationStatus = "idle",
  paymentStatusMessage,
}: Props) {
  const [internalStep, setInternalStep] = useState<NexusGatewayStep>(1)
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

  const activeMethod = useMemo(
    () => gatewayMethodFromFundSource(activeSource),
    [activeSource],
  )

  const selfService = mode === "add" && useSelfServiceFlow

  const ugMobileCopyPay = isUgMobileMoneyCorridor(customerFundingCountry, activeSource)
  const resolvedPayeeName = ugMobileCopyPay
    ? (payeeName ?? UG_MOBILE_MONEY_PAYEE.name)
    : payeeName
  const resolvedPayeeAccount = ugMobileCopyPay
    ? (payeeAccount ?? UG_MOBILE_MONEY_PAYEE.account)
    : payeeAccount
  const showNativeCopyPay = Boolean(
    ugMobileCopyPay || (resolvedPayeeName && resolvedPayeeAccount),
  )

  useEffect(() => {
    if (step !== 3 || paymentVerificationStatus !== "pending") return
    const id = window.setInterval(() => setCountdownTick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [step, paymentVerificationStatus])

  const copyAccount = useCallback(async () => {
    if (!resolvedPayeeAccount) return
    try {
      await navigator.clipboard.writeText(resolvedPayeeAccount)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked */
    }
  }, [resolvedPayeeAccount])

  const title =
    mode === "add" ? t("funding.modal.titleAdd") : t("funding.modal.titleWithdraw")

  const handleProceed = () => {
    const ok = onProceedToInstructions?.()
    if (ok === false) return
    setStep(2)
  }

  const handleConfirmPaid = () => {
    void Promise.resolve(onConfirmPaid?.()).then((result) => {
      if (result === true) setStep(3)
    })
  }

  const statusLine =
    paymentStatusMessage ??
    (paymentVerificationStatus === "confirmed"
      ? "Payment confirmed — refreshing your Nexus Main balance."
      : paymentVerificationStatus === "failed"
        ? "We could not verify this payment yet. Tap refresh or contact support."
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
              {selfService
                ? "Self-service deposit — three quick steps."
                : mode === "add"
                  ? "Secure deposit checkout — native to your Nexus workspace."
                  : "Secure withdrawal gateway — funds route to your verified payout line."}
            </p>
            {selfService ? (
              <div className="mt-3 max-w-xs">
                <StepIndicator step={step} />
                <p className="mt-1 text-[10px] text-zinc-500">Step {step} of 3</p>
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

      {selfService && step === 1 ? (
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

      {selfService && step === 2 ? (
        <div className="relative space-y-4 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-center gap-2">
            <PaymentNetworkBadge
              network={activeMethod === "crypto" ? "USDT" : activeMethod === "mobile_money" ? "MTN" : "BANK"}
            />
            <p className="text-sm font-medium text-white">{t("funding.payment.instructionPanelTitle")}</p>
          </div>

          {showNativeCopyPay ? (
            <div className="space-y-3 rounded-xl border border-white/10 bg-[#080b10] p-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {ugMobileCopyPay ? "Account Name" : "Receiving name"}
                </p>
                <p className="mt-1 text-base font-semibold text-white">{resolvedPayeeName}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {ugMobileCopyPay ? "MTN Account" : "Account number"}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="font-mono text-lg font-semibold text-emerald-300">{resolvedPayeeAccount}</p>
                  <button
                    type="button"
                    onClick={() => void copyAccount()}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          ) : children ? (
            <div className="nexus-gateway-rail-details space-y-3">{children}</div>
          ) : null}

          {showNativeCopyPay ? (
            <p className="text-[11px] leading-relaxed text-zinc-400">
              Send the exact amount from Step 1 to this MTN line in your Mobile Money app, then tap
              &ldquo;I Have Paid&rdquo;.
            </p>
          ) : null}

          {showNativeCopyPay && onTxReferenceChange ? (
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

      {selfService && step === 3 ? (
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
