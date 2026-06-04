"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type TradeSessionProfitCelebrationProps = {
  profitUsd: number
  summary: string
  formatMoney: (usd: number) => string
  onDismiss: () => void
}

export function TradeSessionProfitCelebration({
  profitUsd,
  summary,
  formatMoney,
  onDismiss,
}: TradeSessionProfitCelebrationProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = window.setTimeout(() => {
      setVisible(false)
      onDismiss()
    }, 7000)
    return () => window.clearTimeout(id)
  }, [onDismiss])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-label="Session profit celebration"
    >
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-success/40 bg-gradient-to-b from-success/20 to-background p-6 text-center shadow-2xl">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              className={cn("absolute h-2 w-2 rounded-full opacity-80 animate-ping")}
              style={{
                left: `${(i * 17) % 100}%`,
                top: `${(i * 23) % 60}%`,
                backgroundColor: i % 3 === 0 ? "#39FF14" : i % 3 === 1 ? "#FFD700" : "#00D4FF",
                animationDelay: `${(i % 8) * 120}ms`,
                animationDuration: `${900 + (i % 5) * 200}ms`,
              }}
            />
          ))}
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-success">Session complete</p>
        <p className="mt-3 text-sm font-medium text-foreground">Released earnings</p>
        <p className="mt-1 text-3xl font-bold text-success">+{formatMoney(profitUsd)}</p>
        <p className="mt-2 text-sm text-muted-foreground">{summary}</p>
        <p className="mt-1 text-xs text-muted-foreground">Credited to your available balance</p>
        <button
          type="button"
          className="mt-5 min-h-[44px] w-full rounded-xl bg-success px-4 py-2 text-sm font-semibold text-success-foreground touch-manipulation"
          onClick={() => {
            setVisible(false)
            onDismiss()
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
