"use client"

import { useState, useMemo } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  TrendingUp,
  TrendingDown,
  Settings,
  BarChart3,
  CandlestickChart,
  LineChartIcon,
  X,
  Check,
  ChevronDown,
  Palette,
  Maximize2,
  Download,
  Plus,
  Minus,
  Receipt,
  Clock,
} from "lucide-react"
import { formatPrice } from "@/lib/coins-data"
import type { Coin } from "@/lib/coins-data"

interface AdvancedChartProps {
  selectedCoin: Coin
  onCoinSelect: (symbol: string) => void
  coins: Coin[]
}

type ChartType = "candlestick" | "bar" | "line" | "heikin-ashi"

interface ChartSettings {
  volumes: boolean
  tickVolumes: boolean
  periodSeparator: boolean
  askPriceLine: boolean
  countdownToClose: boolean
  freeMovement: boolean
  ohlData: boolean
  dataWindow: boolean
}

interface Position {
  id: string
  type: "long" | "short"
  entry: number
  current: number
  size: number
  pnl: number
  pnlPercent: number
  sl?: number
  tp?: number
}

interface Order {
  id: string
  type: "limit" | "stop"
  side: "buy" | "sell"
  price: number
  amount: number
  filled: number
}

// Generate OHLC data
function generateOHLCData(basePrice: number) {
  const data = []
  let price = basePrice * 0.95

  for (let i = 0; i < 48; i++) {
    const open = price
    const volatility = basePrice * 0.015
    const high = open + Math.random() * volatility
    const low = open - Math.random() * volatility
    const close = low + Math.random() * (high - low)
    const volume = Math.floor(Math.random() * 1000000) + 100000

    data.push({
      time: `${String(i % 24).padStart(2, "0")}:00`,
      open,
      high,
      low,
      close,
      volume,
    })

    price = close
  }
  return data
}

