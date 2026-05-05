"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Star, Trash2, TrendingDown, TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Coin } from "@/lib/coins-data"
import { formatPrice } from "@/lib/coins-data"
import { getFavoriteSymbols, getWatchlistSymbols, setFavoriteSymbols, setWatchlistSymbols } from "@/lib/nexus-coin-lists"
import { cn } from "@/lib/utils"

type CoinListScreenProps = {
  mode: "watchlist" | "favorites"
  catalog: Coin[]
  onSelectSymbol: (symbol: string) => void
  onOpenLiveTrading: () => void
}

export function CoinListScreen({ mode, catalog, onSelectSymbol, onOpenLiveTrading }: CoinListScreenProps) {
  const [symbols, setSymbols] = useState<string[]>([])
  const [addSymbol, setAddSymbol] = useState("")

  useEffect(() => {
    setSymbols(mode === "watchlist" ? getWatchlistSymbols() : getFavoriteSymbols())
  }, [mode])

  const persist = useCallback(
    (next: string[]) => {
      setSymbols(next)
      if (mode === "watchlist") setWatchlistSymbols(next)
      else setFavoriteSymbols(next)
    },
    [mode]
  )

  const rows = useMemo(() => {
    const map = new Map(catalog.map((c) => [c.symbol, c]))
    return symbols
      .map((sym) => map.get(sym) ?? catalog.find((c) => c.symbol === sym))
      .filter((c): c is Coin => Boolean(c))
  }, [symbols, catalog])

  const missing = useMemo(() => {
    const map = new Map(catalog.map((c) => [c.symbol, c]))
    return symbols.filter((s) => !map.has(s))
  }, [symbols, catalog])

  const title = mode === "watchlist" ? "Watchlist" : "Favorites"
  const subtitle =
    mode === "watchlist"
      ? "Track pairs you care about. Prices refresh with your market feed."
      : "Starred pairs only. Quick trade jumps to the live desk with that symbol."

  const handleAdd = () => {
    const s = addSymbol.trim().toUpperCase()
    if (!s) return
    const hit = catalog.find((c) => c.symbol === s)
    if (!hit) return
    if (symbols.includes(s)) return
    persist([...symbols, s])
    setAddSymbol("")
  }

  const remove = (sym: string) => persist(symbols.filter((x) => x !== sym))

  const toggleFavoriteFromWatchlist = (sym: string) => {
    const fav = getFavoriteSymbols()
    if (fav.includes(sym)) {
      setFavoriteSymbols(fav.filter((x) => x !== sym))
    } else {
      setFavoriteSymbols([...fav, sym])
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={addSymbol}
            onChange={(e) => setAddSymbol(e.target.value)}
            className="min-w-[160px] rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">{mode === "watchlist" ? "Add to watchlist…" : "Star from catalog…"}</option>
            {catalog
              .filter((c) => !symbols.includes(c.symbol))
              .slice(0, 80)
              .map((c) => (
                <option key={c.symbol} value={c.symbol}>
                  {c.symbol} — {c.name}
                </option>
              ))}
          </select>
          <Button type="button" size="sm" className="gap-1" onClick={handleAdd} disabled={!addSymbol}>
            <Plus className="h-4 w-4" />
            {mode === "watchlist" ? "Add" : "Star"}
          </Button>
        </div>
      </div>

      {missing.length > 0 && (
        <p className="text-xs text-amber-600">
          Some saved symbols are not in the current catalog: {missing.join(", ")}.
        </p>
      )}

      <Card className="border-border bg-card overflow-hidden">
        <div className="divide-y divide-border">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {mode === "watchlist"
                ? "Your watchlist is empty. Add symbols from the catalog above."
                : "No favorites yet. Star pairs from the catalog above or from your watchlist."}
            </div>
          ) : (
            rows.map((coin) => (
              <div
                key={coin.symbol}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: coin.color }} />
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {coin.symbol}
                      <span className="ml-2 font-normal text-muted-foreground">/ USDT</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{coin.name}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold">${formatPrice(coin.price)}</p>
                    <p
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-semibold",
                        coin.change24h >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}
                    >
                      {coin.change24h >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {coin.change24h >= 0 ? "+" : ""}
                      {coin.change24h.toFixed(2)}% <span className="text-muted-foreground font-normal">24h</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      onClick={() => {
                        onSelectSymbol(coin.symbol)
                        onOpenLiveTrading()
                      }}
                    >
                      Trade
                    </Button>
                    {mode === "watchlist" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        title="Toggle favorite"
                        onClick={() => toggleFavoriteFromWatchlist(coin.symbol)}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    {mode === "watchlist" ? (
                      <Button type="button" size="sm" variant="ghost" className="text-rose-600" onClick={() => remove(coin.symbol)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="ghost" className="text-rose-600" onClick={() => remove(coin.symbol)}>
                        Unstar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        {mode === "watchlist"
          ? "Star a row to also add it to Favorites (saved locally on this device)."
          : "Unstar removes the pair from this list only. Watchlist is managed separately."}
      </p>
    </div>
  )
}
