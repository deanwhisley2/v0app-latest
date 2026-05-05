/**
 * Paper / demo trades (Mode C): client-side history for Compare panel.
 * No exchange commands — timestamps and prices are recorded at simulation time.
 */

export type PaperLegSide = "BUY" | "SELL" | "HOLD"

export interface PaperLeg {
  /** ISO timestamp */
  at: string
  side: PaperLegSide
  /** Market price used for the leg (from live quote at that moment) */
  price: number
  note: string
}

export interface PaperTradeRecord {
  id: string
  createdAt: string
  symbol: string
  amountUsd: number
  strategyIds: string[]
  consensus: string
  entryPrice: number
  exitProjectedPrice: number
  /** Unrealized / projected P&L in USD for the simulated size */
  pnlUsd: number
  legs: PaperLeg[]
}

const STORAGE_KEY = "nexus_paper_trade_history_v1"

function safeParse(raw: string | null): PaperTradeRecord[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.filter(isPaperRecord)
  } catch {
    return []
  }
}

function isPaperRecord(x: unknown): x is PaperTradeRecord {
  if (!x || typeof x !== "object") return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === "string" &&
    typeof o.createdAt === "string" &&
    typeof o.symbol === "string" &&
    typeof o.amountUsd === "number" &&
    Array.isArray(o.legs)
  )
}

export function loadPaperTradeHistory(): PaperTradeRecord[] {
  if (typeof window === "undefined") return []
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

export function savePaperTradeHistory(rows: PaperTradeRecord[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 200)))
  } catch {
    /* ignore */
  }
}

export function appendPaperTrade(row: PaperTradeRecord) {
  const next = [row, ...loadPaperTradeHistory()].slice(0, 200)
  savePaperTradeHistory(next)
}

export function deletePaperTradeById(id: string) {
  savePaperTradeHistory(loadPaperTradeHistory().filter((r) => r.id !== id))
}

export function clearAllPaperTrades() {
  savePaperTradeHistory([])
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Builds a transparent paper record from live price + analysis outcome.
 * Exit is projected toward suggested TP/SL by consensus (not a live path replay).
 */
export function buildPaperTradeRecord(params: {
  symbol: string
  amountUsd: number
  entryPrice: number
  consensus: string
  overallConfidence: number
  suggestedEntry: number
  suggestedTP: number
  suggestedSL: number
  strategyIds: string[]
}): PaperTradeRecord {
  const now = new Date().toISOString()
  const buyAt = params.entryPrice
  const isBuyBias =
    params.consensus.includes("BUY") && !params.consensus.includes("SELL")
  const isSellBias =
    params.consensus.includes("SELL") && !params.consensus.includes("BUY")

  let exit = params.suggestedEntry
  if (isBuyBias) exit = params.suggestedTP
  else if (isSellBias) exit = params.suggestedSL
  else {
    const w = params.overallConfidence / 100
    exit = params.suggestedEntry + (params.suggestedTP - params.suggestedEntry) * w * 0.35
  }

  exit = Math.round(exit * 1e6) / 1e6
  const qty = params.amountUsd / buyAt
  const pnlUsd = Math.round((exit - buyAt) * qty * 100) / 100

  const legs: PaperLeg[] = [
    {
      at: now,
      side: "BUY",
      price: Math.round(buyAt * 1e6) / 1e6,
      note: `Simulated entry from live quote · consensus ${params.consensus}`,
    },
    {
      at: new Date(Date.now() + 800).toISOString(),
      side: isSellBias ? "SELL" : isBuyBias ? "SELL" : "HOLD",
      price: Math.round(exit * 1e6) / 1e6,
      note: isBuyBias
        ? "Projected exit toward suggested take-profit (paper only)"
        : isSellBias
          ? "Projected exit toward suggested stop zone (paper only)"
          : "Hold / neutral projection from desk rules (paper only)",
    },
  ]

  return {
    id: randomId(),
    createdAt: now,
    symbol: params.symbol,
    amountUsd: params.amountUsd,
    strategyIds: [...params.strategyIds],
    consensus: params.consensus,
    entryPrice: legs[0]!.price,
    exitProjectedPrice: legs[1]!.price,
    pnlUsd,
    legs,
  }
}
