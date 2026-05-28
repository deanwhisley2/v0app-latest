"use client"

import { Shield } from "lucide-react"

type Props = {
  networkLabel?: string
  phoneMasked: string
  accountNames: string
  hint?: string
}

/** Read-only saved mobile-money sender — no manual number entry. */
export function SavedPayerDisplay({ networkLabel, phoneMasked, accountNames, hint }: Props) {
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Shield className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Your registered sender
        </p>
      </div>
      {networkLabel ? (
        <p className="text-xs font-medium text-foreground">{networkLabel}</p>
      ) : null}
      <p className="mt-1 font-mono text-sm text-foreground">{phoneMasked}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{accountNames}</p>
      {hint ? <p className="mt-2 text-[10px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
