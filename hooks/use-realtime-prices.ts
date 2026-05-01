"use client"

/**
 * Real-time Price Streaming Hook
 * Simulates WebSocket-style price updates with configurable intervals
 * Falls back to simulated ticks when CoinGecko API is unavailable
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { coinsData, type Coin } from "@/lib/coins-data"
import { simulatePriceTick, fetchMultiplePrices } from "@/lib/market-data"

export interface PriceTick {
  symbol: string
  price: number
  change24h: number
  timestamp: number
}

interface UseRealtimePricesOptions {
  symbols?: string[]
  intervalMs?: number
  volatility?: number
  useLiveApi?: boolean
}

interface UseRealtimePricesReturn {
  prices: Record<string, number>
  changes: Record<string, number>
  lastUpdate: number | null
  isConnected: boolean
  error: string | null
  getPrice: (symbol: string) => number
  getChange: (symbol: string) => number
  getCoin: (symbol: string) => Coin | undefined
  reconnect: () => void
}

export function useRealtimePrices(
  options: UseRealtimePricesOptions = {}
): UseRealtimePricesReturn {
  const {
    symbols = coinsData.map((c) => c.symbol),
    intervalMs = 2000,
    volatility = 0.002,
    useLiveApi = false,
  } = options

  const [prices, setPrices] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    for (const coin of coinsData) {
      initial[coin.symbol] = coin.price
    }
    return initial
  })

  const [changes, setChanges] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    for (const coin of coinsData) {
      initial[coin.symbol] = coin.change24h
    }
    return initial
  })

  const [lastUpdate, setLastUpdate] = useState<number | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const basePricesRef = useRef<Record<string, number>>({ ...prices })
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)

  // Simulate real-time price ticks
  const simulateTicks = useCallback(() => {
    setPrices((prev) => {
      const updated = { ...prev }
      const updatedChanges: Record<string, number> = {}

      for (const symbol of symbols) {
        const basePrice = basePricesRef.current[symbol] || prev[symbol] || 0
        if (basePrice > 0) {
          const newPrice = simulatePriceTick(basePrice, volatility)
          updated[symbol] = newPrice

          // Calculate change from base price
          const change = ((newPrice - basePrice) / basePrice) * 100
          updatedChanges[symbol] = Number(change.toFixed(2))
        }
      }

      setChanges(updatedChanges)
      setLastUpdate(Date.now())
      return updated
    })
  }, [symbols, volatility])

  // Fetch live prices from CoinGecko
  const fetchLivePrices = useCallback(async () => {
    try {
      const livePrices = await fetchMultiplePrices(symbols)
      if (Object.keys(livePrices).length > 0) {
        setPrices((prev) => {
          const updated = { ...prev }
          const updatedChanges: Record<string, number> = {}

          for (const [symbol, price] of Object.entries(livePrices)) {
            if (price > 0) {
              const basePrice = basePricesRef.current[symbol] || prev[symbol] || price
              const change = ((price - basePrice) / basePrice) * 100
              updated[symbol] = price
              updatedChanges[symbol] = Number(change.toFixed(2))
            }
          }

          setChanges(updatedChanges)
          return updated
        })
        setLastUpdate(Date.now())
        setError(null)
        reconnectAttemptsRef.current = 0
      }
    } catch (err) {
      reconnectAttemptsRef.current++
      // After 3 failed attempts, fall back to simulation
      if (reconnectAttemptsRef.current >= 3) {
        setError("Live API unavailable, using simulated prices")
        // Switch to simulation mode
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
        intervalRef.current = setInterval(simulateTicks, intervalMs)
      }
    }
  }, [symbols, intervalMs, simulateTicks])

  // Start/stop the price stream
  useEffect(() => {
    setIsConnected(true)

    if (useLiveApi) {
      // Try live API first
      fetchLivePrices()
      intervalRef.current = setInterval(fetchLivePrices, Math.max(intervalMs, 10000))
    } else {
      // Use simulated ticks
      intervalRef.current = setInterval(simulateTicks, intervalMs)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setIsConnected(false)
    }
  }, [useLiveApi, intervalMs, simulateTicks, fetchLivePrices])

  // Helper functions
  const getPrice = useCallback(
    (symbol: string): number => prices[symbol] || 0,
    [prices]
  )

  const getChange = useCallback(
    (symbol: string): number => changes[symbol] || 0,
    [changes]
  )

  const getCoin = useCallback(
    (symbol: string): Coin | undefined =>
      coinsData.find((c) => c.symbol === symbol),
    []
  )

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0
    setError(null)
    if (useLiveApi) {
      fetchLivePrices()
    }
  }, [useLiveApi, fetchLivePrices])

  return {
    prices,
    changes,
    lastUpdate,
    isConnected,
    error,
    getPrice,
    getChange,
    getCoin,
    reconnect,
  }
}
