import { NextResponse } from "next/server"
import { getBearerTokenFromRequest } from "@/lib/auth-api"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { buildOperationalBootstrapV1 } from "@/lib/server/operational-bootstrap"
import { getRequestIpAddress, trackLoginSession } from "@/lib/server/login-session"
import { grantNewMemberWelcomeBonus } from "@/lib/server/new-member-campaign"
import { createAdminClient } from "@/lib/supabaseAdmin"

/**
 * DB-authoritative operational snapshot after auth (sessions, positions, governance, canonical exchanges).
 * Client should call once per login / token refresh boundary to rehydrate cross-device UI.
 */
export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth

    const meta = user.user_metadata as Record<string, unknown> | undefined
    const jwtExchanges = meta?.nexus_exchanges
    const bearer = getBearerTokenFromRequest(request)

    const admin = createAdminClient()
    void grantNewMemberWelcomeBonus(admin, user.id, "first_login")

    const [payload, deviceLogin] = await Promise.all([
      buildOperationalBootstrapV1({
        userId: user.id,
        jwtMetadataExchanges: jwtExchanges,
      }),
      bearer
        ? trackLoginSession({
            userId: user.id,
            bearerToken: bearer,
            userAgent: request.headers.get("user-agent") ?? "",
            ipAddress: getRequestIpAddress(request),
          })
        : Promise.resolve(null),
    ])

    return NextResponse.json({
      ...payload,
      deviceLogin,
    })
  } catch (e) {
    console.error("[operational-bootstrap] GET:", e)
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
