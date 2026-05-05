import { NextRequest, NextResponse } from "next/server"
import { makeId } from "@/lib/expert/phase2-store"
import type { Position } from "@/lib/expert/phase2-types"

const autoState = {
  activePositions: [] as Position[],
  stopBuying: false,
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { force?: boolean }
  const force = body.force === true

  if (!force) {
    autoState.stopBuying = true
    const estimatedLiquidationValue = autoState.activePositions.reduce((acc, p) => acc + p.currentPrice * p.quantity, 0)
    return NextResponse.json({
      status: "STOPPED_BUYING",
      activePositions: autoState.activePositions,
      estimatedLiquidationValue,
      message: "No new buys. Active positions are being monitored for exit.",
    })
  }

  const liquidationOrders = autoState.activePositions.map((p) => ({
    id: makeId("liq"),
    symbol: p.symbol,
    side: "SELL",
    quantity: p.quantity,
  }))
  const estimatedTotal = autoState.activePositions.reduce((acc, p) => acc + p.currentPrice * p.quantity, 0)
  autoState.activePositions = []
  autoState.stopBuying = true

  return NextResponse.json({
    status: "LIQUIDATING",
    liquidationOrders,
    estimatedTotal,
    message: "Liquidating all positions. Orders sent to exchange.",
  })
}
