"use client"

import { Lock, Shield, TrendingUp } from "lucide-react"
import { useAuthMarketTick } from "@/hooks/use-auth-market-tick"
import { getAuthMessages } from "@/lib/i18n/auth-messages"
import type { AppLanguage } from "@/lib/user-preferences"
import { cn } from "@/lib/utils"

type Props = {
  language?: AppLanguage
  className?: string
}

export function AuthTrustStrip({ language = "en", className }: Props) {
  const t = getAuthMessages(language)
  const { btcUsd, change24h, loaded } = useAuthMarketTick()
  const up = (change24h ?? 0) >= 0

  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>
      <div className="flex min-h-[44px] items-center gap-2 rounded-xl border border-border/80 bg-muted/30 px-3 py-2.5">
        <Shield className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="text-[11px] font-medium leading-tight text-foreground sm:text-xs">
          {t.trust.securePlatform}
        </span>
      </div>
      <div className="flex min-h-[44px] items-center gap-2 rounded-xl border border-border/80 bg-muted/30 px-3 py-2.5">
        <Lock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="text-[11px] font-medium leading-tight text-foreground sm:text-xs">
          {t.trust.encryptedSession}
        </span>
      </div>
      <div className="col-span-2 flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/30 px-3 py-2.5 sm:col-span-2">
        <div className="flex items-center gap-2">
          <TrendingUp className={cn("h-4 w-4 shrink-0", up ? "text-emerald-500" : "text-rose-500")} aria-hidden />
          <span className="text-[11px] font-medium text-foreground sm:text-xs">{t.trust.liveMarkets}</span>
        </div>
        <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
          {loaded && btcUsd != null
            ? `BTC $${btcUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            : "BTC —"}
          {loaded && change24h != null ? (
            <span className={cn("ms-1.5 text-[10px] font-medium", up ? "text-emerald-500" : "text-rose-500")}>
              {up ? "+" : ""}
              {change24h.toFixed(2)}%
            </span>
          ) : null}
        </span>
      </div>
    </div>
  )
}
