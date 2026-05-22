import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"

type MarketRegime = "TRENDING" | "VOLATILE" | "CHOPPING" | "PANIC" | "LOW_LIQUIDITY" | "SIDEWAYS" | "LIQUIDITY_STRESS" | "CASCADE_CONDITIONS" | "RECOVERY_BOUNCE"
type SystemicRiskState =
  | "NORMAL"
  | "ELEVATED_CORRELATION"
  | "MARKET_STRESS"
  | "CASCADE_RISK"
  | "EXTREME_VOLATILITY"
  | "LIQUIDITY_DANGER"

function requireAdmin() {
  return createAdminClient()
}

function baseFromPair(symbol: string): string {
  return symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol
}

async function fetchTicker24h(symbol: string) {
  const q = await import("@/lib/server/market-price-authority").then((m) =>
    m.getSymbolSpotUsd(baseFromPair(symbol))
  )
  return {
    priceChangePercent: String(q.change24hPct),
    quoteVolume: "0",
    bidPrice: String(q.priceUsd),
    askPrice: String(q.priceUsd),
  }
}

async function fetchKlines(symbol: string, limit = 30) {
  try {
    const u = new URL("https://api.binance.com/api/v3/klines")
    u.searchParams.set("symbol", symbol)
    u.searchParams.set("interval", "1m")
    u.searchParams.set("limit", String(limit))
    const res = await fetch(u.toString(), { cache: "no-store", signal: AbortSignal.timeout(12_000) })
    if (!res.ok) throw new Error(`klines failed ${symbol} (${res.status})`)
    return (await res.json()) as Array<[number, string, string, string, string, string, number, string, number, string, string, string]>
  } catch {
    const { getSymbolSpotUsd } = await import("@/lib/server/market-price-authority")
    const spot = await getSymbolSpotUsd(baseFromPair(symbol))
    const bars: Array<[number, string, string, string, string, string, number, string, number, string, string, string]> = []
    const now = Date.now()
    let p = spot.priceUsd
    for (let i = limit; i > 0; i--) {
      const ts = now - i * 60_000
      const open = String(p)
      p = p * (1 + (Math.random() - 0.5) * 0.001)
      const close = String(p)
      bars.push([ts, open, open, close, close, "0", 0, "0", 0, "0", "0", "0"])
    }
    return bars
  }
}

function std(values: number[]) {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(Math.max(0, variance))
}

function correlation(a: number[], b: number[]) {
  if (a.length !== b.length || a.length < 3) return 0
  const ma = a.reduce((x, y) => x + y, 0) / a.length
  const mb = b.reduce((x, y) => x + y, 0) / b.length
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    const xa = a[i] - ma
    const xb = b[i] - mb
    num += xa * xb
    da += xa * xa
    db += xb * xb
  }
  if (da === 0 || db === 0) return 0
  return num / Math.sqrt(da * db)
}

function classifyRegime(volatilityScore: number, liquidityStressScore: number, correlationScore: number, btcMovePct: number): { regime: MarketRegime; systemic: SystemicRiskState; confidence: number } {
  if (liquidityStressScore >= 0.75 && volatilityScore >= 0.7) {
    return { regime: "LIQUIDITY_STRESS", systemic: "LIQUIDITY_DANGER", confidence: 0.85 }
  }
  if (volatilityScore >= 0.85 || (volatilityScore >= 0.7 && Math.abs(btcMovePct) >= 2.2)) {
    return { regime: "PANIC", systemic: "EXTREME_VOLATILITY", confidence: 0.86 }
  }
  if (correlationScore >= 0.85 && volatilityScore >= 0.6) {
    return { regime: "CASCADE_CONDITIONS", systemic: "CASCADE_RISK", confidence: 0.82 }
  }
  if (volatilityScore >= 0.6) {
    return { regime: "VOLATILE", systemic: "MARKET_STRESS", confidence: 0.72 }
  }
  if (correlationScore >= 0.75) {
    return { regime: "TRENDING", systemic: "ELEVATED_CORRELATION", confidence: 0.7 }
  }
  if (Math.abs(btcMovePct) < 0.5 && volatilityScore < 0.28) {
    return { regime: "SIDEWAYS", systemic: "NORMAL", confidence: 0.66 }
  }
  if (btcMovePct > 0.8 && volatilityScore < 0.5) {
    return { regime: "RECOVERY_BOUNCE", systemic: "NORMAL", confidence: 0.63 }
  }
  return { regime: "CHOPPING", systemic: "NORMAL", confidence: 0.58 }
}

