"use client"

import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

type MobileOverlaySheetProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Optional sticky header inside the sheet */
  title?: string
  className?: string
}

/**
 * Full-screen mobile bottom sheet (portal) — isolates scroll from the page behind.
 */
export function MobileOverlaySheet({
  open,
  onClose,
  children,
  title,
  className,
}: MobileOverlaySheetProps) {
  const [mounted, setMounted] = useState(false)
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    setMounted(true)
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setMobile(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open || !mounted || !mobile || typeof document === "undefined") return null

  return createPortal(
    <div className="nexus-mobile-overlay-root fixed inset-0 z-[200] md:hidden" role="presentation">
      <button
        type="button"
        className="absolute inset-0 touch-manipulation bg-black/55"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[min(92dvh,820px)] flex-col rounded-t-2xl border border-border bg-card shadow-2xl",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="nexus-touch-press rounded-md p-1.5 text-muted-foreground touch-manipulation"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <div
          data-nexus-overlay-scroll
          className="nexus-overlay-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y"
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
