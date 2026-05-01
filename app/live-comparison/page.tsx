"use client"

import { useState, useEffect, useRef, useCallback } from "react"

// ============================================================
// Types
// ============================================================

interface AssetData {
  symbol: string
  label: string
  price: number | null
  prevPrice: number | null
  signal: "BUY" | "SELL" | "HOLD"
  confidence: number
  flash: "up" | "down" | null
  error: string | null
}

interface SignalEntry {
  id: number
  time: string
  asset: string
  signal: "BUY" | "SELL" | "HOLD"
  price: number
  confidence: number
  checked: boolean
  correct: boolean | null
}

// ============================================================
// Simple SMA-based signal generator (no external deps needed)
// ============================================================

function generateSignal(
  currentPrice: number,
  priceHistory: number[]
): { signal: "BUY" | "SELL" | "HOLD"; confidence: number } {
  if (priceHistory.length < 5) {
    return { signal: "HOLD", confidence: 50 }
  }

  const shortSMA =
    priceHistory.slice(-5).reduce((a, b) => a + b, 0) / 5
  const longSMA =
    priceHistory.slice(-20).reduce((a, b) => a + b, 0) /
    Math.min(20, priceHistory.length)

  const diff = ((currentPrice - longSMA) / longSMA) * 100
  const volatility =
    priceHistory.length > 1
      ? priceHistory.reduce((sum, p, i) => {
          if (i === 0) return sum
          return sum + Math.abs(p - priceHistory[i - 1])
        }, 0) / priceHistory.length
      : 0

  let signal: "BUY" | "SELL" | "HOLD"
  let confidence: number

  if (shortSMA > longSMA && diff > 0.5) {
    signal = "BUY"
    confidence = Math.min(95, 50 + Math.abs(diff) * 5 + volatility * 10)
  } else if (shortSMA < longSMA && diff < -0.5) {
    signal = "SELL"
    confidence = Math.min(95, 50 + Math.abs(diff) * 5 + volatility * 10)
  } else {
    signal = "HOLD"
    confidence = 50
  }

  return { signal, confidence: Math.round(confidence) }
}

// ============================================================
// Gold price simulation (moves ±0.2% every tick)
// ============================================================

let simulatedGoldPrice = 2650.0

function getSimulatedGoldPrice(): number {
  const change = simulatedGoldPrice * (Math.random() * 0.004 - 0.002) // ±0.2%
  simulatedGoldPrice += change
  return simulatedGoldPrice
}

// ============================================================
// Initial asset state factory
// ============================================================

function createAsset(
  symbol: string,
  label: string
): AssetData {
  return {
    symbol,
    label,
    price: null,
    prevPrice: null,
    signal: "HOLD",
    confidence: 50,
    flash: null,
    error: null,
  }
}

// ============================================================
// Main Component
// ============================================================

