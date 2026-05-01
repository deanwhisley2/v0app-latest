/**
 * Gold Price API Proxy Route
 * 
 * Fetches real-time gold prices from multiple free sources:
 * 1. Yahoo Finance (primary - no API key needed)
 * 2. metals-api.com (fallback - requires API key in env)
 * 
 * Environment variables:
 *   METALS_API_KEY - Optional API key for metals-api.com
 * 
 * Usage: GET /api/gold
 */

import { NextRequest, NextResponse } from "next/server"

// Yahoo Finance endpoint for gold futures (GC=F)
const YAHOO_FINANCE_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d"

// metals-api.com endpoint (free tier)
const METALS_API_BASE = "https://metals-api.com/api/latest"

interface GoldPriceResponse {
  price: number
  source: "yahoo" | "metals-api" | "simulated"
  timestamp: string
  change24h?: number
  high24h?: number
  low24h?: number
  note?: string
}

// Server-side cache to avoid hammering Yahoo Finance
let cachedResponse: GoldPriceResponse | null = null
let lastServerFetch = 0
const SERVER_CACHE_MS = 30_000 // Cache on server for 30 seconds

// Fallback simulated price if all APIs fail
let fallbackGoldPrice = 2650.0

function getSimulatedPrice(): number {
  const change = fallbackGoldPrice * (Math.random() * 0.003 - 0.0015)
  fallbackGoldPrice += change
  return fallbackGoldPrice
}

async function fetchFromYahooFinance(): Promise<GoldPriceResponse | null> {
  try {
    const response = await fetch(YAHOO_FINANCE_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      console.warn(`[Gold API] Yahoo Finance returned ${response.status}`)
      return null
    }

    const data = await response.json()

    // Parse Yahoo Finance response
    const result = data?.chart?.result?.[0]
    if (!result) {
      console.warn("[Gold API] Yahoo Finance returned unexpected format")
      return null
    }

    const meta = result.meta
    const quotes = result.indicators?.quote?.[0]
    const timestamps = result.timestamp

    if (!meta?.regularMarketPrice || !quotes) {
      console.warn("[Gold API] Yahoo Finance missing price data")
      return null
    }

    const price = meta.regularMarketPrice
    const previousClose = meta.previousClose || price
    const change24h = ((price - previousClose) / previousClose) * 100

    // Calculate high/low from available data
    let high24h = price
    let low24h = price
    if (quotes.high && quotes.low) {
      for (let i = 0; i < quotes.high.length; i++) {
        if (quotes.high[i] && quotes.high[i] > high24h) high24h = quotes.high[i]
        if (quotes.low[i] && quotes.low[i] < low24h) low24h = quotes.low[i]
      }
    }

    return {
      price,
      source: "yahoo",
      timestamp: new Date().toISOString(),
      change24h,
      high24h,
      low24h,
    }
  } catch (error: any) {
    console.warn(`[Gold API] Yahoo Finance error: ${error.message}`)
    return null
  }
}

async function fetchFromMetalsAPI(apiKey: string): Promise<GoldPriceResponse | null> {
  try {
    const url = `${METALS_API_BASE}?access_key=${apiKey}&base=XAU&symbols=USD`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      console.warn(`[Gold API] metals-api.com returned ${response.status}`)
      return null
    }

    const data = await response.json()

    if (!data?.success || !data?.rates?.USD) {
      console.warn("[Gold API] metals-api.com returned unexpected format")
      return null
    }

    // metals-api returns rate per troy ounce
    const price = data.rates.USD

    return {
      price,
      source: "metals-api",
      timestamp: new Date().toISOString(),
    }
  } catch (error: any) {
    console.warn(`[Gold API] metals-api.com error: ${error.message}`)
    return null
  }
}

export async function GET(request: NextRequest) {
  // Check server-side cache first
  const now = Date.now()
  if (cachedResponse && now - lastServerFetch < SERVER_CACHE_MS) {
    return NextResponse.json(cachedResponse)
  }

  try {
    // Try Yahoo Finance first (free, no API key needed)
    const yahooResult = await fetchFromYahooFinance()
    if (yahooResult) {
      cachedResponse = yahooResult
      lastServerFetch = now
      return NextResponse.json(yahooResult)
    }

    // Try metals-api.com if API key is configured
    const metalsApiKey = process.env.METALS_API_KEY
    if (metalsApiKey) {
      const metalsResult = await fetchFromMetalsAPI(metalsApiKey)
      if (metalsResult) {
        return NextResponse.json(metalsResult)
      }
    }

    // Fallback to simulated price
    const simPrice = getSimulatedPrice()
    return NextResponse.json({
      price: simPrice,
      source: "simulated",
      timestamp: new Date().toISOString(),
      note: "All external APIs unavailable. Using simulated price.",
    } satisfies GoldPriceResponse)
  } catch (error: any) {
    // Ultimate fallback
    return NextResponse.json({
      price: getSimulatedPrice(),
      source: "simulated",
      timestamp: new Date().toISOString(),
      note: `Error fetching gold price: ${error.message}. Using simulated price.`,
    } satisfies GoldPriceResponse)
  }
}
