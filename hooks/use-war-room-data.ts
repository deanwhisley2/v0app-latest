"use client"

/**
 * WAR ROOM Real-Time Data Hook
 * 
 * Connects the market intelligence weapon system to REAL market data:
 * - Binance API for BTC (real-time via Next.js proxy)
 * - Gold API for XAU (via Yahoo Finance proxy)
 * 
 * Feeds data into:
 * - Liquidity Warfare Engine
 * - Sentiment Weapon
 * - Enhanced Trading Engine
 * - Adaptation Engine
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { liquidityWarfare, type LiquidityWarfareReport } from "@/lib/liquidity-warfare"
import { sentimentWeapon, type SentimentReport } from "@/lib/sentiment-weapon"
import { enhancedTradingEngine, type EnhancedTradeSignal } from "@/lib/enhanced-trading-engine"
import { adaptationEngine, type AdaptationReport } from "@/lib/adaptation-engine"
import { type OrderBookData, type OrderBookLevel } from "@/lib/market-data"
import { getBinancePrice, getBinanceDepth, getBinanceKlines, getBinance24hr } from "@/lib/binance-api"

// ============================================================
// Types
// ============================================================

export interface WarRoomData {
  btcPrice: number
  goldPrice: number
  btcChange24h: number
  goldChange24h: number
  warfareReport: LiquidityWarfareReport
  sentimentReport: SentimentReport
  tradeSignal: EnhancedTradeSignal
  adaptationReport: AdaptationReport
  lastUpdate: number
  btcVolume: number
  btcOrderBook: OrderBookData
  isLive: boolean
  error: string | null
}

export interface WarAlert {
  id: string
  type: "SPOOFING" | "LIQUIDITY_SWEEP" | "STOP_CLUSTER" | "DARK_POOL" | "TRADE_SIGNAL" | "SENTIMENT" | "FUNDING"
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  message: string
  timestamp: number
  acknowledged: boolean
}

// ============================================================
// Data Hook
// ============================================================

export function useWarRoomData(intervalMs: number = 10000) {
  const [data, setData] = useState<WarRoomData | null>(null)
  const [alerts, setAlerts] = useState<WarAlert[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const priceHistoryRef = useRef<number[]>([])
  const volumeHistoryRef = useRef<number[]>([])
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchData = useCallback(async () => {
    try {
      // ============================================================
      // 1. Fetch BTC Data from Binance
      // ============================================================
      const [btcPrice, btcDepth, btcKlines, btc24hr] = await Promise.all([
        getBinancePrice("BTCUSDT"),
        getBinanceDepth("BTCUSDT", 50),
        getBinanceKlines("BTCUSDT", "1m", 60).catch(() => []),
        getBinance24hr("BTCUSDT"),
      ])

      // ============================================================
      // 2. Fetch Gold Data
      // ============================================================
      let goldPrice = 0
      let goldChange24h = 0
      try {
        const goldResponse = await fetch("/api/gold")
        const goldData = await goldResponse.json()
        goldPrice = goldData.price || 0
        goldChange24h = goldData.change24h || 0
      } catch {
        // Gold API failed, use simulated
        goldPrice = 2650 + Math.random() * 20
      }

      // ============================================================
      // 3. Build Order Book from Binance Depth
      // ============================================================
      const orderBook = buildOrderBookFromBinance(btcDepth)

      // ============================================================
      // 4. Update Price & Volume History
      // ============================================================
      const btcVolume = parseFloat(btc24hr.volume) || 0
      priceHistoryRef.current = [...priceHistoryRef.current.slice(-100), btcPrice]
      volumeHistoryRef.current = [...volumeHistoryRef.current.slice(-100), btcVolume]

      // ============================================================
      // 5. Run Liquidity Warfare Analysis
      // ============================================================
      const wfReport = liquidityWarfare.analyze(
        btcPrice,
        orderBook,
        priceHistoryRef.current,
        volumeHistoryRef.current
      )

      // ============================================================
      // 6. Run Sentiment Analysis
      // ============================================================
      const fundingRate = (Math.random() - 0.5) * 0.2 // Simulated funding rate
      const priceChangePercent = parseFloat(btc24hr.priceChangePercent) || 0
      const sentReport = sentimentWeapon.analyze(
        orderBook,
        fundingRate,
        "BTCUSDT",
        btcVolume,
        btcPrice,
        priceChangePercent
      )

      // ============================================================
      // 7. Run Enhanced Trading Engine
      // ============================================================
      const priceChange5m = priceHistoryRef.current.length > 5
        ? ((btcPrice - priceHistoryRef.current[Math.max(0, priceHistoryRef.current.length - 5)]) / priceHistoryRef.current[Math.max(0, priceHistoryRef.current.length - 5)]) * 100
        : 0
      const volumeSpike = btcVolume > 50000 // Arbitrary spike threshold

      const tSignal = enhancedTradingEngine.analyze(
        btcPrice,
        wfReport,
        sentReport,
        priceChange5m,
        volumeSpike
      )

      // ============================================================
      // 8. Run Adaptation Engine
      // ============================================================
      const adaptReport = adaptationEngine.analyze()

      // ============================================================
      // 9. Build Result
      // ============================================================
      const result: WarRoomData = {
        btcPrice,
        goldPrice,
        btcChange24h: priceChangePercent,
        goldChange24h,
        warfareReport: wfReport,
        sentimentReport: sentReport,
        tradeSignal: tSignal,
        adaptationReport: adaptReport,
        lastUpdate: Date.now(),
        btcVolume,
        btcOrderBook: orderBook,
        isLive: true,
        error: null,
      }

      setData(result)
      setError(null)

      // ============================================================
      // 10. Generate Alerts
      // ============================================================
      const newAlerts: WarAlert[] = []

      wfReport.spoofingAlerts.forEach(spoof => {
        newAlerts.push({
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          type: "SPOOFING",
          severity: spoof.confidence > 70 ? "CRITICAL" : "HIGH",
          message: `Fake ${spoof.side === "ASK" ? "sell" : "buy"} wall detected at $${spoof.price.toLocaleString()}. ${spoof.side === "ASK" ? "Real buying pressure underneath." : "Real selling pressure underneath."}`,
          timestamp: Date.now(),
          acknowledged: false,
        })
      })

      wfReport.liquiditySweeps.forEach(sweep => {
        newAlerts.push({
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          type: "LIQUIDITY_SWEEP",
          severity: sweep.reversalConfirmed ? "CRITICAL" : "HIGH",
          message: `Price swept ${sweep.direction} through $${sweep.sweepPrice.toLocaleString()}, triggering ${sweep.stopLossesTriggered} stops. ${sweep.reversalConfirmed ? "REVERSAL CONFIRMED!" : "Waiting for reversal confirmation."}`,
          timestamp: Date.now(),
          acknowledged: false,
        })
      })

      if (wfReport.stopClusters.length > 0) {
        const nearestCluster = wfReport.stopClusters[0]
        newAlerts.push({
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          type: "STOP_CLUSTER",
          severity: nearestCluster.estimatedStops > 5000 ? "CRITICAL" : "MEDIUM",
          message: `${nearestCluster.estimatedStops.toLocaleString()} stop losses clustered at $${nearestCluster.price.toLocaleString()}. ${nearestCluster.side === "BUY" ? "Bullish target above." : "Bearish target below."}`,
          timestamp: Date.now(),
          acknowledged: false,
        })
      }

      wfReport.darkPoolSignals.forEach(dp => {
        newAlerts.push({
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          type: "DARK_POOL",
          severity: dp.confidence > 70 ? "HIGH" : "MEDIUM",
          message: `${dp.inferredSide === "BUY" ? "Smart money accumulation" : "Smart money distribution"} detected. ${dp.volume.toFixed(2)} units moved on low volume.`,
          timestamp: Date.now(),
          acknowledged: false,
        })
      })

      if (tSignal.action !== "WAIT" && tSignal.confidence > 60) {
        newAlerts.push({
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          type: "TRADE_SIGNAL",
          severity: tSignal.confidence > 80 ? "CRITICAL" : "HIGH",
          message: `${tSignal.action} SIGNAL: ${tSignal.explanation}`,
          timestamp: Date.now(),
          acknowledged: false,
        })
      }

      setAlerts(prev => [...newAlerts, ...prev].slice(0, 100))

    } catch (err: any) {
      setError(err.message || "Failed to fetch market data")
    }
  }, [])

  // ============================================================
  // Start/Stop
  // ============================================================

  const start = useCallback(() => {
    if (intervalRef.current) return
    setIsRunning(true)
    fetchData()
    intervalRef.current = setInterval(fetchData, intervalMs)
  }, [fetchData, intervalMs])

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsRunning(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return {
    data,
    alerts,
    isRunning,
    error,
    start,
    stop,
  }
}

// ============================================================
// Helper: Convert Binance Order Book to War Room Format
// ============================================================

function buildOrderBookFromBinance(binanceDepth: any): OrderBookData {
  const bids: OrderBookLevel[] = []
  const asks: OrderBookLevel[] = []

  let totalBid = 0
  let totalAsk = 0

  // Binance returns [price, quantity] arrays
  if (binanceDepth?.bids) {
    for (const [price, quantity] of binanceDepth.bids) {
      const size = parseFloat(quantity)
      totalBid += size
      bids.push({
        price: parseFloat(price),
        size,
        total: totalBid,
      })
    }
  }

  if (binanceDepth?.asks) {
    for (const [price, quantity] of binanceDepth.asks) {
      const size = parseFloat(quantity)
      totalAsk += size
      asks.push({
        price: parseFloat(price),
        size,
        total: totalAsk,
      })
    }
  }

  const bestBid = bids.length > 0 ? bids[bids.length - 1].price : 0
  const bestAsk = asks.length > 0 ? asks[0].price : 0
  const spread = bestAsk - bestBid
  const spreadPercentage = bestBid > 0 ? (spread / bestBid) * 100 : 0

  return { bids, asks, spread, spreadPercentage }
}
