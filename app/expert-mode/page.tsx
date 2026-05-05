"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type AnalysisResult = {
  analysisId: string
  status: "processing" | "completed" | "cancelled"
  result?: { action: "BUY" | "SELL" | "HOLD"; confidence: number; reasons: string[]; entryPrice?: number }
}

type TradeOrder = {
  id: string
  orderId: string
  type: "BUY" | "SELL"
  status: "PENDING" | "FILLED" | "CANCELLED" | "FAILED"
  price: number
  quantity: number
  quoteAmount: number
  createdAt: string
}

type ChatMessage = {
  id: string
  timestamp: string
  type: "pending" | "order" | "status" | "error" | "notification"
  content: string
}

type SessionStatusResponse = {
  sessionId: string
  status: string
  usedAmount: number
  remainingAmount: number
  activeOrders: TradeOrder[]
  history: TradeOrder[]
  pnl: number
}

function ExpertModeContent() {
  const params = useSearchParams()
  const initialSymbol = params.get("symbol")?.toUpperCase() ?? "BTCUSDT"
  const [symbol, setSymbol] = useState(initialSymbol)
  const [timeWindowMinutes, setTimeWindowMinutes] = useState(5)
  const [useNex, setUseNex] = useState(true)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)

  const [manualConfig, setManualConfig] = useState({
    buyPrice: 0,
    sellPrice: 0,
    stopLossPercent: 2,
    timeInTradeMinutes: 30,
    repeatCount: 1,
    amountPerTrade: 10,
  })
  const [nexConfig, setNexConfig] = useState({
    totalAmount: 50,
    maxTradeDurationMinutes: 60,
    stopProfitPercent: 3,
    stopLossPercent: 2,
    entryDelayMinutes: 0,
  })
  const [sessionStatus, setSessionStatus] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionData, setSessionData] = useState<SessionStatusResponse | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [sessionHistory, setSessionHistory] = useState<Array<{ sessionId: string; status: string; pnl: number; endedAt: string }>>([])
  const [pendingSince, setPendingSince] = useState<number | null>(null)

  const canExecute = useMemo(() => result?.status === "completed" && !!result.analysisId, [result])
  const pendingSeconds = useMemo(() => {
    if (!pendingSince) return 0
    return Math.max(0, Math.floor((Date.now() - pendingSince) / 1000))
  }, [pendingSince, sessionData?.status, chatMessages.length])

  async function startAnalysis() {
    setAnalysisLoading(true)
    setSessionStatus(null)
    const timeWindowSeconds = Math.max(60, Math.min(600, Math.floor(timeWindowMinutes * 60)))
    const res = await fetch("/api/expert/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, timeWindowSeconds, useNex }),
    })
    const data = (await res.json()) as AnalysisResult
    setResult(data)
    setAnalysisLoading(false)
    if (typeof window !== "undefined" && "Notification" in window && data.status === "completed") {
      const spawn = () => new Notification(`Analysis Complete: ${symbol}`, { body: `${data.result?.action} with ${data.result?.confidence}% confidence` })
      if (Notification.permission === "granted") spawn()
      else if (Notification.permission !== "denied") void Notification.requestPermission().then((p) => p === "granted" && spawn())
    }
    try {
      const audio = new Audio("/sounds/analysis-complete.mp3")
      void audio.play().catch(() => {})
    } catch {
      // ignore optional sound failure
    }
  }

  async function executeManual() {
    if (!result?.analysisId) return
    const res = await fetch("/api/expert/execute/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId: result.analysisId, config: manualConfig }),
    })
    const data = await res.json()
    setSessionStatus(`Manual: ${data.status} (session ${data.sessionId})`)
    setActiveSessionId(data.sessionId)
    setPendingSince(Date.now())
  }

  async function executeNex() {
    if (!result?.analysisId) return
    const res = await fetch("/api/expert/execute/nex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId: result.analysisId, config: nexConfig }),
    })
    const data = await res.json()
    setSessionStatus(`Nex: ${data.status} (session ${data.sessionId})`)
    setActiveSessionId(data.sessionId)
    setPendingSince(Date.now())
  }

  useEffect(() => {
    if (!activeSessionId) return
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`/api/expert/session/${encodeURIComponent(activeSessionId)}/status`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as SessionStatusResponse
        if (cancelled) return
        setSessionData(data)
        if (data.status !== "PENDING" && data.status !== "ACTIVE") {
          setSessionHistory((prev) => [{ sessionId: data.sessionId, status: data.status, pnl: data.pnl, endedAt: new Date().toISOString() }, ...prev.slice(0, 9)])
        }
      } catch {
        // ignore transient polling failures
      }
    }

    void poll()
    const id = setInterval(() => {
      void poll()
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [activeSessionId])

  useEffect(() => {
    if (!activeSessionId) return
    const es = new EventSource(`/api/chat/ws?sessionId=${encodeURIComponent(activeSessionId)}`)
    const onMessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as ChatMessage
        setChatMessages((prev) => [...prev, payload].slice(-200))
        if (payload.type === "pending" && !pendingSince) {
          setPendingSince(Date.now())
        }
      } catch {
        // ignore malformed payloads
      }
    }
    es.addEventListener("chat-message", onMessage)
    return () => {
      es.removeEventListener("chat-message", onMessage)
      es.close()
    }
  }, [activeSessionId, pendingSince])

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Expert Mode</h1>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Analysis</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Symbol</Label>
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="BTCUSDT" />
          </div>
          <div>
            <Label>Time Window (minutes)</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={timeWindowMinutes}
              onChange={(e) => setTimeWindowMinutes(Number(e.target.value))}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" variant={useNex ? "default" : "outline"} onClick={() => setUseNex((v) => !v)}>
              Nex {useNex ? "ON" : "OFF"}
            </Button>
            <Button onClick={() => void startAnalysis()} disabled={analysisLoading}>
              {analysisLoading ? "Analyzing..." : "Start Analysis"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="font-semibold">Result</h2>
        {result ? (
          <>
            <p>Status: {result.status}</p>
            {result.result && (
              <div className="text-sm">
                <p>
                  Action: {result.result.action} ({result.result.confidence}%)
                </p>
                <ul className="list-disc pl-4">
                  {result.result.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No analysis yet.</p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold">Execution</h2>
        <Tabs defaultValue="manual">
          <TabsList>
            <TabsTrigger value="manual">Manual Trade</TabsTrigger>
            <TabsTrigger value="nex">Nex Trade</TabsTrigger>
          </TabsList>
          <TabsContent value="manual" className="space-y-3 pt-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Input placeholder="Buy Price" type="number" value={manualConfig.buyPrice} onChange={(e) => setManualConfig((p) => ({ ...p, buyPrice: Number(e.target.value) }))} />
              <Input placeholder="Sell Price" type="number" value={manualConfig.sellPrice} onChange={(e) => setManualConfig((p) => ({ ...p, sellPrice: Number(e.target.value) }))} />
              <Input placeholder="Stop Loss %" type="number" value={manualConfig.stopLossPercent} onChange={(e) => setManualConfig((p) => ({ ...p, stopLossPercent: Number(e.target.value) }))} />
              <Input placeholder="Time in Trade (min)" type="number" value={manualConfig.timeInTradeMinutes} onChange={(e) => setManualConfig((p) => ({ ...p, timeInTradeMinutes: Number(e.target.value) }))} />
              <Input placeholder="Repeat Count" type="number" value={manualConfig.repeatCount} onChange={(e) => setManualConfig((p) => ({ ...p, repeatCount: Number(e.target.value) }))} />
              <Input placeholder="Amount per Trade" type="number" value={manualConfig.amountPerTrade} onChange={(e) => setManualConfig((p) => ({ ...p, amountPerTrade: Number(e.target.value) }))} />
            </div>
            <Button onClick={() => void executeManual()} disabled={!canExecute}>Start Manual Session</Button>
          </TabsContent>

          <TabsContent value="nex" className="space-y-3 pt-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Input placeholder="Total Amount" type="number" value={nexConfig.totalAmount} onChange={(e) => setNexConfig((p) => ({ ...p, totalAmount: Number(e.target.value) }))} />
              <Input placeholder="Max Duration (min)" type="number" value={nexConfig.maxTradeDurationMinutes} onChange={(e) => setNexConfig((p) => ({ ...p, maxTradeDurationMinutes: Number(e.target.value) }))} />
              <Input placeholder="Stop Profit %" type="number" value={nexConfig.stopProfitPercent} onChange={(e) => setNexConfig((p) => ({ ...p, stopProfitPercent: Number(e.target.value) }))} />
              <Input placeholder="Stop Loss %" type="number" value={nexConfig.stopLossPercent} onChange={(e) => setNexConfig((p) => ({ ...p, stopLossPercent: Number(e.target.value) }))} />
              <Input placeholder="Entry Delay (min)" type="number" value={nexConfig.entryDelayMinutes} onChange={(e) => setNexConfig((p) => ({ ...p, entryDelayMinutes: Number(e.target.value) }))} />
            </div>
            <Button onClick={() => void executeNex()} disabled={!canExecute}>Schedule Nex Session</Button>
          </TabsContent>
        </Tabs>
        {sessionStatus && <p className="mt-3 text-sm text-muted-foreground">{sessionStatus}</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-2 font-semibold">Pending Panel</h3>
          {activeSessionId ? (
            <p className="text-sm text-muted-foreground">
              BOT PENDING - Verifying safety measures
              {sessionData?.status === "PENDING" ? ` (${pendingSeconds}s)` : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No active session.</p>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 font-semibold">Session Summary</h3>
          {sessionData ? (
            <div className="space-y-1 text-sm">
              <p>Status: {sessionData.status}</p>
              <p>Used/Remaining: ${sessionData.usedAmount.toFixed(2)} / ${sessionData.remainingAmount.toFixed(2)}</p>
              <p>PnL: ${sessionData.pnl.toFixed(2)}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No session summary yet.</p>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 font-semibold">Order Feed (History)</h3>
          <div className="max-h-60 space-y-2 overflow-y-auto text-sm">
            {(sessionData?.history ?? []).map((o) => (
              <div key={o.id} className="rounded border border-border p-2">
                <p className="font-medium">
                  {o.type} · {o.status}
                </p>
                <p className="text-xs text-muted-foreground">
                  ID {o.orderId} · ${o.price} · qty {o.quantity}
                </p>
              </div>
            ))}
            {(!sessionData || sessionData.history.length === 0) && <p className="text-muted-foreground">No filled/cancelled orders yet.</p>}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 font-semibold">Active Orders</h3>
          <div className="max-h-60 space-y-2 overflow-y-auto text-sm">
            {(sessionData?.activeOrders ?? []).map((o) => (
              <div key={o.id} className="rounded border border-border p-2">
                <p className="font-medium">
                  {o.type} · {o.status}
                </p>
                <p className="text-xs text-muted-foreground">
                  ID {o.orderId} · ${o.price} · quote ${o.quoteAmount}
                </p>
              </div>
            ))}
            {(!sessionData || sessionData.activeOrders.length === 0) && <p className="text-muted-foreground">No active orders.</p>}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="mb-2 font-semibold">Status Feed (Trading Chat)</h3>
        <div className="max-h-60 space-y-2 overflow-y-auto text-sm">
          {chatMessages.map((m) => (
            <div key={m.id} className="rounded border border-border p-2">
              <p className="font-medium">
                {m.type.toUpperCase()} · {new Date(m.timestamp).toLocaleTimeString()}
              </p>
              <p className="text-muted-foreground">{m.content}</p>
            </div>
          ))}
          {chatMessages.length === 0 && <p className="text-muted-foreground">No chat activity yet.</p>}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-2 font-semibold">Session History</h3>
        <div className="max-h-52 space-y-2 overflow-y-auto text-sm">
          {sessionHistory.map((s) => (
            <div key={`${s.sessionId}-${s.endedAt}`} className="rounded border border-border p-2">
              <p className="font-medium">
                {s.sessionId} · {s.status}
              </p>
              <p className="text-xs text-muted-foreground">
                PnL ${s.pnl.toFixed(2)} · {new Date(s.endedAt).toLocaleString()}
              </p>
            </div>
          ))}
          {sessionHistory.length === 0 && <p className="text-muted-foreground">No completed sessions yet.</p>}
        </div>
      </Card>
    </div>
  )
}

export default function ExpertModePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl p-6 text-sm text-muted-foreground">Loading Expert Mode...</div>}>
      <ExpertModeContent />
    </Suspense>
  )
}
