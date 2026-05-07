"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { FocusCoinInsight } from "@/lib/expert/phase2-types"

type JoelinCoin = {
  symbol: string
  action: "BUY" | "SELL" | "HOLD"
  confidence: number
  safetyLevel: "HIGH" | "MEDIUM" | "LOW"
  tradableLevel: number
  price: number
  lastAnalysis: string
  minuteTradeConfirmed?: boolean
  minuteTradeBlockReason?: string
  minuteTradeReviewAt?: string
}

export default function JoelinPage() {
  const router = useRouter()
  const [coins, setCoins] = useState<JoelinCoin[]>([])
  const [tradableNow, setTradableNow] = useState<JoelinCoin[]>([])
  const [search, setSearch] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(300)
  const [analyzedProfitableCoins, setAnalyzedProfitableCoins] = useState<FocusCoinInsight[]>([])

  async function fetchJoelin() {
    const res = await fetch("/api/joelin/oscillator", { cache: "no-store" })
    const data = await res.json()
    setCoins(data.coins ?? [])
    setTradableNow(data.tradableNow ?? [])
    setAnalyzedProfitableCoins(data.analyzedProfitableCoins ?? [])
    setLastUpdated(data.lastUpdated ? new Date(data.lastUpdated) : new Date())
    setCountdown(300)
  }

  useEffect(() => {
    void fetchJoelin()
    const interval = setInterval(() => {
      void fetchJoelin()
    }, 300_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const es = new EventSource("/api/joelin/stream")
    const onUpdate = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as {
          coins: JoelinCoin[]
          tradableNow?: JoelinCoin[]
          analyzedProfitableCoins?: FocusCoinInsight[]
          lastUpdated: string
        }
        setCoins(payload.coins ?? [])
        setTradableNow(payload.tradableNow ?? [])
        setAnalyzedProfitableCoins(payload.analyzedProfitableCoins ?? [])
        setLastUpdated(payload.lastUpdated ? new Date(payload.lastUpdated) : new Date())
        setCountdown(300)
      } catch {
        // ignore malformed events
      }
    }
    es.addEventListener("joelin-update", onUpdate)
    return () => {
      es.removeEventListener("joelin-update", onUpdate)
      es.close()
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 300))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  async function reAnalyze(symbol: string) {
    await fetch("/api/joelin/re-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    })
    await fetchJoelin()
  }

  const filteredCoins = useMemo(
    () => coins.filter((coin) => coin.symbol.toLowerCase().includes(search.toLowerCase())),
    [coins, search]
  )

  const getActionColor = (action: string, confidence: number) => {
    if (action === "BUY" && confidence >= 70) return "border-green-500/60 bg-green-500/10"
    if (action === "SELL" && confidence >= 70) return "border-red-500/60 bg-red-500/10"
    return "border-yellow-500/60 bg-yellow-500/10"
  }

  const getSafetyIcon = (level: string) => {
    if (level === "HIGH") return "🟢"
    if (level === "MEDIUM") return "🟡"
    if (level === "LOW") return "🔴"
    return "⚪"
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Joelin Oscillator</h1>
        <div className="text-right text-sm text-muted-foreground">
          <div>
            Next refresh: {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
          </div>
          <div className="text-xs">Last updated: {lastUpdated?.toLocaleTimeString() ?? "--"}</div>
        </div>
      </div>

      <Input
        placeholder="Search coin..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-sm"
      />

      {tradableNow.length > 0 && (
        <Card className="mb-6 border-primary/30 bg-primary/5 p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Top tradable now (BUY/SELL, ≥65% conf., not LOW safety)</h2>
          <div className="flex flex-wrap gap-2">
            {tradableNow.map((c) => (
              <Badge
                key={c.symbol}
                variant={c.action === "BUY" ? "default" : c.action === "SELL" ? "destructive" : "secondary"}
                className="cursor-pointer font-mono text-xs"
                onClick={() => router.push(`/expert-mode?symbol=${encodeURIComponent(c.symbol)}`)}
              >
                {c.symbol.replace("USDT", "")} · {c.action} {c.confidence}%
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {analyzedProfitableCoins.length > 0 && (
        <Card className="mb-6 border-emerald-500/30 bg-emerald-500/5 p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Analyzed profitable candidates (Focus-20 daily)</h2>
          <div className="flex flex-wrap gap-2">
            {analyzedProfitableCoins.map((c) => (
              <Badge
                key={c.symbol}
                variant="outline"
                className="cursor-pointer font-mono text-xs"
                onClick={() => router.push(`/expert-mode?symbol=${encodeURIComponent(c.symbol)}`)}
              >
                {c.symbol.replace("USDT", "")} · edge {c.expectedEdgeBps}bps · score {c.profitabilityScore}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredCoins.map((coin) => (
          <Card
            key={coin.symbol}
            className={`cursor-pointer border p-4 transition-transform hover:scale-[1.01] ${getActionColor(coin.action, coin.confidence)}`}
            onClick={() => router.push(`/expert-mode?symbol=${encodeURIComponent(coin.symbol)}`)}
          >
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold">{coin.symbol}</h3>
                <div className="text-sm text-muted-foreground">${coin.price.toLocaleString()}</div>
              </div>
              <Badge variant={coin.action === "BUY" ? "default" : coin.action === "SELL" ? "destructive" : "secondary"}>
                {coin.action} {coin.confidence}%
              </Badge>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-sm">
                <span>{getSafetyIcon(coin.safetyLevel)}</span>
                <span>{coin.safetyLevel}</span>
              </div>
              <div className="text-sm">Score: {coin.tradableLevel}/100</div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  void reAnalyze(coin.symbol)
                }}
              >
                Re-analyze
              </Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {coin.minuteTradeConfirmed
                ? "Minute-trade confirmed"
                : `Blocked for minute-trade${coin.minuteTradeBlockReason ? `: ${coin.minuteTradeBlockReason}` : ""}`}
            </div>

            <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${coin.tradableLevel}%` }} />
            </div>
          </Card>
        ))}
      </div>

      {filteredCoins.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">No coins found matching "{search}"</div>
      )}
    </div>
  )
}
