"use client"

import { useCallback, useEffect, useState } from "react"
import QRCode from "qrcode"
import { Check, ChevronDown, Copy, Smartphone, Wallet } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

const FALLBACK_TRC20_ADDRESS = "TYqESCZz8xcN5TZTdEDtRsbjNmhPWrVTNe"

type PaymentConfig = {
  globalCrypto: {
    network: string
    walletAddress: string
    binanceDeepLink: string
    warning: string
    autoVerify?: boolean
    minConfirmations?: number
  }
  ugandaAirtel: {
    merchantId: string
    merchantName: string
    legalPayeeName: string
    networkMerchantNamesHint: string
    ussdPrefix: string
    referenceHint: string
  }
}

export type L1FundSource = "pick" | "crypto" | "airtel" | "local"

type Props = {
  activeSource: L1FundSource
  onSourceChange: (s: L1FundSource) => void
  userEmail: string
  fundTxReference: string
  onTxReferenceChange: (v: string) => void
  fundPayerName?: string
  onPayerNameChange?: (v: string) => void
  fundPayerPhone?: string
  onPayerPhoneChange?: (v: string) => void
  /** When set with onFundAmountChange, amount field is rendered in crypto flow (compact mobile layout). */
  fundAmount?: string
  onFundAmountChange?: (v: string) => void
  /** e.g. "Minimum: UGX 20,000" — customer-safe, no FX samples */
  minDepositLabel?: string
  /** Pre-submit server check message (customer-safe). */
  txReferenceError?: string | null
  onTxReferenceBlur?: () => void
  t: (key: string) => string
}

const CARD_TRIGGER =
  "flex w-full min-h-[52px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all sm:min-h-0 sm:px-4 sm:py-3"
const CARD_INACTIVE = "border-border bg-muted/30 hover:bg-muted/50"
const LABEL_ROW = "flex min-w-0 flex-1 items-center gap-2"
const NETWORK_BADGE = "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"

