"use client"

import { PaymentNetworkLogo } from "@/components/brand/payment-network-logo"
import { networkKeyFromSelection, type PaymentNetworkKey } from "@/lib/payment-network-brand"
import { cn } from "@/lib/utils"

type Props = {
  network: string | null | undefined
  title?: string
  subtitle?: string
  payeeNumber?: string | null
  payeeName?: string | null
  senderNumber?: string | null
  senderName?: string | null
  amountLabel?: string | null
  reference?: string | null
  timestamp?: string | null
  statusLabel?: string | null
  statusTone?: "success" | "pending" | "danger" | "processing"
  className?: string
  t: (key: string) => string
}

const TONE: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  pending: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  danger: "bg-red-500/12 text-red-700 dark:text-red-300",
  processing: "bg-sky-500/12 text-sky-800 dark:text-sky-200",
}

export function NetworkPaymentCardHeader({
  network,
  title,
  subtitle,
  payeeNumber,
  payeeName,
  senderNumber,
  senderName,
  amountLabel,
  reference,
  timestamp,
  statusLabel,
  statusTone = "processing",
  className,
  t,
}: Props) {
  const key: PaymentNetworkKey | null = networkKeyFromSelection(network)

  return (
    <div className={cn("rounded-xl border border-border/70 bg-card p-3 sm:p-4", className)}>
      <div className="flex items-start gap-3">
        <PaymentNetworkLogo network={key} size="md" />
        <div className="min-w-0 flex-1">
          {statusLabel ? (
            <span
              className={cn(
                "mb-2 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                TONE[statusTone] ?? TONE.processing,
              )}
            >
              {statusLabel}
            </span>
          ) : null}
          {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : null}
          {subtitle ? <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>

      <dl className="mt-3 space-y-2 border-t border-border/50 pt-3 text-[11px]">
        {payeeNumber ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("funding.card.payeeNumber")}</dt>
            <dd className="font-mono font-semibold text-foreground">{payeeNumber}</dd>
          </div>
        ) : null}
        {payeeName ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("funding.card.payeeName")}</dt>
            <dd className="text-end font-medium text-foreground">{payeeName}</dd>
          </div>
        ) : null}
        {senderNumber ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("funding.card.yourNumber")}</dt>
            <dd className="font-mono font-semibold text-foreground">{senderNumber}</dd>
          </div>
        ) : null}
        {senderName ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("funding.card.yourName")}</dt>
            <dd className="text-end font-medium text-foreground">{senderName}</dd>
          </div>
        ) : null}
        {amountLabel ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("receipt.field.amount")}</dt>
            <dd className="font-semibold text-foreground">{amountLabel}</dd>
          </div>
        ) : null}
        {reference ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("receipt.field.reference")}</dt>
            <dd className="max-w-[58%] truncate font-mono text-[10px] text-foreground">{reference}</dd>
          </div>
        ) : null}
        {timestamp ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("receipt.footer.recorded")}</dt>
            <dd className="text-[10px] tabular-nums text-muted-foreground">{timestamp}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}
