"use client"

import { useState, useEffect, useCallback, useRef } from "react"

export default function TestPricePage() {
  const [price, setPrice] = useState<number | null>(null)
  const [prevPrice, setPrevPrice] = useState<number | null>(null)
  const [signal, setSignal] = useState<"BUY" | "SELL" | "HOLD">("HOLD")
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<string>("")
  const [countdown, setCountdown] = useState(2)

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=DOGEUSDT")
      const data = await res.json()
      const p = parseFloat(data.price)
      setPrevPrice((prev) => (prev !== null ? prev : p))
      setPrice(p)
      setLastUpdate(new Date().toLocaleTimeString())
      setError(null)
      console.log("[TestPrice] DOGE price:", p)
      return p
    } catch (err: any) {
      setError(err.message)
      console.error("[TestPrice] Fetch error:", err)
      return null
    }
  }, [])

  // Auto-refresh every 2 seconds using recursive setTimeout
  const refreshTimer = useRef<NodeJS.Timeout | null>(null)
  const countdownTimer = useRef<NodeJS.Timeout | null>(null)

  const startAutoRefresh = useCallback(() => {
    const tick = () => {
      fetchPrice()
      setCountdown(2)
      refreshTimer.current = setTimeout(tick, 2000)
    }
    tick()

    // Countdown ticker
    countdownTimer.current = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1))
    }, 1000)
  }, [fetchPrice])

  useEffect(() => {
    startAutoRefresh()
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      if (countdownTimer.current) clearInterval(countdownTimer.current)
    }
  }, [startAutoRefresh])

  const generateSignal = () => {
    const rand = Math.random()
    const s = rand < 0.4 ? "BUY" : rand < 0.8 ? "SELL" : "HOLD"
    setSignal(s)
    console.log("[TestPrice] Generated signal:", s)
  }

  const priceColor = price !== null && prevPrice !== null
    ? price > prevPrice ? "text-green-400" : price < prevPrice ? "text-red-400" : "text-white"
    : "text-white"

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold mb-2">🐕 DOGE Price Test</h1>
      <p className="text-sm text-gray-500 mb-6">Refreshes every 2 seconds from Binance</p>

      {/* Price Display */}
      <div className={`text-6xl font-bold mb-2 transition-colors duration-300 ${priceColor}`}>
        {price !== null ? `$${price.toFixed(6)}` : "---"}
      </div>

      {/* Signal */}
      <div className={`text-xl font-semibold mb-4 ${
        signal === "BUY" ? "text-green-400" : signal === "SELL" ? "text-red-400" : "text-yellow-400"
      }`}>
        Signal: {signal}
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <span className={`inline-block w-2 h-2 rounded-full ${error ? "bg-red-400" : "bg-green-400 animate-pulse"}`} />
        {error ? `Error: ${error}` : `Last update: ${lastUpdate}`}
        <span className="text-gray-600">| Next refresh in {countdown}s</span>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={generateSignal}
          className="px-6 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 font-medium transition-colors"
        >
          🎲 Generate Signal
        </button>
        <button
          onClick={() => fetchPrice()}
          className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-medium transition-colors"
        >
          🔄 Refresh Now
        </button>
      </div>

      {/* Console hint */}
      <p className="mt-8 text-xs text-gray-600">
        Open console (F12) to see debug logs
      </p>
    </div>
  )
}
