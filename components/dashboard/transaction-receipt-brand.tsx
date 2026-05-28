"use client"

import { PaymentNetworkLogo } from "@/components/brand/payment-network-logo"
import { networkKeyFromPayoutRail, type PaymentNetworkKey } from "@/lib/payment-network-brand"
import type { ReceiptBrand, ReceiptStatusTone } from "@/lib/transactions/transaction-receipt-model"
import { cn } from "@/lib/utils"

export function receiptBrandToNetworkKey(brand: ReceiptBrand): PaymentNetworkKey | null {
  if (brand === "usdt_trc20") return "USDT_TRC20"
  if (brand === "mtn") return "MTN"
  if (brand === "airtel") return "Airtel"
  if (brand === "mobile_money") return null
  return null
}

/** Receipt header logo — always single-network (never combined MTN + Airtel). */
export function TransactionReceiptBrandMark({
  brand,
  payoutRail,
  className,
}: {
  brand: ReceiptBrand
  payoutRail?: string | null
  className?: string
}) {
  const fromRail = networkKeyFromPayoutRail(payoutRail)
  const fromBrand = receiptBrandToNetworkKey(brand)
  const key = fromBrand ?? fromRail ?? (brand === "nexus" ? null : null)

  return <PaymentNetworkLogo network={key} className={className} size="lg" />
}

export function ReceiptStatusBadge({
  label,
  tone,
}: {
  label: string
  tone: ReceiptStatusTone
}) {
  const TONE_BADGE: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25",
    pending: "bg-amber-500/15 text-amber-800 dark:text-amber-200 ring-amber-500/25",
    danger: "bg-red-500/12 text-red-700 dark:text-red-300 ring-red-500/20",
    processing: "bg-sky-500/12 text-sky-800 dark:text-sky-200 ring-sky-500/20",
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center justify-center rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide ring-1",
        TONE_BADGE[tone] ?? TONE_BADGE.processing,
      )}
    >
      {label}
    </span>
  )
}
