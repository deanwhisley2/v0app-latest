import { pickTradableNow } from "@/lib/expert/joelin-ranking"
import { buildGovernedFocus20 } from "@/lib/expert/focus-daily-pipeline"
import { phase2Store } from "@/lib/expert/phase2-store"
import type { JoelinCoin } from "@/lib/expert/phase2-types"

export async function GET(request: Request) {
  const encoder = new TextEncoder()
  let intervalId: ReturnType<typeof setInterval> | undefined
  let heartbeatId: ReturnType<typeof setInterval> | undefined

  const cleanup = () => {
    if (intervalId !== undefined) {
      clearInterval(intervalId)
      intervalId = undefined
    }
    if (heartbeatId !== undefined) {
      clearInterval(heartbeatId)
      heartbeatId = undefined
    }
  }

  request.signal.addEventListener("abort", cleanup)

  const stream = new ReadableStream({
    start(controller) {
      let closed = false
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return
        try {
          controller.enqueue(chunk)
        } catch {
          closed = true
          cleanup()
        }
      }

      const emit = () => {
        const activeTradeSymbols = Array.from(phase2Store.sessions.values())
          .filter((s) => s.status === "ACTIVE" || s.status === "PENDING")
          .map((s) => s.symbol.toUpperCase())
        const governance = buildGovernedFocus20(phase2Store.joelin, { activeTradeSymbols, limit: 20 })
        const focusSet = new Set(governance.focusSymbols)
        const coins = phase2Store.joelin.map((coin) => ({
          ...coin,
          focusMember: focusSet.has(coin.symbol.toUpperCase()),
          supervisionLevel: (activeTradeSymbols.includes(coin.symbol.toUpperCase())
            ? "CRITICAL"
            : coin.minuteTradeConfirmed
              ? "HIGH"
              : "NORMAL") as JoelinCoin["supervisionLevel"],
        }))
        phase2Store.joelin = coins
        const payload = {
          coins,
          tradableNow: pickTradableNow(coins, 10),
          focusDaily: governance.focusDaily,
          analyzedProfitableCoins: governance.analyzedProfitableCoins,
          lastUpdated: new Date().toISOString(),
          nextRefresh: new Date(Date.now() + 300_000).toISOString(),
        }
        safeEnqueue(encoder.encode(`event: joelin-update\ndata: ${JSON.stringify(payload)}\n\n`))
      }
      emit()
      intervalId = setInterval(emit, 300_000)
      heartbeatId = setInterval(() => {
        safeEnqueue(encoder.encode(`event: ping\ndata: {}\n\n`))
      }, 20_000)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
