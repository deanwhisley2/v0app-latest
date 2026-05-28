"use client"

import { useCallback, useEffect, useState } from "react"
import QRCode from "qrcode"
import { Check, ChevronDown, Copy } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { PaymentNetworkLogo } from "@/components/brand/payment-network-logo"
import {
  AirtelPaymentSteps,
  MpesaTillPaymentSteps,
  PaymentReferenceFields,
} from "@/components/dashboard/mobile-money-payment-instructions"
import { KenyaMpesaTillCard } from "@/components/dashboard/kenya-mpesa-till-card"
import { SavedPayerDisplay } from "@/components/dashboard/saved-payer-display"
import { SmartAmountInput } from "@/components/ui/smart-amount-input"

const FALLBACK_TRC20_ADDRESS = "TYqESCZz8xcN5TZTdEDtRsbjNmhPWrVTNe"

type PaymentConfig = {
  rails?: { globalCrypto?: boolean; ugandaAirtel?: boolean; kenyaMpesaTill?: boolean; localMobile?: boolean }
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
  } | null
  kenyaMpesaTill: {
    tillNumber: string
    businessName: string
    ussdPrefix: string
    referenceHint: string
  } | null
}

export type L1FundSource = "pick" | "crypto" | "airtel" | "mpesa_ke" | "local"

