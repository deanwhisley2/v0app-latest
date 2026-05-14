import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"
import {
  envelopeFromFixedTradeReleaseRpc,
  jsonMutationError,
  type MutationErrorBody,
} from "@/lib/api/mutation-error-envelope"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level === 2 || level === 5) {
      return jsonMutationError(
        403,
        "ACCOUNT_TYPE_BLOCKED",
        "This account type cannot release fixed-trade earnings.",
        "release-earnings: trading_user_level 2 or 5 blocked.",
        { suggested_action: "Use a standard trading account for container releases." },
      )
    }

    const body = (await request.json().catch(() => ({}))) as { sessionId?: string }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
    if (!sessionId) {
      return jsonMutationError(
        400,
        "SESSION_ID_REQUIRED",
        "Choose a funded allocation and try again.",
        "release-earnings: missing sessionId in body.",
        { suggested_action: "Refresh the dashboard and retry." },
      )
    }

    const admin = createAdminClient()
    const { data, error } = await admin.rpc("fixed_trade_release_earnings_window_v1", {
      p_session_id: sessionId,
      p_user_id: user.id,
    })
    if (error) {
      console.error("[release-earnings] rpc transport error", error.message)
      return jsonMutationError(
        500,
        "RPC_TRANSPORT_ERROR",
        "We could not reach the settlement service. Please try again shortly.",
        error.message,
      )
    }

    const rpc = data as Record<string, unknown> | null
    if (!rpc || typeof rpc.ok !== "boolean") {
      return jsonMutationError(
        500,
        "EMPTY_RPC_RESPONSE",
        "No settlement result was returned. Please try again.",
        "release-earnings: rpc returned null or non-object.",
      )
    }

    if (rpc.ok === false && rpc.error === "WITHDRAW_WINDOW_LOCKED") {
      const bodyOut = envelopeFromFixedTradeReleaseRpc(rpc)
      return NextResponse.json<MutationErrorBody>(bodyOut, { status: 423 })
    }

    if (rpc.ok === false) {
      const err = typeof rpc.error === "string" ? rpc.error : ""
      const bodyOut = envelopeFromFixedTradeReleaseRpc(rpc)
      const status =
        err === "session_not_found" ? 404 : err === "forbidden" ? 403 : 400
      return NextResponse.json<MutationErrorBody>(bodyOut, { status })
    }

    const ok = rpc
    const num = (v: unknown) => Number(v ?? 0)

    return NextResponse.json({
      success: true,
      releasedGrossUsd: num(ok.released_gross_usd),
      feeUsd: num(ok.fee_usd),
      creditedLiquidUsd: num(ok.credited_liquid_usd),
      cumulativeReleasedUsd: num(ok.cumulative_released_usd),
      policyGrossUsd: num(ok.policy_gross_usd),
      idempotent: Boolean(ok.idempotent ?? ok.replay),
      replay: Boolean(ok.replay),
      balances: {
        available_balance: num(ok.available_balance),
        container_withdrawable_earnings: num(ok.container_withdrawable_earnings),
      },
    })
  } catch (e) {
    console.error("[release-earnings]", e)
    return jsonMutationError(
      500,
      "INTERNAL_ERROR",
      "Something went wrong while releasing earnings. Please try again.",
      e instanceof Error ? e.message : "unknown",
    )
  }
}