export function AdvancedChart({ selectedCoin, onCoinSelect, coins }: AdvancedChartProps) {
  const [timeframe, setTimeframe] = useState("1D")
  const [chartType, setChartType] = useState<ChartType>("candlestick")
  const [showSettings, setShowSettings] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [chartSettings, setChartSettings] = useState<ChartSettings>({
    volumes: true,
    tickVolumes: false,
    periodSeparator: true,
    askPriceLine: true,
    countdownToClose: true,
    freeMovement: false,
    ohlData: true,
    dataWindow: false,
  })
  const [showTradingPanel, setShowTradingPanel] = useState(true)
  const [colors, setColors] = useState({
    bullish: "#22c55e",
    bearish: "#ef4444",
    background: "#0a0a14",
    grid: "#1a1a2e",
  })

  const timeframes = ["1m", "5m", "15m", "1H", "4H", "1D", "1W", "1M"]
  const quickCoins = coins.slice(0, 6)

  const chartData = useMemo(
    () => generateOHLCData(selectedCoin.price),
    [selectedCoin.price]
  )

  const isPositive = selectedCoin.change24h >= 0

  // Mock positions
  const [positions] = useState<Position[]>([
    {
      id: "1",
      type: "long",
      entry: selectedCoin.price * 0.98,
      current: selectedCoin.price,
      size: 0.5,
      pnl: selectedCoin.price * 0.02 * 0.5,
      pnlPercent: 2.04,
      sl: selectedCoin.price * 0.95,
      tp: selectedCoin.price * 1.05,
    },
  ])

  // Mock orders
  const [orders] = useState<Order[]>([
    { id: "1", type: "limit", side: "buy", price: selectedCoin.price * 0.95, amount: 0.25, filled: 0 },
    { id: "2", type: "stop", side: "sell", price: selectedCoin.price * 0.90, amount: 0.5, filled: 0 },
  ])

  // Trade history
  const [history] = useState([
    { id: "1", side: "buy", price: selectedCoin.price * 0.98, amount: 0.5, time: "14:32:15", pnl: null },
    { id: "2", side: "sell", price: selectedCoin.price * 1.02, amount: 0.3, time: "13:15:42", pnl: 120.50 },
    { id: "3", side: "buy", price: selectedCoin.price * 0.96, amount: 0.8, time: "11:08:33", pnl: null },
  ])

  const chartTypeIcons: Record<ChartType, React.ReactNode> = {
    candlestick: <CandlestickChart className="h-4 w-4" />,
    bar: <BarChart3 className="h-4 w-4" />,
    line: <LineChartIcon className="h-4 w-4" />,
    "heikin-ashi": <CandlestickChart className="h-4 w-4" />,
  }

  const toggleSetting = (key: keyof ChartSettings) => {
    setChartSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const renderChart = () => {
    const commonProps = {
      data: chartData,
    }

    if (chartType === "line") {
      return (
        <LineChart {...commonProps}>
          <defs>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isPositive ? colors.bullish : colors.bearish} stopOpacity={0.3} />
              <stop offset="95%" stopColor={isPositive ? colors.bullish : colors.bearish} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: "#666", fontSize: 10 }} />
          <YAxis domain={["dataMin - 100", "dataMax + 100"]} axisLine={false} tickLine={false} tick={{ fill: "#666", fontSize: 10 }} tickFormatter={(v) => `$${formatPrice(v)}`} width={80} />
          <Tooltip contentStyle={{ backgroundColor: colors.background, border: "1px solid #333", borderRadius: "8px" }} formatter={(v: number) => [`$${formatPrice(v)}`, "Price"]} />
          {chartSettings.askPriceLine && <ReferenceLine y={selectedCoin.price} stroke={colors.bullish} strokeDasharray="3 3" />}
          <Line type="monotone" dataKey="close" stroke={isPositive ? colors.bullish : colors.bearish} strokeWidth={2} dot={false} />
        </LineChart>
      )
    }

    if (chartType === "bar") {
      return (
        <BarChart {...commonProps}>
          <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: "#666", fontSize: 10 }} />
          <YAxis domain={["dataMin - 100", "dataMax + 100"]} axisLine={false} tickLine={false} tick={{ fill: "#666", fontSize: 10 }} tickFormatter={(v) => `$${formatPrice(v)}`} width={80} />
          <Tooltip contentStyle={{ backgroundColor: colors.background, border: "1px solid #333", borderRadius: "8px" }} />
          {chartSettings.askPriceLine && <ReferenceLine y={selectedCoin.price} stroke={colors.bullish} strokeDasharray="3 3" />}
          <Bar dataKey="close" fill={isPositive ? colors.bullish : colors.bearish} radius={[2, 2, 0, 0]} />
        </BarChart>
      )
    }

    // Default: Candlestick / Heikin-Ashi (simplified as area for this demo)
    return (
      <AreaChart {...commonProps}>
        <defs>
          <linearGradient id="candleGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={isPositive ? colors.bullish : colors.bearish} stopOpacity={0.3} />
            <stop offset="95%" stopColor={isPositive ? colors.bullish : colors.bearish} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: "#666", fontSize: 10 }} />
        <YAxis domain={["dataMin - 100", "dataMax + 100"]} axisLine={false} tickLine={false} tick={{ fill: "#666", fontSize: 10 }} tickFormatter={(v) => `$${formatPrice(v)}`} width={80} />
        <Tooltip
          contentStyle={{ backgroundColor: colors.background, border: "1px solid #333", borderRadius: "8px" }}
          content={({ active, payload }) => {
            if (active && payload && payload.length && chartSettings.ohlData) {
              const data = payload[0].payload
              return (
                <div className="rounded-lg border border-border bg-card p-3 text-xs">
                  <p className="mb-1 font-semibold">{data.time}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">O:</span><span className="font-mono">${formatPrice(data.open)}</span>
                    <span className="text-muted-foreground">H:</span><span className="font-mono text-success">${formatPrice(data.high)}</span>
                    <span className="text-muted-foreground">L:</span><span className="font-mono text-destructive">${formatPrice(data.low)}</span>
                    <span className="text-muted-foreground">C:</span><span className="font-mono">${formatPrice(data.close)}</span>
                  </div>
                </div>
              )
            }
            return null
          }}
        />
        {chartSettings.askPriceLine && <ReferenceLine y={selectedCoin.price} stroke={colors.bullish} strokeDasharray="3 3" label={{ value: "Ask", fill: colors.bullish, fontSize: 10 }} />}
        {positions[0]?.sl && <ReferenceLine y={positions[0].sl} stroke={colors.bearish} strokeDasharray="5 5" label={{ value: "SL", fill: colors.bearish, fontSize: 10 }} />}
        {positions[0]?.tp && <ReferenceLine y={positions[0].tp} stroke={colors.bullish} strokeDasharray="5 5" label={{ value: "TP", fill: colors.bullish, fontSize: 10 }} />}
        <Area type="monotone" dataKey="close" stroke={isPositive ? colors.bullish : colors.bearish} strokeWidth={2} fill="url(#candleGradient)" />
      </AreaChart>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card p-5">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full font-mono text-sm font-bold text-white shadow-lg"
              style={{ backgroundColor: selectedCoin.color, boxShadow: `0 0 20px ${selectedCoin.color}40` }}
            >
              {selectedCoin.symbol.slice(0, 3)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold">{selectedCoin.name}</span>
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{selectedCoin.symbol}/USDT</span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <span className="font-mono text-2xl font-bold">${formatPrice(selectedCoin.price)}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold ${isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                  {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {isPositive ? "+" : ""}{selectedCoin.change24h.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Coin Pills */}
          <div className="flex flex-wrap gap-2">
            {quickCoins.map((coin) => (
              <button
                key={coin.symbol}
                onClick={() => onCoinSelect(coin.symbol)}
                className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold transition-all ${selectedCoin.symbol === coin.symbol ? "border-primary/40 bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}
              >
                {coin.symbol}
              </button>
            ))}
          </div>
        </div>

        {/* Chart Controls */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {/* Timeframes */}
          <div className="flex gap-1">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${timeframe === tf ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Chart Type & Controls */}
          <div className="flex items-center gap-2">
            {/* Chart Type Selector */}
            <div className="flex rounded-lg border border-border">
              {(["candlestick", "bar", "line", "heikin-ashi"] as ChartType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${chartType === type ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                  title={type.charAt(0).toUpperCase() + type.slice(1).replace("-", " ")}
                >
                  {chartTypeIcons[type]}
                  <span className="hidden sm:inline capitalize">{type.replace("-", " ")}</span>
                </button>
              ))}
            </div>

            {/* Settings Button */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className={showSettings ? "bg-primary/10 text-primary" : ""}
              >
                <Settings className="h-4 w-4" />
              </Button>

              {/* Settings Dropdown */}
              {showSettings && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-card p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-semibold">Chart Settings</h4>
                    <button onClick={() => setShowSettings(false)}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(chartSettings).map(([key, value]) => (
                      <button
                        key={key}
                        onClick={() => toggleSetting(key as keyof ChartSettings)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted"
                      >
                        <span className="capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                        <div className={`flex h-5 w-5 items-center justify-center rounded ${value ? "bg-primary text-white" : "border border-muted-foreground"}`}>
                          {value && <Check className="h-3 w-3" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Color Picker */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowColorPicker(!showColorPicker)}
                className={showColorPicker ? "bg-primary/10 text-primary" : ""}
              >
                <Palette className="h-4 w-4" />
              </Button>

              {showColorPicker && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-border bg-card p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-semibold">Colors</h4>
                    <button onClick={() => setShowColorPicker(false)}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(colors).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm capitalize">{key}</span>
                        <input
                          type="color"
                          value={value}
                          onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
                          className="h-8 w-12 cursor-pointer rounded border-0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button variant="ghost" size="sm">
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Countdown */}
        {chartSettings.countdownToClose && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Next candle closes in:</span>
            <span className="font-mono text-foreground">23:45:12</span>
          </div>
        )}

        {/* Chart */}
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>

        {/* Volume Chart */}
        {chartSettings.volumes && (
          <div className="mt-2 h-[60px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="time" hide />
                <YAxis hide />
                <Bar dataKey="volume" fill="#3b82f640" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Trading Panel Toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-muted-foreground">Trading Panel</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTradingPanel(!showTradingPanel)}
        >
          {showTradingPanel ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      {/* Trading Panel */}
      {showTradingPanel && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Positions */}
          <Card className="border-border bg-card p-4">
            <h4 className="mb-3 flex items-center gap-2 font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" />
              Open Positions
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{positions.length}</span>
            </h4>
            <div className="space-y-2">
              {positions.map((pos) => (
                <div key={pos.id} className="rounded-lg bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${pos.type === "long" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                      {pos.type.toUpperCase()}
                    </span>
                    <span className={`font-mono text-sm font-semibold ${pos.pnl >= 0 ? "text-success" : "text-destructive"}`}>
                      {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)} ({pos.pnlPercent.toFixed(2)}%)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Entry:</span>
                      <span className="ml-1 font-mono">${formatPrice(pos.entry)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Size:</span>
                      <span className="ml-1 font-mono">{pos.size}</span>
                    </div>
                    {pos.sl && (
                      <div>
                        <span className="text-destructive">SL:</span>
                        <span className="ml-1 font-mono">${formatPrice(pos.sl)}</span>
                      </div>
                    )}
                    {pos.tp && (
                      <div>
                        <span className="text-success">TP:</span>
                        <span className="ml-1 font-mono">${formatPrice(pos.tp)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Orders */}
          <Card className="border-border bg-card p-4">
            <h4 className="mb-3 flex items-center gap-2 font-semibold">
              <Receipt className="h-4 w-4 text-primary" />
              Open Orders
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{orders.length}</span>
            </h4>
            <div className="space-y-2">
              {orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${order.side === "buy" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {order.side.toUpperCase()}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{order.type}</span>
                    </div>
                    <p className="mt-1 font-mono text-sm">${formatPrice(order.price)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm">{order.amount}</p>
                    <button className="mt-1 text-xs text-destructive hover:underline">Cancel</button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Trade History */}
          <Card className="border-border bg-card p-4">
            <h4 className="mb-3 flex items-center gap-2 font-semibold">
              <Clock className="h-4 w-4 text-primary" />
              Trade History
            </h4>
            <div className="space-y-2">
              {history.map((trade) => (
                <div key={trade.id} className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${trade.side === "buy" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {trade.side.toUpperCase()}
                      </span>
                      <span className="font-mono text-sm">${formatPrice(trade.price)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{trade.time}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm">{trade.amount}</p>
                    {trade.pnl !== null && (
                      <p className={`text-xs font-semibold ${trade.pnl >= 0 ? "text-success" : "text-destructive"}`}>
                        {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