type Props = {
  activeSource: L1FundSource
  onSourceChange: (s: L1FundSource) => void
  /** Profile/corridor ISO2 — Uganda Airtel L5 rail only when UG. */
  customerFundingCountry?: string
  userEmail: string
  fundTxReference: string
  onTxReferenceChange: (v: string) => void
  fundPayerName?: string
  onPayerNameChange?: (v: string) => void
  fundPayerPhone?: string
  onPayerPhoneChange?: (v: string) => void
  /** When set, sender identity is read-only from Security profile (no manual re-entry). */
  savedPayerPhoneMasked?: string | null
  savedPayerAccountNames?: string | null
  savedPayerNetwork?: "MTN" | "Airtel" | null
  savedPayerNetworkLabel?: string | null
  /** When set with onFundAmountChange, amount field is rendered in crypto flow (compact mobile layout). */
  fundAmount?: string
  onFundAmountChange?: (v: string) => void
  fundAmountLocale?: string
  fundAmountCurrency?: string
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
  customerFundingCountry = "",
  userEmail,
  fundTxReference,
  onTxReferenceChange,
  fundPayerName = "",
  onPayerNameChange,
  fundPayerPhone = "",
  onPayerPhoneChange,
  savedPayerPhoneMasked = null,
  savedPayerAccountNames = null,
  savedPayerNetwork = null,
  savedPayerNetworkLabel = null,
  fundAmount = "",
  onFundAmountChange,
  fundAmountLocale = "en-US",
  fundAmountCurrency = "USD",
  minDepositLabel,
  txReferenceError,
  onTxReferenceBlur,
  t,
}: Props) {
  const [config, setConfig] = useState<PaymentConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const corridorCc = customerFundingCountry.trim().toUpperCase().slice(0, 2)
  const showUgandaAirtel =
    corridorCc === "UG" || (config?.rails?.ugandaAirtel ?? Boolean(config?.ugandaAirtel))
  const showKenyaMpesa =
    corridorCc === "KE" || (config?.rails?.kenyaMpesaTill ?? Boolean(config?.kenyaMpesaTill))

  useEffect(() => {
    if (!showUgandaAirtel && activeSource === "airtel") {
      onSourceChange("crypto")
    }
    if (!showKenyaMpesa && activeSource === "mpesa_ke") {
      onSourceChange("crypto")
    }
  }, [showUgandaAirtel, showKenyaMpesa, activeSource, onSourceChange])

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
    savedPayerPhoneMasked && savedPayerAccountNames ? (
      <SavedPayerDisplay
        network={savedPayerNetwork}
        networkLabel={savedPayerNetworkLabel ?? undefined}
        phoneMasked={savedPayerPhoneMasked}
        accountNames={savedPayerAccountNames}
        hint="This number is locked from your Security profile. Enter only amount and transaction reference below."
      />
    ) : onPayerNameChange && onPayerPhoneChange ? (
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
        <PaymentNetworkLogo network="USDT_TRC20" size="sm" className="shrink-0" />
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

      {showUgandaAirtel ? (
        <button
          type="button"
          role="tab"
          aria-selected={activeSource === "airtel"}
          id="fund-method-airtel"
          onClick={() => onSourceChange("airtel")}
          className={`${CARD_TRIGGER} ${activeSource === "airtel" ? "border-[#ED1C24]/40 bg-[#ED1C24]/8 ring-1 ring-[#ED1C24]/25" : CARD_INACTIVE}`}
        >
          <PaymentNetworkLogo network="Airtel" size="sm" className="shrink-0" />
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
      ) : null}

      {showKenyaMpesa ? (
        <button
          type="button"
          role="tab"
          aria-selected={activeSource === "mpesa_ke"}
          id="fund-method-mpesa-ke"
          onClick={() => onSourceChange("mpesa_ke")}
          className={`${CARD_TRIGGER} ${activeSource === "mpesa_ke" ? "border-[#39B54A]/50 bg-[#39B54A]/10 ring-1 ring-[#39B54A]/30" : CARD_INACTIVE}`}
        >
          <PaymentNetworkLogo network="MPesa" size="sm" className="shrink-0" />
          <div className={LABEL_ROW}>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-foreground">{t("funding.payment.kenyaMpesaTitle")}</span>
              <span className="hidden text-[10px] text-muted-foreground sm:inline">
                {t("funding.payment.kenyaMpesaSubtitle")}
              </span>
            </span>
          </div>
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${activeSource === "mpesa_ke" ? "rotate-180" : ""}`}
          />
        </button>
      ) : null}

      <button
        type="button"
        role="tab"
        aria-selected={activeSource === "local"}
        id="fund-method-local"
        onClick={() => onSourceChange("local")}
        className={`${CARD_TRIGGER} ${activeSource === "local" ? "border-primary/40 bg-primary/8 ring-1 ring-primary/25" : CARD_INACTIVE}`}
      >
        <PaymentNetworkLogo network="combined_local" size="sm" className="shrink-0" />
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
          <SmartAmountInput
            id="fund-crypto-amount-inline"
            value={fundAmount}
            onValueChange={onFundAmountChange}
            locale={fundAmountLocale}
            currency={fundAmountCurrency}
            placeholder="0"
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

  const airtelExpanded = showUgandaAirtel && activeSource === "airtel" && config?.ugandaAirtel && (
    <div
      role="tabpanel"
      aria-labelledby="fund-method-airtel"
      className="max-w-full space-y-2 overflow-x-hidden rounded-xl border border-[#ED1C24]/30 bg-[#ED1C24]/5 p-2.5 sm:p-3"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("funding.payment.instructionPanelTitle")}
      </p>
      <p className="text-[10px] leading-snug text-muted-foreground break-words">{t("funding.payment.adminDirectNote")}</p>
      <AirtelPaymentSteps
        ussdPrefix={config.ugandaAirtel!.ussdPrefix}
        merchantId={config.ugandaAirtel!.merchantId}
        payerEmail={userEmail || t("funding.payment.yourLoginEmail")}
        t={t}
      />
      <p className="text-[10px] leading-snug text-muted-foreground break-words">
        {t("funding.payment.adminDirectRegisteredPayeeLine")}
      </p>
      <PaymentReferenceFields
        fundTxReference={fundTxReference}
        onTxReferenceChange={onTxReferenceChange}
        onTxReferenceBlur={onTxReferenceBlur}
        txReferenceError={txReferenceError}
        hint={t("funding.payment.adminDirectRefHint")}
        t={t}
      />
      {payerFields}
    </div>
  )

  const mpesaKeExpanded = showKenyaMpesa && activeSource === "mpesa_ke" && config?.kenyaMpesaTill && (
    <div
      role="tabpanel"
      aria-labelledby="fund-method-mpesa-ke"
      className="max-w-full space-y-3 overflow-x-hidden rounded-xl border border-[#39B54A]/35 bg-[#39B54A]/5 p-2.5 sm:p-3"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("funding.payment.instructionPanelTitle")}
      </p>
      <KenyaMpesaTillCard
        tillNumber={config.kenyaMpesaTill.tillNumber}
        businessName={config.kenyaMpesaTill.businessName}
      />
      <MpesaTillPaymentSteps
        ussdPrefix={config.kenyaMpesaTill.ussdPrefix}
        tillNumber={config.kenyaMpesaTill.tillNumber}
        t={t}
      />
      <PaymentReferenceFields
        fundTxReference={fundTxReference}
        onTxReferenceChange={onTxReferenceChange}
        onTxReferenceBlur={onTxReferenceBlur}
        txReferenceError={txReferenceError}
        hint={t("funding.payment.mpesaTillRefHint")}
        t={t}
      />
      {payerFields}
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
          {mpesaKeExpanded}
          {showUgandaAirtel && activeSource === "airtel" && !config?.ugandaAirtel ? (
            <p className="text-[11px] text-muted-foreground">Loading Uganda payment corridor…</p>
          ) : null}
          {showKenyaMpesa && activeSource === "mpesa_ke" && !config?.kenyaMpesaTill ? (
            <p className="text-[11px] text-muted-foreground">Loading Kenya payment corridor…</p>
          ) : null}
          {localExpanded}
        </>
      )}
    </div>
  )
}
