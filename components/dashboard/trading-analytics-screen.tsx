"use client"

import { useMemo } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Activity, PieChart, Target, TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import { formatPrice } from "@/lib/coins-data"

type TradingAnalyticsScreenProps = {
  availableBalance: number
}

const EQUITY_CURVE = [
  { day: "Apr 27", equity: 8420, pnl: 120 },
  { day: "Apr 28", equity: 8580, pnl: 160 },
  { day: "Apr 29", equity: 8510, pnl: -70 },
  { day: "Apr 30", equity: 8720, pnl: 210 },
  { day: "May 1", equity: 8890, pnl: 170 },
  { day: "May 2", equity: 9020, pnl: 130 },
  { day: "May 3", equity: 9180, pnl: 160 },
]

const VOLUME_BY_PAIR = [
  { pair: "BTC", vol: 42 },
  { pair: "ETH", vol: 28 },
  { pair: "SOL", vol: 18 },
  { pair: "LINK", vol: 8 },
  { pair: "Other", vol: 14 },
]

export function TradingAnalyticsScreen({ availableBalance }: TradingAnalyticsScreenProps) {
  const summary = useMemo(() => {
    const totalPnl = EQUITY_CURVE.reduce((a, d) => a + d.pnl, 0)
    const wins = EQUITY_CURVE.filter((d) => d.pnl > 0).length
    const winRate = Math.round((wins / EQUITY_CURVE.length) * 100)
    return { totalPnl, winRate, trades: 47, bestPair: "ETH/USDT" }
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Portfolio overview, performance, and trading mix. Figures below are illustrative until exchange sync is on.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">7d P/L</span>
          </div>
          <p className={`mt-2 font-mono text-2xl font-bold ${summary.totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {summary.totalPnl >= 0 ? "+" : ""}${summary.totalPnl.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Closed trades · sample window</p>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Win rate</span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-foreground">{summary.winRate}%</p>
          <p className="mt-1 text-xs text-muted-foreground">Days positive vs tracked</p>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Trades</span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-foreground">{summary.trades}</p>
          <p className="mt-1 text-xs text-muted-foreground">Last 30 days (demo)</p>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <PieChart className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Best pair</span>
          </div>
          <p className="mt-2 text-lg font-bold text-foreground">{summary.bestPair}</p>
          <p className="mt-1 text-xs text-muted-foreground">By realized P/L share</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="border-border bg-card p-4 lg:col-span-3">
          <h2 className="text-sm font-semibold text-foreground">Equity curve</h2>
          <p className="text-xs text-muted-foreground">Simulated account equity vs time</p>
          <div className="mt-4 h-[260px] w-full min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={EQUITY_CURVE} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`$${formatPrice(value)}`, "Equity"]}
                />
                <Area type="monotone" dataKey="equity" stroke="hsl(var(--primary))" fill="url(#eqFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="border-border bg-card p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">Volume by pair</h2>
          <p className="text-xs text-muted-foreground">Share of notional last 7d</p>
          <div className="mt-4 h-[260px] w-full min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={VOLUME_BY_PAIR} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="pair" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`${value}%`, "Share"]}
                />
                <Bar dataKey="vol" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Portfolio snapshot</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Available balance (from your Nexus wallet):{" "}
          <span className="font-mono font-semibold text-foreground">${formatPrice(availableBalance)}</span>
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-muted-foreground">
          <li>Hook exchange APIs to replace demo curves with real fills and balances.</li>
          <li>Export CSV and tax reports can plug into this view later.</li>
        </ul>
      </Card>
    </div>
  )
}
