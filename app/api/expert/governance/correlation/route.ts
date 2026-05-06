import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { listCorrelationState, upsertCorrelationState } from "@/lib/global-execution-governor"

export async function GET(req: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const url = new URL(req.url)
    const baseSymbol = (url.searchParams.get("baseSymbol") ?? "BTCUSDT").toUpperCase()
    const rows = await listCorrelationState(baseSymbol)
    return NextResponse.json({ baseSymbol, rows })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const body = (await req.json()) as {
      baseSymbol: string
      relatedSymbol: string
      cluster: string
      correlation: number
      betaWeight?: number
      volatilityWeight?: number
    }
    await upsertCorrelationState({
      baseSymbol: body.baseSymbol.toUpperCase(),
      relatedSymbol: body.relatedSymbol.toUpperCase(),
      cluster: body.cluster,
      correlation: Number(body.correlation),
      betaWeight: body.betaWeight,
      volatilityWeight: body.volatilityWeight,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
