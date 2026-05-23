"use client"

import {
  BarChart3,
  CheckCircle2,
  Eye,
  Lock,
  Play,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { TraderPersonaAvatar } from "@/components/dashboard/trader-persona-avatar"
import { cn } from "@/lib/utils"
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

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Deterministic mini sparkline (display only). */
function MiniGrowthChart({ traderId, trendPct }: { traderId: string; trendPct: number }) {
  const w = 100
  const h = 36
  const n = 24
  const seed = hashSeed(traderId)
  const bias = Math.min(1, Math.max(-0.3, trendPct / 80))
  const pts: string[] = []
  for (let i = 0; i < n; i++) {
    const wave = Math.sin((i + (seed % 7)) * 0.55) * 0.35
    const drift = (i / (n - 1)) * bias
    const y = h - (0.25 + drift + wave) * h * 0.85
    const x = (i / (n - 1)) * w
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
  }
  const up = trendPct >= 0
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`g-${traderId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={up ? "var(--primary-green)" : "var(--danger-red)"} stopOpacity="0.35" />
          <stop offset="100%" stopColor={up ? "var(--primary-green)" : "var(--danger-red)"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${pts.join(" ")} L${w},${h} L0,${h} Z`} fill={`url(#g-${traderId})`} />
      <path
        d={pts.join(" ")}
        fill="none"
        stroke={up ? "var(--primary-green)" : "var(--danger-red)"}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function pairsLabel(trader: MarketTrader): string {
  if (trader.strategies?.length >= 2) {
    return trader.strategies.slice(0, 2).join(" · ")
  }
  const s = trader.speciality.trim()
  if (/btc|eth|usdt/i.test(s)) return s
  return "BTC/USDT · ETH/USDT"
}

function estimatedFollowers(trader: MarketTrader): number {
  if (trader.followers && trader.followers > 0) return trader.followers
  return 120 + (hashSeed(trader.id) % 2800)
}

function estimatedCopiedUsd(trader: MarketTrader): string {
  const k = 8 + (hashSeed(trader.id) % 420)
  return `$${k * 10}k+`
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
  copyMinUsd,
  formatMoney,
  riskClassName,
  t,
  onPreview,
  onCopy,
}: {
  trader: MarketTrader
  isActive: boolean
  copyMinUsd: number
  formatMoney: (n: number) => string
  riskClassName: string
  t: (k: string) => string
  onPreview: () => void
  onCopy: () => void
}) {
  const growth30d = Math.round(trader.monthlyReturn * 3.6 * 10) / 10
  const followers = estimatedFollowers(trader)
  const drawdown = trader.riskLevel === "High" ? 18 : trader.riskLevel === "Medium" ? 12 : 6

  return (
    <article className={cn(NX_MARKET_CARD, "p-[18px]", isActive && "ring-2 ring-primary/30")}>
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
        ) : null}
      </div>

      <p className="mt-3 text-xs font-medium text-muted-foreground">{pairsLabel(trader)}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-muted/40 px-2 py-2 text-center">
          <p className="text-[10px] text-muted-foreground">{t("container.market.growth30d")}</p>
          <p className="font-mono text-sm font-bold text-success">+{growth30d}%</p>
        </div>
        <div className="rounded-xl bg-muted/40 px-2 py-2 text-center">
          <p className="text-[10px] text-muted-foreground">{t("container.market.winRatio")}</p>
          <p className="font-mono text-sm font-bold">{trader.winRate}%</p>
        </div>
        <div className="rounded-xl bg-muted/40 px-2 py-2 text-center">
          <p className="text-[10px] text-muted-foreground">{t("container.market.followers")}</p>
          <p className="font-mono text-sm font-bold">{followers.toLocaleString()}</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-muted/25 px-2 py-1.5">
        <MiniGrowthChart traderId={trader.id} trendPct={growth30d} />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{t("container.market.maxDrawdown").replace("{{n}}", String(drawdown))}</span>
        <span>{t("container.market.copied").replace("{{amount}}", estimatedCopiedUsd(trader))}</span>
      </div>

      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" size="sm" className="h-10 flex-1 rounded-xl" onClick={onPreview}>
          <Eye className="mr-1 h-3.5 w-3.5" />
          {t("container.market.preview")}
        </Button>
        <Button
          type="button"
          size="sm"
          className={cn("h-10 flex-1 rounded-xl", NX_BTN_PRIMARY)}
          disabled={isActive}
          onClick={onCopy}
        >
          {isActive ? (
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
          ) : (
            <Play className="mr-1 h-3.5 w-3.5" />
          )}
          {isActive ? t("container.market.active") : t("container.market.copy")}
        </Button>
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        {t("container.market.minCopy").replace("{{min}}", formatMoney(copyMinUsd))}
      </p>
    </article>
  )
}

export function FixDeskMarketCard({
  trader,
  isActive,
  fixMinUsd,
  formatMoney,
  riskClassName,
  t,
  onPreview,
  onLock,
}: {
  trader: MarketTrader
  isActive: boolean
  fixMinUsd: number
  formatMoney: (n: number) => string
  riskClassName: string
  t: (k: string) => string
  onPreview: () => void
  onLock: () => void
}) {
  return (
    <article
      className={cn(
        NX_MARKET_CARD,
        "flex flex-col gap-3 p-[18px]",
        isActive && "ring-2 ring-warning/35",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <TraderPersonaAvatar name={trader.name} initials={trader.avatar} riskLevel={trader.riskLevel} />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{trader.name}</h3>
            <span className={cn("mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", riskClassName)}>
              {trader.riskLevel}
            </span>
          </div>
        </div>
        {isActive ? (
          <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warning">
            {t("container.market.locked")}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{trader.speciality}</p>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">{t("container.market.curve")}</p>
          <p className="font-mono text-lg font-bold text-success">~{trader.monthlyReturn}%</p>
          <p className="text-[10px] text-muted-foreground">{t("container.market.perMonth")}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">{t("container.market.terms")}</p>
          <p className="text-xs font-medium">1 · 3 · 6 mo</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="h-9 flex-1 rounded-xl text-xs" onClick={onPreview}>
          {t("container.market.preview")}
        </Button>
        <Button
          type="button"
          size="sm"
          className={cn("h-9 flex-1 rounded-xl text-xs", isActive ? "" : NX_BTN_ACCENT)}
          disabled={isActive}
          onClick={onLock}
        >
          <Lock className="mr-1 h-3 w-3" />
          {isActive ? t("container.market.locked") : t("container.market.lock")}
        </Button>
      </div>
      <p className="text-center text-[10px] text-muted-foreground">
        {t("container.market.minLock").replace("{{min}}", formatMoney(fixMinUsd))}
      </p>
    </article>
  )
}

export function LockedTraderCompact({
  trader,
  t,
}: {
  trader: MarketTrader
  t: (k: string) => string
}) {
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
      <span className="font-mono text-sm text-muted-foreground">+{trader.monthlyReturn}%</span>
    </div>
  )
}
