"use client"

import { useCallback, useEffect, useState } from "react"
import QRCode from "qrcode"
import { Check, Copy, ExternalLink, Smartphone, Wallet } from "lucide-react"

type PaymentConfig = {
  globalCrypto: {
    network: string
    walletAddress: string
    binanceDeepLink: string
    warning: string
  }
  ugandaAirtel: {
    merchantId: string
    merchantName: string
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
  paymentProofPreview: string | null
  onProofFile: (file: File | null) => void
  t: (key: string) => string
}

export function FundingPaymentPanel({
  activeSource,
  onSourceChange,
  userEmail,
  fundTxReference,
  onTxReferenceChange,
  paymentProofPreview,
  onProofFile,
  t,
}: Props) {
  const [config, setConfig] = useState<PaymentConfig | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/user/funding-payment-config", { cache: "no-store" })
        const j = (await res.json().catch(() => ({}))) as PaymentConfig
        if (!cancelled && j.globalCrypto) setConfig(j)
      } catch {
        if (!cancelled) setConfig(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const wallet = config?.globalCrypto.walletAddress ?? ""
  useEffect(() => {
    if (!wallet) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    void QRCode.toDataURL(wallet, { width: 180, margin: 1, errorCorrectionLevel: "M" }).then((url) => {
      if (!cancelled) setQrDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [wallet])

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

  const cardBase = "rounded-xl border-2 p-3 text-left transition-all sm:p-4 "

  const submitFields = (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <div>
        <label className="mb-1 block text-[10px] font-medium text-foreground">{t("funding.txRefLabel")}</label>
        <input
          type="text"
          value={fundTxReference}
          onChange={(e) => onTxReferenceChange(e.target.value)}
          placeholder={t("funding.payment.txRefPlaceholderCrypto")}
          className="w-full min-h-[44px] rounded-md border-2 border-primary/40 bg-background px-3 py-2 font-mono text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium text-foreground">{t("funding.payment.proofLabel")}</label>
        <p className="mb-1.5 text-[10px] text-muted-foreground">{t("funding.payment.proofHint")}</p>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => onProofFile(e.target.files?.[0] ?? null)}
          className="w-full text-[11px] file:mr-2 file:rounded file:border-0 file:bg-primary file:px-2 file:py-1 file:text-primary-foreground"
        />
        {paymentProofPreview ? (
          <img
            src={paymentProofPreview}
            alt=""
            className="mt-2 max-h-32 rounded-lg border border-border object-contain"
          />
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="mb-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onSourceChange("crypto")}
          className={`${cardBase} ${
            activeSource === "crypto"
              ? "border-[#F0B90B] bg-[#F0B90B]/10 ring-2 ring-[#F0B90B]/40"
              : "border-border bg-muted/30 hover:bg-muted/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#26A17B]/20 text-[#26A17B]">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold text-foreground">{t("funding.payment.globalTitle")}</p>
              <p className="text-[10px] text-muted-foreground">{t("funding.payment.globalSubtitle")}</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onSourceChange("airtel")}
          className={`${cardBase} ${
            activeSource === "airtel"
              ? "border-[#ED1C24] bg-[#ED1C24]/10 ring-2 ring-[#ED1C24]/35"
              : "border-border bg-muted/30 hover:bg-muted/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ED1C24]/15 text-[#ED1C24]">
              <Smartphone className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold text-foreground">{t("funding.payment.ugandaTitle")}</p>
              <p className="text-[10px] text-muted-foreground">{t("funding.payment.ugandaSubtitle")}</p>
            </div>
          </div>
        </button>
      </div>

      <button
        type="button"
        onClick={() => onSourceChange("local")}
        className={`w-full rounded-lg border px-3 py-2 text-[11px] font-semibold ${
          activeSource === "local" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
        }`}
      >
        {t("funding.optionLocal")} · {t("funding.payment.retailerCapHint")}
      </button>

      {activeSource === "pick" && (
        <p className="text-[11px] text-muted-foreground">{t("funding.payment.pickRail")}</p>
      )}

      {activeSource === "crypto" && config ? (
        <div className="space-y-3 rounded-xl border border-[#26A17B]/40 bg-gradient-to-b from-[#26A17B]/8 to-muted/40 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-foreground">{t("funding.payment.cryptoPanelTitle")}</p>
            <span className="rounded-full bg-[#26A17B]/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1a7a5c] dark:text-emerald-200">
              {config.globalCrypto.network}
            </span>
          </div>
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] font-medium text-amber-950 dark:text-amber-100">
            {config.globalCrypto.warning}
          </p>
          <p className="text-[10px] text-muted-foreground">{t("funding.payment.adminDirectNote")}</p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Wallet QR"
                className="h-[180px] w-[180px] shrink-0 rounded-lg border border-border bg-white p-2"
              />
            ) : null}
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground">{t("funding.crypto.companyWallet")}</p>
              <p className="break-all rounded-lg border border-border bg-background p-2.5 font-mono text-[11px] leading-snug">
                {wallet}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyWallet()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t("funding.payment.copied") : t("funding.payment.copyAddress")}
                </button>
                <a
                  href={config.globalCrypto.binanceDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#F0B90B] bg-[#F0B90B]/15 px-3 py-2 text-xs font-semibold text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("funding.payment.openBinance")}
                </a>
              </div>
            </div>
          </div>
          {submitFields}
        </div>
      ) : null}

      {activeSource === "airtel" && config ? (
        <div className="space-y-3 rounded-xl border border-[#ED1C24]/35 bg-gradient-to-b from-[#ED1C24]/8 to-muted/40 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-[#ED1C24] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white">
              Airtel Money
            </span>
            <p className="text-sm font-bold text-foreground">{config.ugandaAirtel.merchantName}</p>
          </div>
          <p className="text-[10px] text-muted-foreground">{t("funding.payment.adminDirectNote")}</p>
          <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-foreground">
            <li>{t("funding.payment.airtelStep1").replace("{{ussd}}", config.ugandaAirtel.ussdPrefix)}</li>
            <li>{t("funding.payment.airtelStep2").replace("{{merchantId}}", config.ugandaAirtel.merchantId)}</li>
            <li>
              {t("funding.payment.airtelStep3").replace(
                "{{email}}",
                userEmail || t("funding.payment.yourLoginEmail"),
              )}
            </li>
            <li>{t("funding.payment.airtelStep4")}</li>
          </ol>
          {submitFields}
        </div>
      ) : null}
    </div>
  )
}
