"use client"

import { useCallback, useEffect, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "nexus_welcome_crypto_intelligence_v1"

const FEATURES = [
  "Automated trading participation",
  "Copy trading systems",
  "Smart market analysis",
  "Automated deposits & withdrawals",
  "Monitored trading sessions",
  "Referral rewards & bonuses",
] as const

type WelcomePlatformModalProps = {
  /** When false, never auto-opens. */
  enabled?: boolean
}

export function WelcomePlatformModal({ enabled = true }: WelcomePlatformModalProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!enabled) return
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return
    } catch {
      /* private mode */
    }
    const id = window.requestAnimationFrame(() => setOpen(true))
    return () => window.cancelAnimationFrame(id)
  }, [enabled])

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      /* ignore */
    }
    setOpen(false)
  }, [])

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? dismiss() : setOpen(next))}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "max-h-[min(90vh,720px)] gap-0 overflow-hidden border-primary/25 p-0 sm:max-w-lg",
          "bg-gradient-to-b from-card via-card to-background shadow-2xl shadow-primary/10",
        )}
      >
        <div className="relative border-b border-border/80 bg-primary/5 px-4 py-3 sm:px-6">
          <DialogHeader className="gap-2 pr-8 text-left">
            <DialogTitle className="text-base leading-snug font-semibold text-foreground sm:text-lg">
              ⚜️ Welcome to Nexus Pro Crypto Intelligence
            </DialogTitle>
            <DialogDescription className="text-left text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Nexus Pro is a crypto intelligence and automated trading participation platform designed to
              simplify participation in cryptocurrency markets.
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={dismiss}
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close welcome dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[50vh] space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:max-h-none sm:px-6 sm:py-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            The platform combines intelligent market analysis, automated trading systems, monitored trading
            sessions, copy trading technology, and connected trading infrastructure.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Our goal is to help users reduce the stress of emotional trading, endless chart monitoring, and
            complicated market analysis through structured and automated participation systems.
          </p>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Platform features</p>
            <ul className="mt-2 space-y-2">
              {FEATURES.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-foreground">
                  <span className="text-primary" aria-hidden>
                    ◆
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <DialogFooter className="border-t border-border/80 bg-muted/30 px-4 py-3 sm:px-6">
          <Button type="button" className="w-full sm:w-auto" onClick={dismiss}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
