/**
 * Parallel public tickers: Binance, Bitget, KuCoin — same underlying pair for spread / divergence checks.
 * GET /api/market/compare?symbol=BTCUSDT  (default BTCUSDT; KuCoin uses BTC-USDT form internally)
 *
 * Not financial advice; "reliability" here means numeric agreement at request time, not venue quality.
 */

import { NextRequest, NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"

function toKuCoinSymbol(unified: string): string {
  const u = unified.toUpperCase().replace(/-/g, "")
  if (u.endsWith("USDT")) return `${u.slice(0, -4)}-USDT`
  if (u.endsWith("USDC")) return `${u.slice(0, -4)}-USDC`
  return unified.includes("-") ? unified : `${unified}-USDT`
}

function num(s: string | undefined): number | null {
  if (s == null || s === "") return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

export async function GET(request: NextRequest) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase()
  const kucoinSym = toKuCoinSymbol(symbol)

  async function timedFetch<T>(fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
    const s = Date.now()
    const result = await fn()
    return { ms: Date.now() - s, result }
  }

  const [binRes, bitRes, kcRes] = await Promise.allSettled([
    timedFetch(async () => {
      const r = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(12000),
        }
      )
      const j = (await r.json()) as Record<string, unknown>
      if (!r.ok) throw new Error(typeof j.msg === "string" ? j.msg : `HTTP ${r.status}`)
      if (typeof j.price !== "string")
        throw new Error(typeof j.msg === "string" ? j.msg : "Binance: no price in response")
      return { http: r.status, body: j }
    }),
    timedFetch(async () => {
      const r = await fetch(
        `https://api.bitget.com/api/v2/spot/market/tickers?symbol=${encodeURIComponent(symbol)}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(12000),
        }
      )
      const j = (await r.json()) as Record<string, unknown>
      if (!r.ok) throw new Error(typeof j.msg === "string" ? j.msg : `HTTP ${r.status}`)
      if (String(j.code ?? "") !== "00000")
        throw new Error(typeof j.msg === "string" ? j.msg : `Bitget code ${String(j.code)}`)
      return { http: r.status, body: j }
    }),
    timedFetch(async () => {
      const r = await fetch(
        `https://api.kucoin.com/api/v1/market/stats?symbol=${encodeURIComponent(kucoinSym)}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(12000),
        }
      )
      const j = (await r.json()) as Record<string, unknown>
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      if (String(j.code ?? "") !== "200000")
        throw new Error(typeof j.msg === "string" ? j.msg : `KuCoin code ${String(j.code)}`)
      return { http: r.status, body: j }
    }),
  ])

  type VenueOk = {
    ok: true
    latencyMs: number
    price: number | null
    bid?: number | null
    ask?: number | null
    raw: Record<string, unknown>
  }
  type VenueErr = { ok: false; error: string }
  type Venue = VenueOk | VenueErr

  const venues: { binance: Venue; bitget: Venue; kucoin: Venue } = {
    binance: { ok: false, error: "not fetched" },
    bitget: { ok: false, error: "not fetched" },
    kucoin: { ok: false, error: "not fetched" },
  }

  if (binRes.status === "fulfilled") {
    const { ms, result } = binRes.value
    const { body } = result
    const priceStr = typeof body.price === "string" ? body.price : null
    const price = num(priceStr)
    venues.binance = {
      ok: true,
      latencyMs: ms,
      price,
      raw: body,
    }
  } else {
    const err = binRes.reason
    const msg = err instanceof Error ? err.message : String(err)
    venues.binance = { ok: false, error: msg }
  }

  if (bitRes.status === "fulfilled") {
    const { ms, result } = bitRes.value
    const { body } = result
    const d = Array.isArray(body.data) ? (body.data[0] as Record<string, unknown>) : null
    const last = d && typeof d.lastPr === "string" ? num(d.lastPr) : null
    const bid = d && typeof d.bidPr === "string" ? num(d.bidPr) : null
    const ask = d && typeof d.askPr === "string" ? num(d.askPr) : null
    venues.bitget = {
      ok: true,
      latencyMs: ms,
      price: last,
      bid,
      ask,
      raw: body as Record<string, unknown>,
    }
  } else {
    const err = bitRes.reason
    venues.bitget = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (kcRes.status === "fulfilled") {
    const { ms, result } = kcRes.value
    const { body } = result
    const data = body.data as Record<string, unknown> | undefined
    const last = data && typeof data.last === "string" ? num(data.last) : null
    const bid = data && typeof data.buy === "string" ? num(data.buy) : null
    const ask = data && typeof data.sell === "string" ? num(data.sell) : null
    venues.kucoin = {
      ok: true,
      latencyMs: ms,
      price: last,
      bid,
      ask,
      raw: body as Record<string, unknown>,
    }
  } else {
    const err = kcRes.reason
    venues.kucoin = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  const prices: number[] = []
  if (venues.binance.ok && venues.binance.price != null) prices.push(venues.binance.price)
  if (venues.bitget.ok && venues.bitget.price != null) prices.push(venues.bitget.price)
  if (venues.kucoin.ok && venues.kucoin.price != null) prices.push(venues.kucoin.price)

  let spread: {
    min: number | null
    max: number | null
    absUsd: number | null
    pctOfMid: number | null
    highestVenue: string | null
    lowestVenue: string | null
  } = {
    min: null,
    max: null,
    absUsd: null,
    pctOfMid: null,
    highestVenue: null,
    lowestVenue: null,
  }

  if (prices.length >= 2) {
    const entries: [string, number][] = []
    if (venues.binance.ok && venues.binance.price != null) entries.push(["binance", venues.binance.price])
    if (venues.bitget.ok && venues.bitget.price != null) entries.push(["bitget", venues.bitget.price])
    if (venues.kucoin.ok && venues.kucoin.price != null) entries.push(["kucoin", venues.kucoin.price])

    const min = Math.min(...entries.map((e) => e[1]))
    const max = Math.max(...entries.map((e) => e[1]))
    const mid = (min + max) / 2
    spread = {
      min,
      max,
      absUsd: max - min,
      pctOfMid: mid > 0 ? ((max - min) / mid) * 100 : null,
      highestVenue: entries.find((e) => e[1] === max)?.[0] ?? null,
      lowestVenue: entries.find((e) => e[1] === min)?.[0] ?? null,
    }
  }

  let agreement: string
  if (prices.length < 2) {
    agreement = "Insufficient live prices to compare (one or more venues failed or returned no last price)."
  } else if (spread.pctOfMid != null && spread.pctOfMid < 0.02) {
    agreement = "Tight: last prices agree within ~0.02% of mid — snapshots are very close."
  } else if (spread.pctOfMid != null && spread.pctOfMid < 0.1) {
    agreement = "Moderate: small cross-venue gap; normal for latency and book differences."
  } else {
    agreement = "Wide: notable divergence at this instant — verify symbol mapping, outages, or stale books before trusting one feed alone."
  }

  return NextResponse.json({
    symbol,
    kucoinSymbol: kucoinSym,
    fetchedAt: Date.now(),
    venues,
    spread,
    agreement,
    note:
      "Public ticker only; not execution quality. For production, log timestamps and your own slippage metrics.",
  })
}
