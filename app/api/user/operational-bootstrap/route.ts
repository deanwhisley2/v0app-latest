import { NextResponse } from "next/server"
import { getBearerTokenFromRequest, getUserFromBearer } from "@/lib/auth-api"
import { buildOperationalBootstrapV1 } from "@/lib/server/operational-bootstrap"
import { getRequestIpAddress, trackLoginSession } from "@/lib/server/login-session"

/**
 * DB-authoritative operational snapshot after auth (sessions, positions, governance, canonical exchanges).
 * Client should call once per login / token refresh boundary to rehydrate cross-device UI.
 */
export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const meta = user.user_metadata as Record<string, unknown> | undefined
    const jwtExchanges = meta?.nexus_exchanges
    const bearer = getBearerTokenFromRequest(request)
    if (bearer) {
      await trackLoginSession({
        userId: user.id,
        bearerToken: bearer,
        userAgent: request.headers.get("user-agent") ?? "",
        ipAddress: getRequestIpAddress(request),
      })
    }

    const payload = await buildOperationalBootstrapV1({
      userId: user.id,
      jwtMetadataExchanges: jwtExchanges,
    })

    return NextResponse.json(payload)
  } catch (e) {
    console.error("[operational-bootstrap] GET:", e)
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