export async function refreshLiveMarketStructure(input?: { scope?: string; symbols?: string[]; minRefreshMs?: number }) {
  const admin = requireAdmin()
  const scope = input?.scope ?? "GLOBAL"
  const symbols = input?.symbols ?? ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
  const minRefreshMs = Math.max(10_000, input?.minRefreshMs ?? 60_000)
  const { data: current } = await admin.from("LiveStructureState").select("*").eq("scope", scope).maybeSingle()
  if (current?.updatedAt) {
    const age = Date.now() - new Date(current.updatedAt).getTime()
    if (age < minRefreshMs) return current
  }

  const btcTicker = await fetchTicker24h("BTCUSDT")
  const btcMovePct = Number.parseFloat(btcTicker.priceChangePercent ?? "0")
  const pairs = await Promise.all(symbols.map(async (s) => ({ symbol: s, klines: await fetchKlines(s), ticker: await fetchTicker24h(s) })))
  const returnsBySymbol = new Map<string, number[]>()
  for (const p of pairs) {
    const closes = p.klines.map((k) => Number.parseFloat(k[4] ?? "0")).filter((v) => Number.isFinite(v) && v > 0)
    const rets: number[] = []
    for (let i = 1; i < closes.length; i++) rets.push((closes[i] - closes[i - 1]) / closes[i - 1])
    returnsBySymbol.set(p.symbol, rets)
  }
  const btcRets = returnsBySymbol.get("BTCUSDT") ?? []
  const altCorrs = Array.from(returnsBySymbol.entries())
    .filter(([s]) => s !== "BTCUSDT")
    .map(([, r]) => Math.abs(correlation(btcRets, r)))
  const avgCorr = altCorrs.length ? altCorrs.reduce((a, b) => a + b, 0) / altCorrs.length : 0
  const volBase = std(btcRets) * 100
  const volatilityScore = Math.max(0, Math.min(1, volBase / 1.2))
  const spreads = pairs.map((p) => {
    const bid = Number.parseFloat(p.ticker.bidPrice ?? "0")
    const ask = Number.parseFloat(p.ticker.askPrice ?? "0")
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0 || ask <= bid) return 0.002
    return (ask - bid) / ((ask + bid) / 2)
  })
  const spreadScore = Math.max(0, Math.min(1, (spreads.reduce((a, b) => a + b, 0) / Math.max(1, spreads.length)) / 0.004))
  const avgQuoteVol = pairs.reduce((s, p) => s + Number.parseFloat(p.ticker.quoteVolume ?? "0"), 0) / Math.max(1, pairs.length)
  const volPenalty = avgQuoteVol <= 0 ? 1 : Math.max(0, Math.min(1, 1 - avgQuoteVol / 500_000_000))
  const liquidityStressScore = Math.max(0, Math.min(1, spreadScore * 0.65 + volPenalty * 0.35))
  const correlationScore = Math.max(0, Math.min(1, avgCorr))
  const cls = classifyRegime(volatilityScore, liquidityStressScore, correlationScore, btcMovePct)
  const transitionFrom = current?.marketRegime && current.marketRegime !== cls.regime ? String(current.marketRegime) : null
  const prevCorr = Number(current?.correlationScore ?? avgCorr)
  if (Math.abs(avgCorr - prevCorr) >= 0.12) {
    console.log(`[correlation-shift] prev=${prevCorr.toFixed(3)} next=${avgCorr.toFixed(3)} delta=${(avgCorr - prevCorr).toFixed(3)}`)
  }
  const prevVol = Number(current?.volatilityScore ?? volatilityScore)
  if (volatilityScore - prevVol >= 0.15) {
    console.log(`[volatility-expansion] prev=${prevVol.toFixed(3)} next=${volatilityScore.toFixed(3)}`)
  }
  const prevLiq = Number(current?.liquidityStressScore ?? liquidityStressScore)
  if (liquidityStressScore - prevLiq >= 0.12) {
    console.log(`[liquidity-stress] prev=${prevLiq.toFixed(3)} next=${liquidityStressScore.toFixed(3)}`)
  }
  if (current?.systemicRiskState && current.systemicRiskState !== cls.systemic) {
    console.log(`[systemic-escalation] from=${current.systemicRiskState} to=${cls.systemic}`)
  }
  const transitionAt = transitionFrom ? new Date().toISOString() : (current?.transitionAt ?? null)
  if (transitionFrom) {
    console.log(`[regime-transition] from=${transitionFrom} to=${cls.regime} reason=live-market-structure`)
  }
  console.log(
    `[market-regime] regime=${cls.regime} systemic=${cls.systemic} vol=${volatilityScore.toFixed(3)} liq=${liquidityStressScore.toFixed(3)} corr=${correlationScore.toFixed(3)}`
  )
  const row = {
    id: `ls_${randomUUID()}`,
    scope,
    marketRegime: cls.regime,
    systemicRiskState: cls.systemic,
    volatilityScore,
    liquidityStressScore,
    correlationScore,
    regimeConfidence: cls.confidence,
    transitionFrom,
    transitionAt,
    details: { symbols, btcMovePct, avgCorr, spreads, avgQuoteVol },
  }
  const { error } = await admin.from("LiveStructureState").upsert(row, { onConflict: "scope" })
  if (error) throw new Error(`DB_WRITE_FAILED: LiveStructureState upsert — ${error.message}`)
  await admin.from("MarketStructureSnapshot").insert({
    id: `mss_${randomUUID()}`,
    scope,
    marketRegime: cls.regime,
    systemicRiskState: cls.systemic,
    volatilityScore,
    liquidityStressScore,
    correlationScore,
    details: row.details,
  })
  console.log(`[market-structure] scope=${scope} regime=${cls.regime} systemic=${cls.systemic}`)
  return row
}