export default function LiveComparisonPage() {
  const [btc, setBtc] = useState<AssetData>(() =>
    createAsset("BTCUSDT", "BTC/USD")
  )
  const [gold, setGold] = useState<AssetData>(() =>
    createAsset("XAU", "XAU/USD (Gold)")
  )
  const [signals, setSignals] = useState<SignalEntry[]>([])
  const [countdown, setCountdown] = useState(3)
  const [lastUpdate, setLastUpdate] = useState<string>("")
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [goldSource, setGoldSource] = useState<"binance" | "simulated">(
    "simulated"
  )

  // Refs to avoid stale closures
  const btcRef = useRef(btc)
  const goldRef = useRef(gold)
  const btcHistoryRef = useRef<number[]>([])
  const goldHistoryRef = useRef<number[]>([])
  const signalIdRef = useRef(0)

  // Keep refs in sync
  useEffect(() => {
    btcRef.current = btc
  }, [btc])
  useEffect(() => {
    goldRef.current = gold
  }, [gold])

  // ============================================================
  // Fetch BTC price from Binance
  // ============================================================

  const fetchBtcPrice = useCallback(async () => {
    try {
      const res = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return parseFloat(data.price)
    } catch (err: any) {
      console.error("[BTC] Fetch error:", err.message)
      return null
    }
  }, [])

  // ============================================================
  // Fetch Gold price (try Binance first, fallback to simulated)
  // ============================================================

  const fetchGoldPrice = useCallback(async () => {
    // Try Binance XAUUSDT first
    try {
      const res = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=XAUUSDT"
      )
      if (res.ok) {
        const data = await res.json()
        const price = parseFloat(data.price)
        if (!isNaN(price) && price > 0) {
          setGoldSource("binance")
          return price
        }
      }
    } catch {
      // Fall through
    }

    // Try GOLDUSDT
    try {
      const res = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=GOLDUSDT"
      )
      if (res.ok) {
        const data = await res.json()
        const price = parseFloat(data.price)
        if (!isNaN(price) && price > 0) {
          setGoldSource("binance")
          return price
        }
      }
    } catch {
      // Fall through
    }

    // Fallback: simulated gold price
    setGoldSource("simulated")
    return getSimulatedGoldPrice()
  }, [])

  // ============================================================
  // Update a single asset
  // ============================================================

  const updateSingleAsset = useCallback(
    (
      asset: AssetData,
      newPrice: number,
      history: number[],
      setAsset: React.Dispatch<React.SetStateAction<AssetData>>,
      setHistory: (h: number[]) => void
    ): { signal: "BUY" | "SELL" | "HOLD"; confidence: number } => {
      const prevPrice = asset.price
      const flash =
        prevPrice !== null
          ? newPrice > prevPrice
            ? "up"
            : newPrice < prevPrice
              ? "down"
              : null
          : null

      const newHistory = [...history, newPrice].slice(-30)
      setHistory(newHistory)

      const { signal, confidence } = generateSignal(newPrice, newHistory)

      setAsset({
        ...asset,
        price: newPrice,
        prevPrice: prevPrice,
        signal,
        confidence,
        flash,
        error: null,
      })

      // Clear flash after 500ms
      setTimeout(() => {
        setAsset((prev: AssetData) => ({ ...prev, flash: null }))
      }, 500)

      return { signal, confidence }
    },
    []
  )

  // ============================================================
  // Main refresh loop (every 3 seconds)
  // ============================================================

  const refreshAll = useCallback(async () => {
    console.log("[Live] Refreshing prices...")

    // Fetch BTC
    const btcPrice = await fetchBtcPrice()
    if (btcPrice !== null) {
      const result = updateSingleAsset(
        btcRef.current,
        btcPrice,
        btcHistoryRef.current,
        setBtc,
        (h) => {
          btcHistoryRef.current = h
        }
      )

      const entry: SignalEntry = {
        id: signalIdRef.current++,
        time: new Date().toLocaleTimeString(),
        asset: "BTC",
        signal: result.signal,
        price: btcPrice,
        confidence: result.confidence,
        checked: false,
        correct: null,
      }
      setSignals((prev) => [entry, ...prev].slice(0, 20))
    } else {
      setBtc((prev) => ({
        ...prev,
        error: "Failed to fetch BTC price",
      }))
    }

    // Fetch Gold
    const goldPrice = await fetchGoldPrice()
    if (goldPrice !== null) {
      const result = updateSingleAsset(
        goldRef.current,
        goldPrice,
        goldHistoryRef.current,
        setGold,
        (h) => {
          goldHistoryRef.current = h
        }
      )

      const entry: SignalEntry = {
        id: signalIdRef.current++,
        time: new Date().toLocaleTimeString(),
        asset: "GOLD",
        signal: result.signal,
        price: goldPrice,
        confidence: result.confidence,
        checked: false,
        correct: null,
      }
      setSignals((prev) => [entry, ...prev].slice(0, 20))
    } else {
      setGold((prev) => ({
        ...prev,
        error: "Failed to fetch Gold price",
      }))
    }

    setLastUpdate(new Date().toLocaleTimeString())
    setSecondsAgo(0)
    setCountdown(3)
  }, [fetchBtcPrice, fetchGoldPrice, updateSingleAsset])

  // ============================================================
  // Check if previous signals were correct
  // ============================================================

  const checkSignals = useCallback(() => {
    const currentBtc = btcRef.current
    const currentGold = goldRef.current

    setSignals((prev) =>
      prev.map((entry) => {
        if (entry.checked) return entry

        const entryTime = new Date(
          `${new Date().toLocaleDateString()} ${entry.time}`
        ).getTime()
        const now = Date.now()
        const elapsed = now - entryTime

        if (elapsed >= 60000) {
          const currentPrice =
            entry.asset === "BTC" ? currentBtc.price : currentGold.price
          if (currentPrice === null) return entry

          const movement =
            ((currentPrice - entry.price) / entry.price) * 100
          let correct: boolean | null = null

          if (entry.signal === "BUY") {
            correct = movement > 0.1
          } else if (entry.signal === "SELL") {
            correct = movement < -0.1
          }

          return { ...entry, checked: true, correct }
        }

        return entry
      })
    )
  }, [])

  // ============================================================
  // Setup: initial fetch + 3-second interval
  // ============================================================

  useEffect(() => {
    console.log("[Live] Page mounted, starting 3-second refresh loop")

    refreshAll()

    const interval = setInterval(() => {
      refreshAll()
    }, 3000)

    const countdownInterval = setInterval(() => {
      setCountdown((c) => (c > 1 ? c - 1 : 3))
      setSecondsAgo((s) => s + 1)
    }, 1000)

    const checkInterval = setInterval(() => {
      checkSignals()
    }, 10000)

    return () => {
      clearInterval(interval)
      clearInterval(countdownInterval)
      clearInterval(checkInterval)
    }
  }, [refreshAll, checkSignals])

  // ============================================================
  // Format helpers
  // ============================================================

  const formatPrice = (price: number, isGold: boolean) => {
    if (isGold) return price.toFixed(2)
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "BUY":
        return "text-green-400"
      case "SELL":
        return "text-red-400"
      default:
        return "text-gray-400"
    }
  }

  const getSignalBg = (signal: string) => {
    switch (signal) {
      case "BUY":
        return "bg-green-500/20 border-green-500/40"
      case "SELL":
        return "bg-red-500/20 border-red-500/40"
      default:
        return "bg-gray-500/20 border-gray-500/40"
    }
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0d0d14] px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Live Comparison</h1>
            <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-400 animate-pulse">
              LIVE
            </span>
          </div>
          <div className="flex items-center gap-6">
            {/* BTC Price */}
            <div className="text-right">
              <div className="text-xs text-gray-500">BTC/USD</div>
              <div
                className={`text-lg font-bold transition-colors duration-300 ${
                  btc.flash === "up"
                    ? "text-green-400"
                    : btc.flash === "down"
                      ? "text-red-400"
                      : "text-white"
                }`}
              >
                {btc.price !== null ? (
                  <>
                    {btc.flash === "up" && "↑ "}
                    {btc.flash === "down" && "↓ "}
                    ${formatPrice(btc.price, false)}
                  </>
                ) : (
                  "---"
                )}
              </div>
            </div>

            {/* Gold Price */}
            <div className="text-right">
              <div className="text-xs text-gray-500">
                XAU/USD
                {goldSource === "simulated" && (
                  <span className="ml-1 text-yellow-400">(sim)</span>
                )}
              </div>
              <div
                className={`text-lg font-bold transition-colors duration-300 ${
                  gold.flash === "up"
                    ? "text-yellow-400"
                    : gold.flash === "down"
                      ? "text-orange-400"
                      : "text-white"
                }`}
              >
                {gold.price !== null ? (
                  <>
                    {gold.flash === "up" && "↑ "}
                    {gold.flash === "down" && "↓ "}
                    ${formatPrice(gold.price, true)}
                  </>
                ) : (
                  "---"
                )}
              </div>
            </div>

            {/* Last Update */}
            <div className="text-right text-xs text-gray-500">
              <div>Updated</div>
              <div className="text-gray-400">{secondsAgo}s ago</div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6">
        {/* Status Bar */}
        <div className="mb-6 flex items-center justify-between rounded-lg border border-white/10 bg-[#0d0d14] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm text-gray-400">
              Refreshing every 3 seconds
            </span>
            <span className="text-xs text-blue-400">
              | Next refresh in {countdown}s
            </span>
            {btc.error && (
              <span className="text-xs text-red-400">| BTC: {btc.error}</span>
            )}
            {gold.error && (
              <span className="text-xs text-red-400">
                | Gold: {gold.error}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-600">
            Last update: {lastUpdate}
          </div>
        </div>

        {/* Main Display - Two Big Boxes */}
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* BTC Box */}
          <div
            className={`relative overflow-hidden rounded-xl border bg-[#0d0d14] p-8 transition-all duration-300 ${
              btc.flash === "up"
                ? "border-green-500/50 shadow-lg shadow-green-500/10"
                : btc.flash === "down"
                  ? "border-red-500/50 shadow-lg shadow-red-500/10"
                  : "border-white/10"
            }`}
          >
            {btc.flash === "up" && (
              <div className="absolute inset-0 bg-green-500/5 animate-pulse" />
            )}
            {btc.flash === "down" && (
              <div className="absolute inset-0 bg-red-500/5 animate-pulse" />
            )}

            <div className="relative z-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">₿ BTC/USD</h2>
                <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs text-blue-400">
                  Binance
                </span>
              </div>

              <div
                className={`mb-2 text-5xl font-bold transition-all duration-200 ${
                  btc.flash === "up"
                    ? "text-green-400 scale-105"
                    : btc.flash === "down"
                      ? "text-red-400 scale-105"
                      : "text-white"
                }`}
              >
                {btc.price !== null
                  ? `$${formatPrice(btc.price, false)}`
                  : "Loading..."}
              </div>

              {btc.prevPrice !== null && btc.price !== null && (
                <div
                  className={`mb-6 text-sm font-medium ${
                    btc.price >= btc.prevPrice
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {btc.price >= btc.prevPrice ? "▲" : "▼"}{" "}
                  {(
                    ((btc.price - btc.prevPrice) / btc.prevPrice) *
                    100
                  ).toFixed(3)}
                  %
                </div>
              )}

              <div
                className={`mb-4 inline-block rounded-lg border px-6 py-3 ${getSignalBg(
                  btc.signal
                )}`}
              >
                <div className="text-center">
                  <div
                    className={`text-2xl font-bold ${getSignalColor(
                      btc.signal
                    )}`}
                  >
                    {btc.signal}
                  </div>
                  <div className="mt-1 text-sm text-gray-400">
                    Confidence: {btc.confidence}%
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                <div className="h-1 flex-1 rounded-full bg-white/10">
                  <div
                    className="h-1 rounded-full bg-blue-400 transition-all duration-1000"
                    style={{ width: `${(countdown / 3) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right">{countdown}s</span>
              </div>
            </div>
          </div>

          {/* Gold Box */}
          <div
            className={`relative overflow-hidden rounded-xl border bg-[#0d0d14] p-8 transition-all duration-300 ${
              gold.flash === "up"
                ? "border-yellow-500/50 shadow-lg shadow-yellow-500/10"
                : gold.flash === "down"
                  ? "border-orange-500/50 shadow-lg shadow-orange-500/10"
                  : "border-white/10"
            }`}
          >
            {gold.flash === "up" && (
              <div className="absolute inset-0 bg-yellow-500/5 animate-pulse" />
            )}
            {gold.flash === "down" && (
              <div className="absolute inset-0 bg-orange-500/5 animate-pulse" />
            )}

            <div className="relative z-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">🥇 XAU/USD (Gold)</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs ${
                    goldSource === "binance"
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-yellow-500/20 text-yellow-400"
                  }`}
                >
                  {goldSource === "binance" ? "Binance" : "Simulated"}
                </span>
              </div>

              <div
                className={`mb-2 text-5xl font-bold transition-all duration-200 ${
                  gold.flash === "up"
                    ? "text-yellow-400 scale-105"
                    : gold.flash === "down"
                      ? "text-orange-400 scale-105"
                      : "text-white"
                }`}
              >
                {gold.price !== null
                  ? `$${formatPrice(gold.price, true)}`
                  : "Loading..."}
              </div>

              {gold.prevPrice !== null && gold.price !== null && (
                <div
                  className={`mb-6 text-sm font-medium ${
                    gold.price >= gold.prevPrice
                      ? "text-yellow-400"
                      : "text-orange-400"
                  }`}
                >
                  {gold.price >= gold.prevPrice ? "▲" : "▼"}{" "}
                  {(
                    ((gold.price - gold.prevPrice) / gold.prevPrice) *
                    100
                  ).toFixed(3)}
                  %
                </div>
              )}

              <div
                className={`mb-4 inline-block rounded-lg border px-6 py-3 ${getSignalBg(
                  gold.signal
                )}`}
              >
                <div className="text-center">
                  <div
                    className={`text-2xl font-bold ${getSignalColor(
                      gold.signal
                    )}`}
                  >
                    {gold.signal}
                  </div>
                  <div className="mt-1 text-sm text-gray-400">
                    Confidence: {gold.confidence}%
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                <div className="h-1 flex-1 rounded-full bg-white/10">
                  <div
                    className="h-1 rounded-full bg-yellow-400 transition-all duration-1000"
                    style={{ width: `${(countdown / 3) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right">{countdown}s</span>
              </div>
            </div>
          </div>
        </div>

        {/* Signal History */}
        <div className="rounded-xl border border-white/10 bg-[#0d0d14] p-5">
          <h2 className="mb-4 text-lg font-semibold">Signal History</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-gray-500">
                  <th className="pb-3 pr-4">Time</th>
                  <th className="pb-3 pr-4">Asset</th>
                  <th className="pb-3 pr-4">Signal</th>
                  <th className="pb-3 pr-4">Price</th>
                  <th className="pb-3 pr-4">Confidence</th>
                  <th className="pb-3 pr-4">Result</th>
                </tr>
              </thead>
              <tbody>
                {signals.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-gray-500"
                    >
                      Waiting for signals...
                    </td>
                  </tr>
                ) : (
                  signals.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-white/5 transition-colors hover:bg-white/5"
                    >
                      <td className="py-2 pr-4 text-gray-400">
                        {entry.time}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`font-medium ${
                            entry.asset === "BTC"
                              ? "text-blue-400"
                              : "text-yellow-400"
                          }`}
                        >
                          {entry.asset}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`font-medium ${getSignalColor(
                            entry.signal
                          )}`}
                        >
                          {entry.signal}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-300">
                        $
                        {formatPrice(
                          entry.price,
                          entry.asset === "GOLD"
                        )}
                      </td>
                      <td className="py-2 pr-4 text-gray-400">
                        {entry.confidence}%
                      </td>
                      <td className="py-2 pr-4">
                        {entry.checked ? (
                          entry.correct === true ? (
                            <span className="flex items-center gap-1 text-green-400">
                              ✅ Correct
                            </span>
                          ) : entry.correct === false ? (
                            <span className="flex items-center gap-1 text-red-400">
                              ❌ Wrong
                            </span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )
                        ) : (
                          <span className="flex items-center gap-1 text-yellow-400">
                            <span className="inline-block h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                            Waiting...
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
