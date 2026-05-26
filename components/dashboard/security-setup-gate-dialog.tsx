"use client"

import Link from "next/link"
import { Shield } from "lucide-react"
import { Button } from "@/components/ui/button"

type Props = {
  open: boolean
  onClose: () => void
  onUpdateDetailsNow: () => void
}

/** Lightweight funding gate — no fullscreen blockers or route loops. */
export function SecuritySetupGateDialog({ open, onClose, onUpdateDetailsNow }: Props) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="security-gate-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12">
          <Shield className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <h2 id="security-gate-title" className="text-base font-semibold text-foreground">
          Transaction details required
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Please update your deposit & withdrawal details to continue. You need your 6-digit Nexus Security PIN and at
          least one registered mobile money number.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button type="button" className="w-full touch-manipulation" onClick={() => onUpdateDetailsNow()}>
            Update Details Now
          </Button>
          <Button type="button" variant="outline" className="w-full touch-manipulation" onClick={onClose}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  )
}
