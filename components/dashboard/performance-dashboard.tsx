"use client"

/**
 * Performance Dashboard
 * Displays backtesting results, strategy comparison, and performance metrics
 * Integrates with the backtesting engine for historical analysis
 */

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { coinsData } from "@/lib/coins-data"
import { tradingStrategies } from "@/lib/trading-strategies"
import { backtestingEngine, type BacktestResult, type BacktestMetrics } from "@/lib/backtesting"
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  DollarSign,
  Percent,
  Clock,
  Target,
  Zap,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  LineChart,
  PieChart,
  ArrowUpDown,
  Download,
} from "lucide-react"

// ============================================================
// Metric Card Component
// ============================================================

interface MetricCardProps {
  title: string
  value: string | number
  change?: number
  icon: React.ReactNode
  description?: string
  isLoading?: boolean
  variant?: "default" | "positive" | "negative" | "warning"
}

function MetricCard({
  title,
  value,
  change,
  icon,
  description,
  isLoading = false,
  variant = "default",
}: MetricCardProps) {
  const variantStyles = {
    default: "border-border",
    positive: "border-green-500/30 bg-green-500/5",
    negative: "border-red-500/30 bg-red-500/5",
    warning: "border-yellow-500/30 bg-yellow-500/5",
  }

  if (isLoading) {
    return (
      <Card className={variantStyles[variant]}>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={variantStyles[variant]}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-4 w-4 text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && (
          <div className="flex items-center gap-1 mt-1">
            {change >= 0 ? (
              <TrendingUp className="h-3 w-3 text-green-500" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-500" />
            )}
            <span
              className={`text-xs ${
                change >= 0 ? "text-green-500" : "text-red-500"
              }`}
            >
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)}%
            </span>
          </div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Trade History Table
// ============================================================

interface TradeHistoryTableProps {
  positions: BacktestResult["positions"]
}

function TradeHistoryTable({ positions }: TradeHistoryTableProps) {
  if (positions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No trades executed</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">Entry</th>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">Exit</th>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">Side</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Entry Price</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Exit Price</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Qty</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">P&L</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">P&L %</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Duration</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/50">
              <td className="py-2 px-3 text-xs">
                {new Date(pos.entryTimestamp).toLocaleDateString()}
              </td>
              <td className="py-2 px-3 text-xs">
                {pos.exitTimestamp
                  ? new Date(pos.exitTimestamp).toLocaleDateString()
                  : "Open"}
              </td>
              <td className="py-2 px-3">
                <Badge
                  variant={pos.side === "long" ? "default" : "secondary"}
                  className="text-xs"
                >
                  {pos.side === "long" ? "LONG" : "SHORT"}
                </Badge>
              </td>
              <td className="py-2 px-3 text-right font-mono text-xs">
                ${pos.entryPrice.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right font-mono text-xs">
                {pos.exitPrice
                  ? `$${pos.exitPrice.toLocaleString()}`
                  : "-"}
              </td>
              <td className="py-2 px-3 text-right font-mono text-xs">
                {pos.quantity.toFixed(4)}
              </td>
              <td
                className={`py-2 px-3 text-right font-mono text-xs font-medium ${
                  pos.pnl >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)}
              </td>
              <td
                className={`py-2 px-3 text-right font-mono text-xs font-medium ${
                  pos.pnlPercentage >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {pos.pnlPercentage >= 0 ? "+" : ""}
                {pos.pnlPercentage.toFixed(2)}%
              </td>
              <td className="py-2 px-3 text-right text-xs text-muted-foreground">
                {pos.holdingPeriod.toFixed(1)}h
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// Equity Curve Chart (Simplified)
// ============================================================

interface EquityCurveChartProps {
  equityCurve: BacktestResult["equityCurve"]
  initialCapital: number
}

function EquityCurveChart({ equityCurve, initialCapital }: EquityCurveChartProps) {
  if (equityCurve.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <LineChart className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No equity data available</p>
      </div>
    )
  }

  const prices = equityCurve.map((e) => e.equity)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  const width = 100
  const height = 200

  const points = equityCurve.map((point, i) => {
    const x = (i / (equityCurve.length - 1)) * width
    const y = height - ((point.equity - min) / range) * height
    return `${x},${y}`
  })

  const pathD = `M ${points.join(" L ")}`

  const finalEquity = equityCurve[equityCurve.length - 1]?.equity || initialCapital
  const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-muted-foreground">Final Equity</span>
          <div className="text-2xl font-bold">
            ${finalEquity.toLocaleString()}
          </div>
        </div>
        <div className="text-right">
          <span className="text-sm text-muted-foreground">Total Return</span>
          <div
            className={`text-2xl font-bold ${
              totalReturn >= 0 ? "text-green-500" : "text-red-500"
            }`}
          >
            {totalReturn >= 0 ? "+" : ""}
            {totalReturn.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="relative w-full h-[200px] bg-muted/20 rounded-lg overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          {/* Gradient fill under the line */}
          <defs>
            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={
                  totalReturn >= 0 ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"
                }
                stopOpacity="0.3"
              />
              <stop
                offset="100%"
                stopColor={
                  totalReturn >= 0 ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"
                }
                stopOpacity="0.05"
              />
            </linearGradient>
          </defs>

          {/* Fill area */}
          <path
            d={`${pathD} L ${width},${height} L 0,${height} Z`}
            fill="url(#equityGradient)"
          />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke={
              totalReturn >= 0 ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"
            }
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {new Date(equityCurve[0]?.timestamp || Date.now()).toLocaleDateString()}
        </span>
        <span>
          {new Date(
            equityCurve[equityCurve.length - 1]?.timestamp || Date.now()
          ).toLocaleDateString()}
        </span>
      </div>
    </div>
  )
}

// ============================================================
// Strategy Comparison
// ============================================================

interface StrategyComparisonProps {
  results: BacktestResult[]
  isLoading: boolean
}

function StrategyComparison({ results, isLoading }: StrategyComparisonProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Run a backtest to see strategy comparison</p>
      </div>
    )
  }

  const bestPnl = Math.max(...results.map((r) => r.metrics.totalPnlPercentage))
  const worstPnl = Math.min(...results.map((r) => r.metrics.totalPnlPercentage))
  const range = bestPnl - worstPnl || 1

  return (
    <div className="space-y-3">
      {results.map((result, i) => {
        const pnl = result.metrics.totalPnlPercentage
        const normalizedPnl = ((pnl - worstPnl) / range) * 100

        return (
          <div
            key={i}
            className="flex items-center gap-4 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm truncate">
                  {result.strategyName}
                </span>
                <Badge variant="outline" className="text-xs">
                  {result.metrics.totalTrades} trades
                </Badge>
              </div>
              <div className="relative h-2 w-full rounded-full overflow-hidden bg-muted">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                    pnl >= 0 ? "bg-green-500" : "bg-red-500"
                  }`}
                  style={{ width: `${Math.max(1, Math.min(100, normalizedPnl))}%` }}
                />
              </div>
            </div>
            <div className="text-right">
              <div
                className={`text-lg font-bold ${
                  pnl >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {pnl >= 0 ? "+" : ""}
                {pnl.toFixed(2)}%
              </div>
              <div className="text-xs text-muted-foreground">
                Win Rate: {result.metrics.winRate.toFixed(1)}%
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// Main Performance Dashboard Component
// ============================================================

export function PerformanceDashboard() {
  const [selectedSymbol, setSelectedSymbol] = useState("BTC")
  const [selectedStrategy, setSelectedStrategy] = useState("all")
  const [selectedDays, setSelectedDays] = useState("30")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [comparisonResults, setComparisonResults] = useState<BacktestResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("overview")

  const runBacktest = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const backtestResult = await backtestingEngine.runBacktest({
        symbol: selectedSymbol,
        strategyName: selectedStrategy,
        days: parseInt(selectedDays),
        initialCapital: 10000,
        feeRate: 0.001,
        positionSize: 0.25,
      })
      setResult(backtestResult)

      // Run comparison across all strategies
      const comparison = await backtestingEngine.runComparison(
        selectedSymbol,
        parseInt(selectedDays)
      )
      setComparisonResults(comparison)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to run backtest"
      )
      setResult(null)
    } finally {
      setIsLoading(false)
    }
  }, [selectedSymbol, selectedStrategy, selectedDays])

  // Run initial backtest on mount
  useEffect(() => {
    runBacktest()
  }, [runBacktest])

  const metrics = result?.metrics

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Performance Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            Backtest trading strategies and analyze performance metrics
          </p>
        </div>
        <Button
          onClick={runBacktest}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw
            className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
          />
          {isLoading ? "Running..." : "Run Backtest"}
        </Button>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Asset</label>
              <Select
                value={selectedSymbol}
                onValueChange={setSelectedSymbol}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  {coinsData.map((coin) => (
                    <SelectItem key={coin.symbol} value={coin.symbol}>
                      {coin.name} ({coin.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Strategy</label>
              <Select
                value={selectedStrategy}
                onValueChange={setSelectedStrategy}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Strategies</SelectItem>
                  {tradingStrategies.map((strategy) => (
                    <SelectItem key={strategy.name} value={strategy.name}>
                      {strategy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Period</label>
              <Select value={selectedDays} onValueChange={setSelectedDays}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 Days</SelectItem>
                  <SelectItem value="14">14 Days</SelectItem>
                  <SelectItem value="30">30 Days</SelectItem>
                  <SelectItem value="60">60 Days</SelectItem>
                  <SelectItem value="90">90 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="font-medium text-red-500">Backtest Error</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={runBacktest}
                className="ml-auto"
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !error && !result && (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">No Backtest Data</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Select your parameters and run a backtest to see performance
              metrics.
            </p>
            <Button onClick={runBacktest} className="gap-2">
              <Zap className="h-4 w-4" />
              Run Backtest
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && metrics && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full max-w-md">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="trades">Trades</TabsTrigger>
            <TabsTrigger value="equity">Equity</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                title="Total P&L"
                value={`$${metrics.totalPnl.toLocaleString()}`}
                change={metrics.totalPnlPercentage}
                icon={<DollarSign className="h-4 w-4" />}
                isLoading={isLoading}
                variant={metrics.totalPnl >= 0 ? "positive" : "negative"}
              />
              <MetricCard
                title="Win Rate"
                value={`${metrics.winRate.toFixed(1)}%`}
                icon={<Target className="h-4 w-4" />}
                isLoading={isLoading}
                variant={
                  metrics.winRate >= 50 ? "positive" : "negative"
                }
              />
              <MetricCard
                title="Sharpe Ratio"
                value={metrics.sharpeRatio.toFixed(2)}
                icon={<Activity className="h-4 w-4" />}
                isLoading={isLoading}
                variant={
                  metrics.sharpeRatio >= 1
                    ? "positive"
                    : metrics.sharpeRatio >= 0
                    ? "warning"
                    : "negative"
                }
              />
              <MetricCard
                title="Max Drawdown"
                value={`${metrics.maxDrawdownPercentage.toFixed(1)}%`}
                icon={<TrendingDown className="h-4 w-4" />}
                isLoading={isLoading}
                variant={
                  metrics.maxDrawdownPercentage <= 20
                    ? "positive"
                    : metrics.maxDrawdownPercentage <= 40
                    ? "warning"
                    : "negative"
                }
              />
            </div>

            {/* Detailed Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Detailed Metrics</CardTitle>
                <CardDescription>
                  {result.strategyName} on {result.symbol} - {result.period}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Trades</p>
                    <p className="text-xl font-bold">{metrics.totalTrades}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Winning Trades</p>
                    <p className="text-xl font-bold text-green-500">
                      {metrics.winningTrades}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Losing Trades</p>
                    <p className="text-xl font-bold text-red-500">
                      {metrics.losingTrades}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Profit Factor</p>
                    <p className="text-xl font-bold">
                      {metrics.profitFactor === 999
                        ? "∞"
                        : metrics.profitFactor.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Win</p>
                    <p className="text-xl font-bold text-green-500">
                      ${metrics.averageWin.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Loss</p>
                    <p className="text-xl font-bold text-red-500">
                      ${Math.abs(metrics.averageLoss).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Largest Win</p>
                    <p className="text-xl font-bold text-green-500">
                      ${metrics.largestWin.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Largest Loss</p>
                    <p className="text-xl font-bold text-red-500">
                      ${Math.abs(metrics.largestLoss).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Holding Period</p>
                    <p className="text-xl font-bold">
                      {metrics.averageHoldingPeriod.toFixed(1)}h
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Fees</p>
                    <p className="text-xl font-bold">
                      ${metrics.totalFees.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Buy & Hold Return</p>
                    <p
                      className={`text-xl font-bold ${
                        metrics.buyAndHoldReturn >= 0
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      {metrics.buyAndHoldReturn >= 0 ? "+" : ""}
                      {metrics.buyAndHoldReturn.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">vs Buy & Hold</p>
                    <p
                      className={`text-xl font-bold ${
                        metrics.outperformance >= 0
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      {metrics.outperformance >= 0 ? "+" : ""}
                      {metrics.outperformance.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Strategy Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Strategy Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4">
                  <Badge className="text-sm px-3 py-1">
                    {result.strategyName}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {result.symbol} · {result.period}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">
                      Start Price
                    </p>
                    <p className="font-mono font-medium">
                      ${metrics.startPrice.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">
                      End Price
                    </p>
                    <p className="font-mono font-medium">
                      ${metrics.endPrice.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">
                      Strategy Return
                    </p>
                    <p
                      className={`font-mono font-medium ${
                        metrics.strategyReturn >= 0
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      {metrics.strategyReturn >= 0 ? "+" : ""}
                      {metrics.strategyReturn.toFixed(2)}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">
                      Outperformance
                    </p>
                    <p
                      className={`font-mono font-medium ${
                        metrics.outperformance >= 0
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      {metrics.outperformance >= 0 ? "+" : ""}
                      {metrics.outperformance.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trades Tab */}
          <TabsContent value="trades">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Trade History</CardTitle>
                <CardDescription>
                  {result.positions.length} trades executed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TradeHistoryTable positions={result.positions} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Equity Tab */}
          <TabsContent value="equity">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Equity Curve</CardTitle>
                <CardDescription>
                  Portfolio value over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EquityCurveChart
                  equityCurve={result.equityCurve}
                  initialCapital={10000}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Compare Tab */}
          <TabsContent value="compare">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Strategy Comparison</CardTitle>
                <CardDescription>
                  Compare performance across all strategies
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StrategyComparison
                  results={comparisonResults}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