export function FundingPaymentPanel({
  activeSource,
  onSourceChange,
  userEmail,
  fundTxReference,
  onTxReferenceChange,
  fundPayerName = "",
  onPayerNameChange,
  fundPayerPhone = "",
  onPayerPhoneChange,
  fundAmount = "",
  onFundAmountChange,
  minDepositLabel,
  txReferenceError,
  onTxReferenceBlur,
  t,
}: Props) {
  const [config, setConfig] = useState<PaymentConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) {
          if (!cancelled) setConfigError("Please log in again to load payment details.")
          return
        }
        const res = await fetch("/api/user/funding-payment-config", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        })
        const j = (await res.json().catch(() => ({}))) as PaymentConfig & { error?: string }
        if (!cancelled) {
          if (!res.ok || !j.globalCrypto) {
            setConfig(null)
            setConfigError(j.error ?? "Could not load payment config.")
            return
          }
          setConfigError(null)
          setConfig(j)
        }
      } catch {
        if (!cancelled) {
          setConfig(null)
          setConfigError("Network error loading payment config.")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const wallet = config?.globalCrypto.walletAddress?.trim() || FALLBACK_TRC20_ADDRESS
  const [qrPx, setQrPx] = useState(132)
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(min-width: 640px)")
    const apply = () => setQrPx(mq.matches ? 168 : 132)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    if (!wallet) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    void QRCode.toDataURL(wallet, { width: qrPx, margin: 1, errorCorrectionLevel: "M" }).then((url) => {
      if (!cancelled) setQrDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [wallet, qrPx])

  const copyWallet = useCallback(async () => {
    if (!wallet) return
    try {
      await navigator.clipboard.writeText(wallet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }, [wallet])

  const payerFields =
    onPayerNameChange && onPayerPhoneChange ? (
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-foreground">{t("funding.field.senderName")}</label>
          <input
            type="text"
            value={fundPayerName}
            onChange={(e) => onPayerNameChange(e.target.value)}
            placeholder={t("funding.placeholder.fullName")}
            autoComplete="name"
            className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-foreground">{t("funding.field.senderPhone")}</label>
          <input
            type="tel"
            value={fundPayerPhone}
            onChange={(e) => onPayerPhoneChange(e.target.value)}
            placeholder={t("funding.placeholder.phoneExample")}
            autoComplete="tel"
            className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
    ) : null

  const methodTriggers = (
    <div className="space-y-1.5" role="tablist" aria-label={t("funding.payment.pickRail")}>
      <button
        type="button"
        role="tab"
        aria-selected={activeSource === "crypto"}
        id="fund-method-crypto"
        onClick={() => onSourceChange("crypto")}
        className={`${CARD_TRIGGER} ${activeSource === "crypto" ? "border-[#26A17B]/50 bg-[#26A17B]/8 ring-1 ring-[#26A17B]/30" : CARD_INACTIVE}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#26A17B]/20 text-[#26A17B]">
          <Wallet className="h-5 w-5" aria-hidden />
        </span>
        <div className={LABEL_ROW}>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-foreground">{t("funding.payment.globalTitle")}</span>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">{t("funding.payment.globalSubtitle")}</span>
          </span>
          <span className={`${NETWORK_BADGE} bg-[#26A17B]/20 text-[#1a7a5c] dark:text-emerald-200`}>
            {(config?.globalCrypto.network ?? "USDT TRC20").slice(0, 12)}
          </span>
        </div>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${activeSource === "crypto" ? "rotate-180" : ""}`}
        />
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={activeSource === "airtel"}
        id="fund-method-airtel"
        onClick={() => onSourceChange("airtel")}
        className={`${CARD_TRIGGER} ${activeSource === "airtel" ? "border-[#ED1C24]/40 bg-[#ED1C24]/8 ring-1 ring-[#ED1C24]/25" : CARD_INACTIVE}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ED1C24]/15 text-[#ED1C24]">
          <Smartphone className="h-5 w-5" aria-hidden />
        </span>
        <div className={LABEL_ROW}>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-foreground">{t("funding.payment.ugandaTitle")}</span>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">{t("funding.payment.ugandaSubtitle")}</span>
          </span>
        </div>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${activeSource === "airtel" ? "rotate-180" : ""}`}
        />
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={activeSource === "local"}
        id="fund-method-local"
        onClick={() => onSourceChange("local")}
        className={`${CARD_TRIGGER} ${activeSource === "local" ? "border-primary/40 bg-primary/8 ring-1 ring-primary/25" : CARD_INACTIVE}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Smartphone className="h-5 w-5" aria-hidden />
        </span>
        <div className={LABEL_ROW}>
          <span className="block min-w-0 flex-1 text-xs font-bold text-foreground">
            {t("funding.optionLocal")}{" "}
            <span className="hidden font-normal text-muted-foreground sm:inline">· {t("funding.payment.retailerCapHint")}</span>
          </span>
        </div>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${activeSource === "local" ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  )

  const cryptoExpanded = activeSource === "crypto" && (
    <div
      role="tabpanel"
      aria-labelledby="fund-method-crypto"
      className="rounded-xl border border-[#26A17B]/35 bg-[#26A17B]/5 p-3 sm:bg-gradient-to-b sm:from-[#26A17B]/8 sm:to-muted/30 sm:p-3.5"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-border/40 pb-2">
        <p className="text-xs font-bold text-foreground sm:text-sm">{t("funding.payment.cryptoPanelTitle")}</p>
        <span className="rounded-full bg-[#26A17B]/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#1a7a5c] dark:text-emerald-200">
          {config?.globalCrypto.network ?? "USDT TRC20"}
        </span>
      </div>

      {configError ? (
        <p className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
          {configError}
        </p>
      ) : null}

      <p className="mb-2 text-[11px] leading-snug text-foreground sm:text-[12px]">{t("funding.payment.cryptoInstructionShort")}</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {qrDataUrl ? (
          <div className="flex justify-center sm:justify-start">
            <img
              src={qrDataUrl}
              alt=""
              width={qrPx}
              height={qrPx}
              className="rounded-lg border border-border bg-white p-1.5"
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground">{t("funding.crypto.companyWallet")}</p>
          <p className="break-all rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] leading-snug">
            {wallet}
          </p>
          <button
            type="button"
            onClick={() => void copyWallet()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background"
          >
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? t("funding.payment.copied") : t("funding.payment.copyAddress")}
          </button>
        </div>
      </div>

      {onFundAmountChange ? (
        <div className="mt-3 space-y-1.5 border-t border-border/50 pt-3">
          <label className="block text-[10px] font-medium text-foreground" htmlFor="fund-crypto-amount-inline">
            {t("funding.amount.matchSend").replace("{{currency}}", "USD")}
          </label>
          <input
            id="fund-crypto-amount-inline"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={fundAmount}
            onChange={(e) => onFundAmountChange(e.target.value)}
            placeholder="0 (USD)"
            className="w-full min-h-[44px] rounded-lg border border-border bg-background px-3 py-2 font-mono text-base outline-none focus:border-primary"
          />
          <p className="text-[10px] leading-snug text-muted-foreground">{t("funding.payment.cryptoAmountUsdHint")}</p>
          {minDepositLabel ? (
            <p className="text-[10px] font-medium text-muted-foreground">{minDepositLabel}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 space-y-1.5 border-t border-border/50 pt-3">
        <label className="block text-[10px] font-medium text-foreground" htmlFor="fund-crypto-txhash">
          {t("funding.txRefLabel")}
        </label>
        <input
          id="fund-crypto-txhash"
          type="text"
          value={fundTxReference}
          onChange={(e) => onTxReferenceChange(e.target.value)}
          onBlur={() => onTxReferenceBlur?.()}
          placeholder={t("funding.payment.txRefPlaceholderCrypto")}
          autoComplete="off"
          aria-invalid={txReferenceError ? true : undefined}
          className="w-full min-h-[44px] rounded-md border-2 border-primary/40 bg-background px-3 py-2 font-mono text-sm"
        />
        {txReferenceError ? (
          <p className="text-[10px] font-medium text-destructive" role="alert">
            {txReferenceError}
          </p>
        ) : null}
      </div>

      <details className="mt-2 rounded-lg border border-border/60 bg-muted/20">
        <summary className="cursor-pointer select-none px-2 py-1.5 text-[10px] font-medium text-muted-foreground">
          {t("funding.payment.cryptoOptionalStatus")}
        </summary>
        <p className="border-t border-border/50 px-2 py-1.5 text-[10px] text-muted-foreground">
          {t("funding.payment.cryptoAutoVerifyNote").replace("{{min}}", String(config?.globalCrypto.minConfirmations ?? 19))}
        </p>
      </details>
    </div>
  )

  const airtelExpanded = activeSource === "airtel" && config && (
    <div
      role="tabpanel"
      aria-labelledby="fund-method-airtel"
      className="space-y-2 rounded-xl border border-[#ED1C24]/30 bg-[#ED1C24]/5 p-3 sm:space-y-3 sm:p-3.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-[#ED1C24] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
          Airtel Money
        </span>
        <p className="text-sm font-bold text-foreground">{config.ugandaAirtel.merchantName}</p>
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        {t("funding.payment.adminDirectNote")} {t("funding.payment.airtelIntro")}
      </p>
      <details className="rounded-lg border border-border/60 bg-background/60">
        <summary className="cursor-pointer select-none px-2 py-2 text-[10px] font-semibold text-foreground">
          {t("funding.payment.airtelStepsToggle")}
        </summary>
        <ol className="list-decimal space-y-1 border-t border-border/50 px-2 py-2 pl-6 text-[11px] leading-snug text-foreground">
          <li>{t("funding.payment.airtelStep1").replace("{{ussd}}", config.ugandaAirtel.ussdPrefix)}</li>
          <li>{t("funding.payment.airtelStep2").replace("{{merchantId}}", config.ugandaAirtel.merchantId)}</li>
          <li>
            {t("funding.payment.airtelStep3").replace("{{email}}", userEmail || t("funding.payment.yourLoginEmail"))}
          </li>
          <li>{t("funding.payment.airtelStep4")}</li>
          <li>{t("funding.payment.airtelStep5")}</li>
        </ol>
        <div className="space-y-1 border-t border-border/50 px-2 py-2 text-[10px] text-muted-foreground">
          <p>
            {t("funding.payment.airtelNetworkMerchantLine").replace(
              "{{names}}",
              `${config.ugandaAirtel.merchantName} (${config.ugandaAirtel.networkMerchantNamesHint})`,
            )}
          </p>
        </div>
      </details>
      <div className="space-y-2 border-t border-border/50 pt-2">
        <label className="block text-[10px] font-medium text-foreground">{t("funding.txRefLabel")}</label>
        <input
          type="text"
          value={fundTxReference}
          onChange={(e) => onTxReferenceChange(e.target.value)}
          onBlur={() => onTxReferenceBlur?.()}
          placeholder={t("funding.payment.txRefPlaceholderCrypto")}
          autoComplete="off"
          aria-invalid={txReferenceError ? true : undefined}
          className="w-full min-h-[44px] rounded-md border-2 border-primary/40 bg-background px-3 py-2 font-mono text-sm"
        />
        {txReferenceError ? (
          <p className="text-[10px] font-medium text-destructive" role="alert">
            {txReferenceError}
          </p>
        ) : null}
        {payerFields}
      </div>
    </div>
  )

  const localExpanded =
    activeSource === "local" && (
      <p className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-2.5 py-2 text-[10px] leading-snug text-muted-foreground">
        {t("funding.payment.localAccordionHint")}
      </p>
    )

  const pickHint = activeSource === "pick" && (
    <p className="text-[11px] leading-snug text-muted-foreground">{t("funding.payment.pickRail")}</p>
  )

  const changeMethod =
    activeSource !== "pick" ? (
      <button
        type="button"
        onClick={() => onSourceChange("pick")}
        className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
      >
        ← {t("funding.payment.changeMethod")}
      </button>
    ) : null

  return (
    <div className="mb-1 space-y-2 sm:mb-3 sm:space-y-3">
      {activeSource === "pick" ? (
        <>
          {methodTriggers}
          {pickHint}
        </>
      ) : (
        <>
          {changeMethod}
          {cryptoExpanded}
          {airtelExpanded}
          {activeSource === "airtel" && !config ? (
            <p className="text-[11px] text-muted-foreground">Loading Uganda payment corridor…</p>
          ) : null}
          {localExpanded}
        </>
      )}
    </div>
  )
}
