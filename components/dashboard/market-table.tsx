"use client"

import { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  TrendingUp,
  TrendingDown,
  Search,
  ArrowUpDown,
  Flame,
  AlertTriangle,
} from "lucide-react"
import {
  formatPrice,
  formatVolume,
  formatMarketCap,
  getSortedCoins,
  getTopGainers,
  getTopLosers,
} from "@/lib/coins-data"
import type { Coin } from "@/lib/coins-data"

interface MarketTableProps {
  coins: Coin[]
  onCoinSelect: (symbol: string) => void
  selectedCoin: Coin
}

export function MarketTable({ coins, onCoinSelect, selectedCoin }: MarketTableProps) {
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"change24h" | "change7d" | "volume" | "marketCap">("change24h")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [activeFilter, setActiveFilter] = useState<"all" | "gainers" | "losers">("all")

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc")
    } else {
      setSortBy(column)
      setSortOrder("desc")
    }
  }

  const filteredCoins = useMemo(() => {
    let result = coins

    // Apply search filter
    if (search) {
      result = result.filter(
        (coin) =>
          coin.symbol.toLowerCase().includes(search.toLowerCase()) ||
          coin.name.toLowerCase().includes(search.toLowerCase())
      )
    }

    // Apply gainers/losers filter
    if (activeFilter === "gainers") {
      result = result.filter((coin) => coin.change24h > 0)
    } else if (activeFilter === "losers") {
      result = result.filter((coin) => coin.change24h < 0)
    }

    // Apply sorting
    return getSortedCoins(result, sortBy, sortOrder)
  }, [coins, search, sortBy, sortOrder, activeFilter])

  const topGainers = getTopGainers(coins, 5)
  const topLosers = getTopLosers(coins, 5)

  return (
    <div className="space-y-4">
      {/* Top Gainers & Losers Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Gainers */}
        <Card className="border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Flame className="h-4 w-4 text-success" />
            <h3 className="text-sm font-semibold">Top Gainers (24h)</h3>
          </div>
          <div className="space-y-2">
            {topGainers.map((coin, i) => (
              <button
                key={coin.symbol}
                onClick={() => onCoinSelect(coin.symbol)}
                className="flex w-full items-center justify-between rounded-lg bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 font-mono text-xs text-muted-foreground">
                    #{i + 1}
                  </span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: coin.color }}
                  />
                  <span className="font-medium">{coin.symbol}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-muted-foreground">
                    ${formatPrice(coin.price)}
                  </span>
                  <span className="flex items-center gap-1 font-mono text-sm font-semibold text-success">
                    <TrendingUp className="h-3 w-3" />+{coin.change24h.toFixed(2)}%
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Top Losers */}
        <Card className="border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold">Top Losers (24h)</h3>
          </div>
          <div className="space-y-2">
            {topLosers.map((coin, i) => (
              <button
                key={coin.symbol}
                onClick={() => onCoinSelect(coin.symbol)}
                className="flex w-full items-center justify-between rounded-lg bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 font-mono text-xs text-muted-foreground">
                    #{i + 1}
                  </span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: coin.color }}
                  />
                  <span className="font-medium">{coin.symbol}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-muted-foreground">
                    ${formatPrice(coin.price)}
                  </span>
                  <span className="flex items-center gap-1 font-mono text-sm font-semibold text-destructive">
                    <TrendingDown className="h-3 w-3" />{coin.change24h.toFixed(2)}%
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* All Coins Table */}
      <Card className="border-border bg-card p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">All Coins</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {filteredCoins.length} coins
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Buttons */}
            <div className="flex gap-1">
              {(["all", "gainers", "losers"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    activeFilter === filter
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search coins..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-[180px] pl-8 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="pb-3 text-left font-medium">#</th>
                <th className="pb-3 text-left font-medium">Coin</th>
                <th className="pb-3 text-right font-medium">Price</th>
                <th
                  className="cursor-pointer pb-3 text-right font-medium hover:text-foreground"
                  onClick={() => handleSort("change24h")}
                >
                  <span className="inline-flex items-center gap-1">
                    24h %
                    <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th
                  className="cursor-pointer pb-3 text-right font-medium hover:text-foreground"
                  onClick={() => handleSort("change7d")}
                >
                  <span className="inline-flex items-center gap-1">
                    7d %
                    <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th
                  className="hidden cursor-pointer pb-3 text-right font-medium hover:text-foreground md:table-cell"
                  onClick={() => handleSort("volume")}
                >
                  <span className="inline-flex items-center gap-1">
                    Volume
                    <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th
                  className="hidden cursor-pointer pb-3 text-right font-medium hover:text-foreground lg:table-cell"
                  onClick={() => handleSort("marketCap")}
                >
                  <span className="inline-flex items-center gap-1">
                    Market Cap
                    <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCoins.map((coin, i) => (
                <tr
                  key={coin.symbol}
                  onClick={() => onCoinSelect(coin.symbol)}
                  className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30 ${
                    selectedCoin.symbol === coin.symbol ? "bg-primary/5" : ""
                  }`}
                >
                  <td className="py-3 font-mono text-xs text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: coin.color }}
                      />
                      <span className="font-medium">{coin.symbol}</span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {coin.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 text-right font-mono text-sm">
                    ${formatPrice(coin.price)}
                  </td>
                  <td className="py-3 text-right">
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-sm font-medium ${
                        coin.change24h >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {coin.change24h >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {coin.change24h >= 0 ? "+" : ""}
                      {coin.change24h.toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <span
                      className={`font-mono text-sm ${
                        coin.change7d >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {coin.change7d >= 0 ? "+" : ""}
                      {coin.change7d.toFixed(2)}%
                    </span>
                  </td>
                  <td className="hidden py-3 text-right font-mono text-sm text-muted-foreground md:table-cell">
                    {formatVolume(coin.volume)}
                  </td>
                  <td className="hidden py-3 text-right font-mono text-sm text-muted-foreground lg:table-cell">
                    {formatMarketCap(coin.marketCap)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
