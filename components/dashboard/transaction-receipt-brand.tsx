"use client"

import { cn } from "@/lib/utils"
import type { ReceiptBrand } from "@/lib/transactions/transaction-receipt-model"

/** Lightweight brand marks — no external image fetches (A05 / GPU safe). */
export function TransactionReceiptBrandMark({
  brand,
  className,
}: {
  brand: ReceiptBrand
  className?: string
}) {
  if (brand === "usdt_trc20") {
    return (
      <div
        className={cn(
          "relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600/90 to-teal-800/95 ring-1 ring-teal-400/25",
          className,
        )}
        aria-hidden
      >
        <span className="text-lg font-bold text-white">₮</span>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[8px] font-bold text-white ring-2 ring-card">
          T
        </span>
      </div>
    )
  }
  if (brand === "mtn") {
    return (
      <div
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FFCC00] ring-1 ring-[#FFCC00]/40",
          className,
        )}
        aria-hidden
      >
        <span className="text-sm font-black tracking-tight text-[#1a1a1a]">MTN</span>
      </div>
    )
  }
  if (brand === "airtel") {
    return (
      <div
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#ED1C24] ring-1 ring-[#ED1C24]/35",
          className,
        )}
        aria-hidden
      >
        <span className="text-xs font-bold lowercase tracking-tight text-white">airtel</span>
      </div>
    )
  }
  if (brand === "mobile_money") {
    return (
      <div
        className={cn(
          "flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-muted/50 ring-1 ring-border/60",
          className,
        )}
        aria-hidden
      >
        <span className="text-[9px] font-bold text-[#FFCC00]">MTN</span>
        <span className="h-px w-6 bg-border/80" />
        <span className="text-[8px] font-bold lowercase text-[#ED1C24]">airtel</span>
      </div>
    )
  }
  return (
    <div
      className={cn(
        "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/25",
        className,
      )}
      aria-hidden
    >
      <span className="text-lg font-bold text-primary">N</span>
    </div>
  )
}

const TONE_BADGE: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25",
  pending: "bg-amber-500/15 text-amber-800 dark:text-amber-200 ring-amber-500/25",
  danger: "bg-red-500/12 text-red-700 dark:text-red-300 ring-red-500/20",
  processing: "bg-sky-500/12 text-sky-800 dark:text-sky-200 ring-sky-500/20",
}

export function ReceiptStatusBadge({
  label,
  tone,
}: {
  label: string
  tone: keyof typeof TONE_BADGE
}) {
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
