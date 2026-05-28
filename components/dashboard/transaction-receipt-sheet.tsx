"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft } from "lucide-react"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { Button } from "@/components/ui/button"
import { TransactionReceiptView } from "@/components/dashboard/transaction-receipt-view"
import { INBOX_CARD } from "@/components/dashboard/notification-inbox-ui"
import type { TransactionReceipt } from "@/lib/transactions/transaction-receipt-model"
import { cn } from "@/lib/utils"
import { isMobileLowGpuMode } from "@/lib/mobile/mobile-low-gpu-mode"

type TransactionReceiptSheetProps = {
  open: boolean
  receipt: TransactionReceipt | null
  t: (key: string) => string
  locale?: string
  onClose: () => void
}

/**
 * Lightweight full-screen / bottom receipt — static layout, no blur stacks on low GPU.
 */
export function TransactionReceiptSheet({ open, receipt, t, locale, onClose }: TransactionReceiptSheetProps) {
  const [mounted, setMounted] = useState(false)
  const flatGpu = isMobileLowGpuMode()

  useEffect(() => {
    setMounted(true)
  }, [])

  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open || !receipt || !mounted || typeof document === "undefined") return null

  return createPortal(
    <div
      className={cn(
        "nexus-receipt-scrim fixed inset-0 z-[220] flex flex-col",
        flatGpu ? "bg-black/55" : "bg-black/50 sm:items-center sm:justify-center sm:bg-black/45 sm:p-4",
      )}
      role="dialog"
      aria-modal="true"
      aria-label={t(receipt.headerTitleKey)}
      onClick={onClose}
    >
      <div
        className={cn(
          INBOX_CARD,
          "flex w-full flex-col overflow-hidden",
          flatGpu
            ? "mt-auto max-h-[min(94dvh,820px)] rounded-t-2xl"
            : "max-h-[min(92dvh,640px)] max-w-md sm:rounded-2xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2.5">
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onClose}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {t("receipt.sheet.title")}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <TransactionReceiptView receipt={receipt} t={t} locale={locale} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
