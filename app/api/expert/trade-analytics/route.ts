import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { queryTradeAnalytics, type TradeAnalyticsFilters } from "@/lib/trade-analytics"
import type { MarketRegime } from "@/lib/trade-memory"

function parseNum(v: string | null): number | undefined {
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function parseBool(v: string | null): boolean | undefined {
  if (v == null) return undefined
  if (v === "true") return true
  if (v === "false") return false
  return undefined
}

function parseRegime(v: string | null): MarketRegime | undefined {
  if (!v) return undefined
  const val = v.toUpperCase()
  if (val === "TRENDING" || val === "CHOPPING" || val === "VOLATILE" || val === "SIDEWAYS" || val === "UNKNOWN") {
    return val
  }
  return undefined
}

/** Read-only analytics over completed trade memory for the signed-in expert user. */
export async function GET(req: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const userId = userOrRes
    const sp = req.nextUrl.searchParams
    const filters: TradeAnalyticsFilters = {
      userId,
      symbol: sp.get("symbol")?.trim().toUpperCase() || undefined,
      regime: parseRegime(sp.get("regime")),
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      minConfidence: parseNum(sp.get("minConfidence")),
      maxConfidence: parseNum(sp.get("maxConfidence")),
      minCalibratedConfidence: parseNum(sp.get("minCalibratedConfidence")),
      maxCalibratedConfidence: parseNum(sp.get("maxCalibratedConfidence")),
      wasWin: parseBool(sp.get("wasWin")),
      limit: parseNum(sp.get("limit")),
    }
    const analytics = await queryTradeAnalytics(filters)
    return NextResponse.json({ analytics })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
