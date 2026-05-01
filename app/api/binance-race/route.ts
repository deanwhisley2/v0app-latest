/**
 * BINANCE PREDICTION RACE API
 * 
 * This endpoint runs the prediction race:
 * 1. Fetches current price from Binance
 * 2. Nexus makes a prediction
 * 3. Waits 30 seconds
 * 4. Fetches what actually happened
 * 5. Returns comparison
 * 
 * ALL DATA FROM REAL BINANCE API - NO SIMULATIONS
 */

import { NextRequest, NextResponse } from "next/server"

const BINANCE_BASE = "https://api.binance.com"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol") || "BTCUSDT"
  const action = searchParams.get("action") || "predict"

  try {
    if (action === "predict") {
      // Step 1: Get current price and order book
      const [priceData, depthData, klinesData, tradesData] = await Promise.all([
        fetch(`${BINANCE_BASE}/api/v3/ticker/price?symbol=${symbol}`, {
          signal: AbortSignal.timeout(5000),
        }).then(r => r.json()),
        fetch(`${BINANCE_BASE}/api/v3/depth?symbol=${symbol}&limit=20`, {
          signal: AbortSignal.timeout(5000),
        }).then(r => r.json()),
        fetch(`${BINANCE_BASE}/api/v3/klines?symbol=${symbol}&interval=1m&limit=5`, {
          signal: AbortSignal.timeout(5000),
        }).then(r => r.json()),
        fetch(`${BINANCE_BASE}/api/v3/trades?symbol=${symbol}&limit=20`, {
          signal: AbortSignal.timeout(5000),
        }).then(r => r.json()),
      ])

      const currentPrice = parseFloat(priceData.price)
      const nexusTimestamp = Date.now()

      // Analyze order book imbalance
      const bids = depthData.bids || []
      const asks = depthData.asks || []
      let bidVolume = 0
      let askVolume = 0
      for (const [p, q] of bids) bidVolume += parseFloat(p) * parseFloat(q)
      for (const [p, q] of asks) askVolume += parseFloat(p) * parseFloat(q)
      const totalVolume = bidVolume + askVolume
      const imbalance = totalVolume > 0 ? (bidVolume - askVolume) / totalVolume : 0

      // Analyze recent klines for momentum
      const closes = klinesData.map((k: any[]) => parseFloat(k[4]))
      const volumes = klinesData.map((k: any[]) => parseFloat(k[5]))
      const priceChange = closes.length > 1 ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100 : 0
      const avgVolume = volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length
      const lastVolume = volumes[volumes.length - 1] || 0
      const volumeSpike = avgVolume > 0 ? lastVolume / avgVolume : 1

      // Analyze recent trades for buy/sell pressure
      let buyVolume = 0
      let sellVolume = 0
      for (const trade of tradesData) {
        const qty = parseFloat(trade.qty) * parseFloat(trade.price)
        if (trade.isBuyerMaker) sellVolume += qty
        else buyVolume += qty
      }
      const tradeImbalance = (buyVolume + sellVolume) > 0 
        ? (buyVolume - sellVolume) / (buyVolume + sellVolume) 
        : 0

      // Nexus prediction logic
      let prediction: "BUY" | "SELL" | "HOLD"
      let confidence: number
      let targetPrice: number
      let reasoning: string[] = []

      // Strong buy signals
      let buyScore = 0
      let sellScore = 0

      // Order book imbalance
      if (imbalance > 0.3) { buyScore += 2; reasoning.push(`Order book imbalance: ${(imbalance * 100).toFixed(1)}% bullish`) }
      else if (imbalance < -0.3) { sellScore += 2; reasoning.push(`Order book imbalance: ${(imbalance * 100).toFixed(1)}% bearish`) }

      // Volume spike
      if (volumeSpike > 1.5 && priceChange > 0) { buyScore += 1; reasoning.push(`Volume spike: ${volumeSpike.toFixed(1)}x average`) }
      else if (volumeSpike > 1.5 && priceChange < 0) { sellScore += 1; reasoning.push(`Volume spike: ${volumeSpike.toFixed(1)}x average`) }

      // Trade flow
      if (tradeImbalance > 0.2) { buyScore += 2; reasoning.push(`Trade flow: ${(tradeImbalance * 100).toFixed(1)}% buy pressure`) }
      else if (tradeImbalance < -0.2) { sellScore += 2; reasoning.push(`Trade flow: ${(tradeImbalance * 100).toFixed(1)}% sell pressure`) }

      // Momentum
      if (priceChange > 0.1) { buyScore += 1; reasoning.push(`Momentum: +${priceChange.toFixed(2)}% in last 5 min`) }
      else if (priceChange < -0.1) { sellScore += 1; reasoning.push(`Momentum: ${priceChange.toFixed(2)}% in last 5 min`) }

      // Determine prediction
      if (buyScore > sellScore && buyScore >= 3) {
        prediction = "BUY"
        confidence = Math.min(0.5 + (buyScore - sellScore) * 0.1, 0.95)
        targetPrice = currentPrice * (1 + 0.001 * buyScore) // 0.1% per buy signal
      } else if (sellScore > buyScore && sellScore >= 3) {
        prediction = "SELL"
        confidence = Math.min(0.5 + (sellScore - buyScore) * 0.1, 0.95)
        targetPrice = currentPrice * (1 - 0.001 * sellScore)
      } else {
        prediction = "HOLD"
        confidence = 0.3
        targetPrice = currentPrice
        reasoning.push("Insufficient signal strength")
      }

      return NextResponse.json({
        success: true,
        nexusTimestamp,
        symbol,
        currentPrice,
        prediction,
        confidence,
        targetPrice,
        reasoning,
        marketData: {
          imbalance: parseFloat(imbalance.toFixed(4)),
          volumeSpike: parseFloat(volumeSpike.toFixed(2)),
          tradeImbalance: parseFloat(tradeImbalance.toFixed(4)),
          priceChange5m: parseFloat(priceChange.toFixed(4)),
          bidVolume: parseFloat(bidVolume.toFixed(2)),
          askVolume: parseFloat(askVolume.toFixed(2)),
        },
        // Store for verification later
        _checkAfter: nexusTimestamp + 30000, // 30 seconds
      })
    }

    if (action === "verify") {
      // Step 2: Check what actually happened after 30 seconds
      const predictedPrice = parseFloat(searchParams.get("predictedPrice") || "0")
      const prediction = searchParams.get("prediction") || "HOLD"
      const nexusTimestamp = parseInt(searchParams.get("nexusTimestamp") || "0")

      // Fetch current price
      const priceData = await fetch(`${BINANCE_BASE}/api/v3/ticker/price?symbol=${symbol}`, {
        signal: AbortSignal.timeout(5000),
      }).then(r => r.json())

      const actualPrice = parseFloat(priceData.price)
      const verifyTimestamp = Date.now()
      const elapsedMs = verifyTimestamp - nexusTimestamp

      // Calculate result
      let correct = false
      let actualMovement = ((actualPrice - predictedPrice) / predictedPrice) * 100

      if (prediction === "BUY" && actualPrice > predictedPrice) correct = true
      else if (prediction === "SELL" && actualPrice < predictedPrice) correct = true
      else if (prediction === "HOLD") {
        // HOLD is correct if price moved less than 0.1%
        correct = Math.abs(actualMovement) < 0.1
      }

      return NextResponse.json({
        success: true,
        symbol,
        nexusTimestamp,
        verifyTimestamp,
        elapsedMs,
        predictedPrice,
        actualPrice,
        prediction,
        actualMovement: parseFloat(actualMovement.toFixed(4)),
        correct,
        leadTimeMs: elapsedMs,
        dataSource: "LIVE BINANCE API",
        verified: true,
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Race check failed", success: false },
      { status: 502 }
    )
  }
}
