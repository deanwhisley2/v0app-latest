import { NextRequest } from "next/server"

/** Shared secret for /api/trade/* — you invent `NEXUS_REAL_TRADE_SECRET` (see `npm run trade-secret:gen`). */
export function assertRealTradeApiSecret(request: NextRequest): void {
  const expected = process.env.NEXUS_REAL_TRADE_SECRET?.trim()
  if (!expected) {
    throw new Error(
      "NEXUS_REAL_TRADE_SECRET is not set on the server. Pick any long random string, put it in .env.local, restart Next.js, then send the same value in header x-nexus-real-trade-secret (run: npm run trade-secret:gen)"
    )
  }
  const got = request.headers.get("x-nexus-real-trade-secret")?.trim()
  if (got !== expected) {
    const err = new Error(
      "x-nexus-real-trade-secret does not match NEXUS_REAL_TRADE_SECRET in .env.local on this server"
    )
    ;(err as Error & { status?: number }).status = 401
    throw err
  }
}
