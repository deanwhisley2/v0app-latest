"use client"

import {
  CheckCircle2,
  Eye,
  Lock,
  Play,
  Shield,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { LiveMiniMarketChart } from "@/components/dashboard/live-mini-market-chart"
import { TraderPersonaAvatar } from "@/components/dashboard/trader-persona-avatar"
import { resolveDeskChartSymbol } from "@/lib/client/market-sparkline-cache"
import {
  copyEstimatedGrowthPct,
  fixEstimatedGrowthPct,
} from "@/lib/container-desk-market-display"
import { cn } from "@/lib/utils"
import { MOBILE_MARKET_CARD } from "@/lib/dashboard-mobile-render-policy"
import { NX_BTN_ACCENT, NX_BTN_PRIMARY, NX_MARKET_CARD } from "@/lib/nexus-ui-surfaces"

type RiskLevel = "Low" | "Medium" | "High"

export type MarketTrader = {
  id: string
  name: string
  avatar: string
  winRate: number
  riskLevel: RiskLevel
  speciality: string
  monthlyReturn: number
  strategies: string[]
  locked?: boolean
  lockReason?: string
  followers?: number
}

export type MarketLiveSnapshot = {
  authorityRevision: number
  getSymbolPrice: (symbol: string) => number | null
  getSymbolChange24h: (symbol: string) => number | null
}

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pairsLabel(trader: MarketTrader): string {
  if (trader.strategies?.length >= 2) {
    return trader.strategies.slice(0, 2).join(" · ")
  }
  const s = trader.speciality.trim()
  if (/btc|eth|usdt/i.test(s)) return s
  return "BTC/USDT · ETH/USDT"
}

function estimatedParticipants(trader: MarketTrader): number {
  if (trader.followers && trader.followers > 0) return trader.followers
  return 120 + (hashSeed(trader.id) % 2800)
}

function estimatedSlotsRemaining(trader: MarketTrader): number {
  return 12 + (hashSeed(`${trader.id}|slots`) % 48)
}

function formatCompactUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return `$${n.toFixed(0)}`
}

function LiveMarketRefs({
  chartSymbol,
  live,
}: {
  chartSymbol: string
  live: MarketLiveSnapshot
}) {
  const show = chartSymbol === "BTC" || chartSymbol === "ETH" ? ["BTC", "ETH", "SOL"] : [chartSymbol, "BTC", "ETH"]
  const unique = [...new Set(show)].slice(0, 3)

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      {unique.map((sym) => {
        const px = live.getSymbolPrice(sym)
        const ch = live.getSymbolChange24h(sym)
        if (px == null) return null
        const up = (ch ?? 0) >= 0
        return (
          <span key={sym} className="font-mono tabular-nums">
            {sym} {formatCompactUsd(px)}{" "}
            <span className={up ? "text-success" : "text-destructive"}>
              {ch != null ? `${up ? "+" : ""}${ch.toFixed(2)}%` : "—"}
            </span>
          </span>
        )
      })}
    </div>
  )
}

function MarketDirectionBadge({
  chartSymbol,
  live,
  t,
}: {
  chartSymbol: string
  live: MarketLiveSnapshot
  t: (k: string) => string
}) {
  const ch = live.getSymbolChange24h(chartSymbol)
  if (ch == null) return null
  const up = ch >= 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
      )}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {t("container.market.marketDirection")}: {up ? t("container.market.directionUp") : t("container.market.directionDown")}
    </span>
  )
}

export function ActiveSessionsStrip({
  copyCount,
  fixCount,
  onOpenDashboard,
  label,
}: {
  copyCount: number
  fixCount: number
  onOpenDashboard: () => void
  label: string
}) {
  const total = copyCount + fixCount
  if (total <= 0) return null
  return (
    <button
      type="button"
      onClick={onOpenDashboard}
      className="mb-1 flex w-full items-center justify-between gap-3 rounded-[1.25rem] border border-primary/15 bg-primary/[0.07] px-4 py-3 text-left transition-colors hover:bg-primary/10"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary">{label.replace("{{count}}", String(total))}</p>
        <p className="text-xs text-muted-foreground">
          {copyCount} copy · {fixCount} fixed — tap to view live progress
        </p>
      </div>
      <TrendingUp className="h-5 w-5 shrink-0 text-primary" />
    </button>
  )
}

