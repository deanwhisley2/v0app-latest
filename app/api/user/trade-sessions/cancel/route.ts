import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { cancelBookedTradeSessionBot } from "@/lib/server/nexus-bot-session-service"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as {
      participantId?: string
      sessionId?: string
    }
    const participantId =
      typeof body.participantId === "string"
        ? body.participantId.trim()
        : typeof body.sessionId === "string"
          ? body.sessionId.trim()
          : ""
    if (!participantId) {
      return NextResponse.json({ error: "Session id is required." }, { status: 400 })
    }

    const admin = createAdminClient()
    const out = await cancelBookedTradeSessionBot(admin, {
      userId: user.id,
      participantId,
    })

    return NextResponse.json({
      ok: true,
      participantId,
      stakeReturnedUsd: out.stakeReturnedUsd,
      availableUsd: out.available_balance,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const friendly: Record<string, string> = {
      SESSION_NOT_FOUND: "Trade session not found.",
      SESSION_NOT_CANCELLABLE: "This trade can no longer be cancelled.",
      SESSION_ALREADY_STARTED: "The session has already started — cancellation is not available.",
      SESSION_ALREADY_RESOLVED: "This trade session has already been settled.",
      SESSION_TIMING_UNAVAILABLE: "Could not verify session schedule. Try again shortly.",
      SESSION_CANCEL_CONFLICT: "Cancellation could not be completed. Refresh and try again.",
    }
    const status =
      msg in friendly ||
      msg === "SESSION_NOT_FOUND" ||
      msg === "SESSION_NOT_CANCELLABLE" ||
      msg === "SESSION_ALREADY_STARTED" ||
      msg === "SESSION_ALREADY_RESOLVED"
        ? 400
        : 500
    return NextResponse.json({ error: friendly[msg] ?? msg }, { status })
  }
}
