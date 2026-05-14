import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"
import { envelopeFromFixedTradeReleaseRpc, jsonMutationError } from "@/lib/api/mutation-error-envelope"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level === 2 || level === 5) {
      return jsonMutationError(
        403,
        "ACCOUNT_TYPE_BLOCKED",
        "This account type cannot query fixed-trade withdrawable preview.",
        "withdrawable-preview: level 2 or 5.",
      )
    }

    const { searchParams } = new URL(request.url)
    const sessionId = (searchParams.get("sessionId") ?? "").trim()
    if (!sessionId) {
      return jsonMutationError(
        400,
        "SESSION_ID_REQUIRED",
        "Add a sessionId query parameter to preview withdrawable earnings.",
        "withdrawable-preview: missing sessionId.",
        { suggested_action: "Call with ?sessionId=<uuid>." },
      )
    }

    const admin = createAdminClient()
    const { data, error } = await admin.rpc("fixed_trade_calculate_withdrawable_v1", {
      p_session_id: sessionId,
      p_user_id: user.id,
    })
    if (error) {
      console.error("[withdrawable-preview]", error.message)
      return jsonMutationError(
        500,
        "RPC_TRANSPORT_ERROR",
        "We could not load the preview. Please try again shortly.",
        error.message,
      )
    }

    const row = data as Record<string, unknown> | null
    if (!row || row.ok === false) {
      const merged = { ...(row ?? {}), error: (row as { error?: string })?.error ?? "rpc_failed" }
      return NextResponse.json(envelopeFromFixedTradeReleaseRpc(merged as Record<string, unknown>), {
        status: 400,
      })
    }

    return NextResponse.json({ success: true, ...row })
  } catch (e) {
    console.error("[withdrawable-preview]", e)
    return jsonMutationError(
      500,
      "INTERNAL_ERROR",
      "Something went wrong while loading the preview.",
      e instanceof Error ? e.message : "unknown",
    )
  }
}
