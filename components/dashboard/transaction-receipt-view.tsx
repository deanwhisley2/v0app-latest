"use client"

import { Copy, Download, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ReceiptStatusBadge, TransactionReceiptBrandMark } from "@/components/dashboard/transaction-receipt-brand"
import type { TransactionReceipt } from "@/lib/transactions/transaction-receipt-model"
import { cn } from "@/lib/utils"

type TransactionReceiptViewProps = {
  receipt: TransactionReceipt
  t: (key: string) => string
  locale?: string
  showShareActions?: boolean
  onCopyReference?: () => void
  className?: string
}

export function TransactionReceiptView({
  receipt,
  t,
  locale,
  showShareActions = true,
  onCopyReference,
  className,
}: TransactionReceiptViewProps) {
  const headerTitle = t(receipt.headerTitleKey)
  const category = t(receipt.categoryLabelKey)
  const statusLabel = t(receipt.statusLabelKey)
  const when = new Date(receipt.timestamp).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  })

  const copyRef = () => {
    const text = receipt.reference ?? receipt.shareText
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text)
    }
    onCopyReference?.()
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-col items-center px-4 pb-4 pt-5 text-center">
        <TransactionReceiptBrandMark brand={receipt.brand} payoutRail={receipt.payoutRail} />
        <div className="mt-4">
          <ReceiptStatusBadge label={statusLabel} tone={receipt.statusTone} />
        </div>
        <h2 className="mt-3 text-lg font-semibold tracking-tight text-foreground">{headerTitle}</h2>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{category}</p>
      </div>

      <div className="mx-4 rounded-2xl border border-border/70 bg-muted/10">
        <dl className="divide-y divide-border/50">
          {receipt.fields.map((field, idx) => (
            <div key={`${field.labelKey}-${idx}`} className="grid grid-cols-[minmax(0,38%)_1fr] gap-3 px-4 py-3.5">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t(field.labelKey)}
              </dt>
              <dd
                className={cn(
                  "text-end",
                  field.profitGreen
                    ? "text-[17px] font-bold text-[#22C55E]"
                    : "text-sm font-semibold text-foreground",
                  field.mono && "font-mono text-[12px] leading-relaxed break-all",
                  field.multiline && "text-start",
                )}
              >
                {field.profitGreen ? `+${field.value}` : field.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-4 space-y-1 px-4 pb-2">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">
          {t("receipt.footer.recorded")}
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">{when}</p>
        {receipt.reference ? (
          <p className="font-mono text-[10px] text-muted-foreground/80 break-all">
            {t("receipt.footer.reference")}: {receipt.reference}
          </p>
        ) : null}
      </div>

      {showShareActions ? (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/50 px-4 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 gap-2 opacity-60"
            disabled
            aria-disabled
            title={t("receipt.share.comingSoon")}
          >
            <Share2 className="h-4 w-4 shrink-0" aria-hidden />
            {t("receipt.share.share")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 gap-2 opacity-60"
            disabled
            aria-disabled
            title={t("receipt.share.comingSoon")}
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            {t("receipt.share.download")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="col-span-2 min-h-10 gap-2 text-xs"
            onClick={copyRef}
          >
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("receipt.share.copyReference")}
          </Button>
        </div>
      ) : null}

      <p className="px-4 pb-4 text-center text-[10px] text-muted-foreground/60">
        <button type="button" className="underline-offset-2 hover:underline">
          {t("receipt.footer.support")}
        </button>
      </p>
    </div>
  )
}
