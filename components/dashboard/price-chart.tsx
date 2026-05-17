"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts"
import { Card } from "@/components/ui/card"
import { TrendingUp, TrendingDown } from "lucide-react"
import { formatPrice } from "@/lib/coins-data"
import type { Coin } from "@/lib/coins-data"

interface PriceChartProps {
  selectedCoin: Coin
  onCoinSelect: (symbol: string) => void
  coins: Coin[]
}

type ChartPoint = { time: string; price: number }

function formatBarTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function PriceChart({ selectedCoin, onCoinSelect, coins }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState("1D")
  const timeframes = ["1H", "4H", "1D", "1W", "1M"]
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [anchorPrice, setAnchorPrice] = useState(selectedCoin.price)

  const quickCoins = coins.slice(0, 6)
  const displayCoin = useMemo(
    () => ({ ...selectedCoin, price: anchorPrice > 0 ? anchorPrice : selectedCoin.price }),
    [selectedCoin, anchorPrice]
  )

  const days =
    timeframe === "1H" || timeframe === "4H" ? 1 : timeframe === "1W" ? 7 : timeframe === "1M" ? 30 : 1

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(
          `/api/market/ohlcv?symbol=${encodeURIComponent(selectedCoin.symbol)}&days=${days}`,
          { cache: "no-store" }
        )
        const data = (await res.json()) as {
          ok?: boolean
          bars?: Array<{ timestamp: number; close: number }>
          anchorUsd?: number
        }
        if (cancelled || !res.ok || !data.ok || !data.bars?.length) return
        setChartData(
          data.bars.map((b) => ({
            time: formatBarTime(b.timestamp),
            price: b.close,
          }))
        )
        if (typeof data.anchorUsd === "number" && data.anchorUsd > 0) {
          setAnchorPrice(data.anchorUsd)
        }
      } catch {
        /* keep prior chart for continuity */
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selectedCoin.symbol, days])

  const isPositive = displayCoin.change24h >= 0

  return (
    <Card className="border-border bg-card p-5">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Coin Icon */}
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full font-mono text-sm font-bold text-white shadow-lg"
            style={{
              backgroundColor: selectedCoin.color,
              boxShadow: `0 0 20px ${selectedCoin.color}40`,
            }}
          >
            {selectedCoin.symbol.slice(0, 3)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold">
                {selectedCoin.name}
              </span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {selectedCoin.symbol}/USDT
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="font-mono text-2xl font-bold">
                ${formatPrice(displayCoin.price)}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold ${
                  isPositive
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {isPositive ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                {isPositive ? "+" : ""}
                {selectedCoin.change24h.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Coin Selector Pills */}
        <div className="flex flex-wrap gap-2">
          {quickCoins.map((coin) => (
            <button
              key={coin.symbol}
              onClick={() => onCoinSelect(coin.symbol)}
              className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold transition-all ${
                selectedCoin.symbol === coin.symbol
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-transparent text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {coin.symbol}
            </button>
          ))}
        </div>
      </div>

      {/* Timeframe Buttons */}
      <div className="mb-4 flex gap-1">
        {timeframes.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              timeframe === tf
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={isPositive ? "#22c55e" : "#ef4444"}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={isPositive ? "#22c55e" : "#ef4444"}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#666", fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={["dataMin - 100", "dataMax + 100"]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#666", fontSize: 10 }}
              tickFormatter={(value) => `$${formatPrice(value)}`}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1a1a2e",
                border: "1px solid #333",
                borderRadius: "8px",
                color: "#fff",
              }}
              formatter={(value: number) => [`$${formatPrice(value)}`, "Price"]}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={isPositive ? "#22c55e" : "#ef4444"}
              strokeWidth={2}
              fill="url(#chartGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
