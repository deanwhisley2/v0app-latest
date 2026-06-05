"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type TradeSessionProfitCelebrationProps = {
  profitUsd: number
  stakeReturnedUsd?: number
  summary: string
  formatMoney: (usd: number) => string
  celebrationKind?: "earnings" | "stake_return"
  onDismiss: () => void
}

export function TradeSessionProfitCelebration({
  profitUsd,
  stakeReturnedUsd = 0,
  summary,
  formatMoney,
  celebrationKind = profitUsd > 0 ? "earnings" : "stake_return",
  onDismiss,
}: TradeSessionProfitCelebrationProps) {
  const [visible, setVisible] = useState(true)
  const hasEarnings = celebrationKind === "earnings" && profitUsd > 0

  useEffect(() => {
    const id = window.setTimeout(() => {
      setVisible(false)
      onDismiss()
    }, hasEarnings ? 7000 : 4000)
    return () => window.clearTimeout(id)
  }, [hasEarnings, onDismiss])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-label={hasEarnings ? "Trade earnings celebration" : "Session completion"}
    >
      <div
        className={cn(
          "relative w-full max-w-sm overflow-hidden rounded-2xl border p-6 text-center shadow-2xl",
          hasEarnings
            ? "border-success/40 bg-gradient-to-b from-success/20 to-background"
            : "border-border/80 bg-card",
        )}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {hasEarnings
            ? Array.from({ length: 24 }).map((_, i) => (
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
              ))
            : null}
        </div>
        <p
          className={cn(
            "text-xs font-semibold uppercase tracking-widest",
            hasEarnings ? "text-success" : "text-muted-foreground",
          )}
        >
          {hasEarnings ? "Earnings released" : "Session complete"}
        </p>
        {hasEarnings ? (
          <>
            <p className="mt-3 text-sm font-medium text-foreground">Released earnings (Pocket)</p>
            <p className="mt-1 text-3xl font-bold text-success">+{formatMoney(profitUsd)}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Earnings are in your <span className="font-medium text-foreground">Pocket balance</span>, not Nexus
              Main. Open Pocket on the home screen to transfer to Main when ready.
            </p>
            {stakeReturnedUsd > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Trading capital {formatMoney(stakeReturnedUsd)} returned to Nexus Main.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="mt-3 text-sm font-medium text-foreground">Capital returned to Nexus Main</p>
            {stakeReturnedUsd > 0 ? (
              <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(stakeReturnedUsd)}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">No earnings were released for this session.</p>
          </>
        )}
        <p className="mt-2 text-sm text-muted-foreground">{summary}</p>
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
