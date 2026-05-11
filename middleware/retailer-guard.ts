import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function retailerGuard(
  request: NextRequest,
  session: { user?: { role?: string | null } } | null
) {
  const pathname = request.nextUrl.pathname
  const tradingPaths = [
    "/trading-workspace",
    "/war-room",
    "/race-conditions",
    "/live-comparison",
    "/binance-comparison",
    "/api/analysis",
    "/api/trade/execute",
    "/api/trade/status",
    "/api/race-conditions",
  ]

  if (session?.user?.role === "RETAILER" && tradingPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.redirect(new URL("/retailer/dashboard", request.url))
  }

  return NextResponse.next()
}