export function CopyTraderMarketCard({
  trader,
  isActive,
  copyAccessLocked = false,
  copyMinUsd,
  formatMoney,
  riskClassName,
  live,
  t,
  onPreview,
  onCopy,
}: {
  trader: MarketTrader
  isActive: boolean
  copyAccessLocked?: boolean
  copyMinUsd: number
  formatMoney: (n: number) => string
  riskClassName: string
  live: MarketLiveSnapshot
  t: (k: string) => string
  onPreview: () => void
  onCopy: () => void
}) {
  const chartSymbol = resolveDeskChartSymbol(trader.strategies, trader.speciality)
  const growth = copyEstimatedGrowthPct(trader.monthlyReturn)
  const participants = estimatedParticipants(trader)
  const slots = estimatedSlotsRemaining(trader)
  const drawdown = trader.riskLevel === "High" ? 18 : trader.riskLevel === "Medium" ? 12 : 6
  const locked = copyAccessLocked || trader.locked

  return (
    <article
      className={cn(
        NX_MARKET_CARD,
        MOBILE_MARKET_CARD,
        "p-[18px]",
        (isActive || locked) && "ring-2 ring-primary/20 max-md:ring-1",
        locked && !isActive && "opacity-90",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TraderPersonaAvatar name={trader.name} initials={trader.avatar} riskLevel={trader.riskLevel} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold tracking-tight">{trader.name}</h3>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", riskClassName)}>
                {trader.riskLevel} risk
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-primary">
              <Shield className="h-3 w-3" aria-hidden />
              {t("container.market.verifiedDesk")}
            </p>
          </div>
        </div>
        {isActive ? (
          <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase text-primary">
            {t("container.market.active")}
          </span>
        ) : copyAccessLocked ? (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase text-muted-foreground">
            <Lock className="mr-0.5 inline h-3 w-3" />
            {t("container.market.copyLocked")}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-xs font-medium text-muted-foreground">{pairsLabel(trader)}</p>
      <div className="mt-2">
        <LiveMarketRefs chartSymbol={chartSymbol} live={live} />
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">{t("container.market.estimatedGrowth")}</p>
          <p className="font-mono text-lg font-bold text-success">+{growth}%</p>
        </div>
        <MarketDirectionBadge chartSymbol={chartSymbol} live={live} t={t} />
      </div>

      <div className="mt-2 max-md:hidden rounded-xl bg-muted/25 px-2 py-1.5">
        <LiveMiniMarketChart symbol={chartSymbol} refreshKey={live.authorityRevision} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-muted/40 px-2 py-2 text-center">
          <p className="text-[10px] text-muted-foreground">{t("container.market.winRatio")}</p>
          <p className="font-mono text-sm font-bold">{trader.winRate}%</p>
        </div>
        <div className="rounded-xl bg-muted/40 px-2 py-2 text-center">
          <p className="text-[10px] text-muted-foreground">{t("container.market.activity")}</p>
          <p className="text-xs font-semibold text-warning">{t("container.market.highActivity")}</p>
        </div>
        <div className="rounded-xl bg-muted/40 px-2 py-2 text-center">
          <p className="text-[10px] text-muted-foreground">{t("container.market.maxDrawdown")}</p>
          <p className="font-mono text-sm font-bold">~{drawdown}%</p>
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        <Users className="mr-1 inline h-3 w-3" />
        {participants.toLocaleString()} {t("container.market.participants")} · {slots}{" "}
        {t("container.market.availableSlots")}
      </p>

      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" size="sm" className="h-10 flex-1 rounded-xl" onClick={onPreview}>
          <Eye className="mr-1 h-3.5 w-3.5" />
          {t("container.market.learnMore")}
        </Button>
        <Button
          type="button"
          size="sm"
          className={cn("h-10 flex-1 rounded-xl", NX_BTN_PRIMARY)}
          disabled={isActive || locked}
          onClick={onCopy}
        >
          {isActive ? (
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
          ) : locked ? (
            <Lock className="mr-1 h-3.5 w-3.5" />
          ) : (
            <Play className="mr-1 h-3.5 w-3.5" />
          )}
          {isActive
            ? t("container.market.active")
            : locked
              ? t("container.market.copyLocked")
              : t("container.market.copy")}
        </Button>
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        {t("container.market.minCopy").replace("{{min}}", formatMoney(copyMinUsd))}
      </p>
      {copyAccessLocked ? (
        <p className="mt-1 text-center text-[10px] text-muted-foreground">{t("container.market.copyUnlockHint")}</p>
      ) : null}
    </article>
  )
}

export function FixDeskMarketCard({
  trader,
  isActive,
  fixMinUsd,
  formatMoney,
  riskClassName,
  live,
  t,
  onPreview,
  onLock,
}: {
  trader: MarketTrader
  isActive: boolean
  fixMinUsd: number
  formatMoney: (n: number) => string
  riskClassName: string
  live: MarketLiveSnapshot
  t: (k: string) => string
  onPreview: () => void
  onLock: () => void
}) {
  const chartSymbol = resolveDeskChartSymbol(trader.strategies, trader.speciality)
  const growth = fixEstimatedGrowthPct(trader.monthlyReturn)
  const participants = estimatedParticipants(trader)
  const slots = estimatedSlotsRemaining(trader)

  return (
    <article className={cn(NX_MARKET_CARD, MOBILE_MARKET_CARD, "p-[18px]", isActive && "ring-2 ring-warning/35 max-md:ring-1")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TraderPersonaAvatar name={trader.name} initials={trader.avatar} riskLevel={trader.riskLevel} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold tracking-tight">{trader.name}</h3>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", riskClassName)}>
                {trader.riskLevel} risk
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-primary">
              <Shield className="h-3 w-3" aria-hidden />
              {t("container.market.verifiedDesk")}
            </p>
          </div>
        </div>
        {isActive ? (
          <span className="shrink-0 rounded-full bg-warning/15 px-2.5 py-1 text-[10px] font-bold uppercase text-warning">
            {t("container.market.locked")}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-xs font-medium text-muted-foreground">{pairsLabel(trader)}</p>
      <div className="mt-2">
        <LiveMarketRefs chartSymbol={chartSymbol} live={live} />
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">{t("container.market.liveGrowth")}</p>
          <p className="font-mono text-lg font-bold text-success">+{growth}%</p>
          <p className="text-[10px] text-muted-foreground">{t("container.market.estimatedGrowthHint")}</p>
        </div>
        <MarketDirectionBadge chartSymbol={chartSymbol} live={live} t={t} />
      </div>

      <div className="mt-2 max-md:hidden rounded-xl bg-muted/25 px-2 py-1.5">
        <LiveMiniMarketChart symbol={chartSymbol} refreshKey={live.authorityRevision} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <p className="text-[10px] text-muted-foreground">{t("container.market.lockDuration")}</p>
          <p className="text-sm font-semibold">1 · 3 · 6 {t("container.market.lockMonths")}</p>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <p className="text-[10px] text-muted-foreground">{t("container.market.sessionType")}</p>
          <p className="text-sm font-semibold text-primary">{t("container.market.protectedSession")}</p>
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        <Users className="mr-1 inline h-3 w-3" />
        {participants.toLocaleString()} {t("container.market.participants")} · {slots}{" "}
        {t("container.market.availableSlots")}
      </p>

      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" size="sm" className="h-10 flex-1 rounded-xl" onClick={onPreview}>
          <Eye className="mr-1 h-3.5 w-3.5" />
          {t("container.market.learnMore")}
        </Button>
        <Button
          type="button"
          size="sm"
          className={cn("h-10 flex-1 rounded-xl", isActive ? "" : NX_BTN_ACCENT)}
          disabled={isActive}
          onClick={onLock}
        >
          <Lock className="mr-1 h-3.5 w-3.5" />
          {isActive ? t("container.market.locked") : t("container.market.lock")}
        </Button>
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        {t("container.market.minLock").replace("{{min}}", formatMoney(fixMinUsd))}
      </p>
    </article>
  )
}

export function LockedTraderCompact({
  trader,
  mode,
  t,
}: {
  trader: MarketTrader
  mode?: "copy" | "fix"
  t: (k: string) => string
}) {
  const growth =
    mode === "fix"
      ? fixEstimatedGrowthPct(trader.monthlyReturn)
      : copyEstimatedGrowthPct(trader.monthlyReturn)
  return (
    <div className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-border/30 bg-muted/20 px-4 py-3 opacity-70">
      <div className="flex items-center gap-2 min-w-0">
        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{trader.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {trader.lockReason ?? t("container.market.unlockLater")}
          </p>
        </div>
      </div>
      <span className="font-mono text-sm text-muted-foreground">
        +{growth}% {t("container.market.estimatedGrowthShort")}
      </span>
    </div>
  )
}
