"use client"

/**
 * useMarketData Hook
 * Provides real-time market data, price simulation, and paper trading integration
 * Fetches from CoinGecko API with simulated fallback for real-time feel
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { coinsData, type Coin } from "@/lib/coins-data"
import {
  fetchMultiplePrices,
  fetchHistoricalData,
  fetchMarketSnapshots,
  simulatePriceTick,
  updateCoinsWithMarketData,
  generateOrderBook,
  type OHLCV,
  type MarketSnapshot,
  type OrderBookData,
} from "@/lib/market-data"
import {
  paperTradingEngine,
  type PaperPortfolio,
  type PaperOrder,
  type PaperPosition,
} from "@/lib/paper-trading"

// ============================================================
// Types
// ============================================================

export interface MarketDataState {
  coins: Coin[]
  snapshots: MarketSnapshot[]
  selectedCoin: Coin
  historicalData: OHLCV[]
  orderBook: OrderBookData
  portfolio: PaperPortfolio
  isLive: boolean
  isApiAvailable: boolean
  lastUpdate: number
}

export interface UseMarketDataReturn extends MarketDataState {
  selectCoin: (symbol: string) => void
  refreshPrices: () => Promise<void>
  refreshHistorical: () => Promise<void>
  placeOrder: (params: {
    symbol: string
    side: "buy" | "sell"
    type: "market" | "limit" | "stop"
    quantity: number
    price?: number
    stopPrice?: number
    leverage?: number
  }) => PaperOrder
  closePosition: (symbol: string, quantity?: number) => PaperOrder | null
  cancelOrder: (orderId: string) => boolean
  resetPortfolio: () => void
  toggleLiveMode: () => void
}

// ============================================================
// Hook
// ============================================================

export function useMarketData(initialSymbol: string = "BTC"): UseMarketDataReturn {
  const [coins, setCoins] = useState<Coin[]>(coinsData)
  const [snapshots, setSnapshots] = useState<MarketSnapshot[]>([])
  const [selectedCoinSymbol, setSelectedCoinSymbol] = useState(initialSymbol)
  const [historicalData, setHistoricalData] = useState<OHLCV[]>([])
  const [orderBook, setOrderBook] = useState<OrderBookData>(() => {
    const coin = coinsData.find((c) => c.symbol === initialSymbol)
    return generateOrderBook(coin?.price ?? 100)
  })
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(() => paperTradingEngine.getPortfolio())
  const [isLive, setIsLive] = useState(false)
  const [isApiAvailable, setIsApiAvailable] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(Date.now())

  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const apiIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pnlIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const selectedCoin = coins.find((c) => c.symbol === selectedCoinSymbol) || coins[0]

  // ============================================================
  // Select Coin
  // ============================================================

  const selectCoin = useCallback((symbol: string) => {
    setSelectedCoinSymbol(symbol)
  }, [])

  // ============================================================
  // Refresh Prices from API
  // ============================================================

  const refreshPrices = useCallback(async () => {
    try {
      const priceMap = await fetchMultiplePrices(coins.map((c) => c.symbol))
      if (Object.keys(priceMap).length > 0) {
        setCoins((prev) => updateCoinsWithMarketData(prev, priceMap))
        setIsApiAvailable(true)
      }
    } catch {
      setIsApiAvailable(false)
    }
    setLastUpdate(Date.now())
  }, [coins])

  // ============================================================
  // Refresh Historical Data
  // ============================================================

  const refreshHistorical = useCallback(async () => {
    try {
      const data = await fetchHistoricalData(selectedCoinSymbol, 7)
      setHistoricalData(data)
    } catch {
      // Keep existing data
    }
  }, [selectedCoinSymbol])

  // ============================================================
  // Portfolio Refresh
  // ============================================================

  const refreshPortfolio = useCallback(() => {
    // Build price map from current coins
    const priceMap: Record<string, number> = {}
    for (const coin of coins) {
      priceMap[coin.symbol] = coin.price
    }
    paperTradingEngine.updatePositions(priceMap)
    setPortfolio(paperTradingEngine.getPortfolio())
  }, [coins])

  // ============================================================
  // Order Book Update
  // ============================================================

  const updateOrderBook = useCallback(() => {
    setOrderBook(generateOrderBook(selectedCoin.price))
  }, [selectedCoin.price])

  // ============================================================
  // Trading Actions
  // ============================================================

  const placeOrder = useCallback(
    (params: {
      symbol: string
      side: "buy" | "sell"
      type: "market" | "limit" | "stop"
      quantity: number
      price?: number
      stopPrice?: number
      leverage?: number
    }): PaperOrder => {
      const order = paperTradingEngine.placeOrder(params)
      refreshPortfolio()
      return order
    },
    [refreshPortfolio]
  )

  const closePosition = useCallback(
    (symbol: string, quantity?: number): PaperOrder | null => {
      const result = paperTradingEngine.closePosition(symbol, quantity)
      if (result) refreshPortfolio()
      return result
    },
    [refreshPortfolio]
  )

  const cancelOrder = useCallback(
    (orderId: string): boolean => {
      const result = paperTradingEngine.cancelOrder(orderId)
      if (result) refreshPortfolio()
      return result
    },
    [refreshPortfolio]
  )

  const resetPortfolio = useCallback(() => {
    paperTradingEngine.resetPortfolio()
    refreshPortfolio()
  }, [refreshPortfolio])

  const toggleLiveMode = useCallback(() => {
    setIsLive((prev) => !prev)
  }, [])

  // ============================================================
  // Effects
  // ============================================================

  // Initial data load
  useEffect(() => {
    refreshPrices()
    refreshHistorical()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh historical data when coin changes
  useEffect(() => {
    refreshHistorical()
    updateOrderBook()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCoinSymbol])

  // Live mode: simulate real-time price ticks
  useEffect(() => {
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current)
      simulationIntervalRef.current = null
    }

    if (isLive) {
      simulationIntervalRef.current = setInterval(() => {
        setCoins((prev) =>
          prev.map((coin) => {
            const newPrice = simulatePriceTick(coin.price, 0.001)
            const change24h = ((newPrice - coin.price) / coin.price) * 100
            return {
              ...coin,
              price: newPrice,
              change24h: Number(change24h.toFixed(2)),
            }
          })
        )
        setLastUpdate(Date.now())
      }, 2000) // Update every 2 seconds
    }

    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current)
      }
    }
  }, [isLive])

  // API polling (every 60 seconds)
  useEffect(() => {
    if (apiIntervalRef.current) {
      clearInterval(apiIntervalRef.current)
    }

    apiIntervalRef.current = setInterval(() => {
      refreshPrices()
    }, 60_000)

    return () => {
      if (apiIntervalRef.current) {
        clearInterval(apiIntervalRef.current)
      }
    }
  }, [refreshPrices])

  // P&L update interval (every 5 seconds)
  useEffect(() => {
    if (pnlIntervalRef.current) {
      clearInterval(pnlIntervalRef.current)
    }

    pnlIntervalRef.current = setInterval(() => {
      refreshPortfolio()
    }, 5000)

    return () => {
      if (pnlIntervalRef.current) {
        clearInterval(pnlIntervalRef.current)
      }
    }
  }, [refreshPortfolio])

  // Update order book when price changes
  useEffect(() => {
    updateOrderBook()
  }, [selectedCoin.price, updateOrderBook])

  // Update snapshots when coins change
  useEffect(() => {
    setSnapshots(
      coins.map((coin) => ({
        symbol: coin.symbol,
        price: coin.price,
        change24h: coin.change24h,
        high24h: coin.price * 1.02,
        low24h: coin.price * 0.98,
        volume24h: coin.volume,
        marketCap: coin.marketCap,
        timestamp: Date.now(),
      }))
    )
  }, [coins])

  return {
    coins,
    snapshots,
    selectedCoin,
    historicalData,
    orderBook,
    portfolio,
    isLive,
    isApiAvailable,
    lastUpdate,
    selectCoin,
    refreshPrices,
    refreshHistorical,
    placeOrder,
    closePosition,
    cancelOrder,
    resetPortfolio,
    toggleLiveMode,
  }
}
