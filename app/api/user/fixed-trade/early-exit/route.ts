import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { jsonMutationError } from "@/lib/api/mutation-error-envelope"
import { settleFixedTradeEarlyExitForUser } from "@/lib/server/fixed-trade-early-exit-settle"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as { sessionId?: string }
    const sessionId = body.sessionId?.trim()
    if (!sessionId) {
      return jsonMutationError(
        400,
        "SESSION_ID_REQUIRED",
        "Session reference missing. Refresh and try again.",
        "early-exit: missing sessionId.",
        { suggested_action: "Re-open the desk card and retry early exit." },
      )
    }

    const admin = createAdminClient()
    const result = await settleFixedTradeEarlyExitForUser(admin, {
      userId: user.id,
      sessionId,
    })

    return Response.json({
      success: true,
      sessionId: result.sessionId,
      settlement: {
        principalUsd: result.settlement.principalUsd,
        agreementPenaltyUsd: result.settlement.agreementPenaltyUsd,
        insuranceExitFromPrincipalUsd: result.settlement.insuranceExitFromPrincipalUsd,
        sessionEarnedUsd: result.settlement.sessionEarnedUsd,
        unreleasedEarnedUsd: result.settlement.unreleasedEarnedUsd,
        totalModeledEarnedUsd: result.settlement.totalModeledEarnedUsd,
        cumulativeReleasedUsd: result.settlement.cumulativeReleasedUsd,
        netPrincipalReturnedUsd: result.settlement.netPrincipalReturnedUsd,
        totalCreditedToMainUsd: result.settlement.totalCreditedToMainUsd,
      },
      balances: result.balances,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown"
    console.error("[early-exit]", msg)

    if (msg === "SESSION_NOT_FOUND") {
      return jsonMutationError(404, "SESSION_NOT_FOUND", "Fixed allocation not found.", msg, {
        suggested_action: "Refresh Container Mode.",
      })
    }
    if (msg === "FORBIDDEN") {
      return jsonMutationError(
        403,
        "FORBIDDEN",
        "You cannot early-exit an allocation that belongs to another account.",
        msg,
      )
    }
    if (msg === "EARLY_EXIT_NOT_ALLOWED" || msg === "session_not_active") {
      return jsonMutationError(
        400,
        "EARLY_EXIT_NOT_ALLOWED",
        "This allocation is not active, so early exit is not available here.",
        msg,
        { suggested_action: "Refresh to see the current session state." },
      )
    }
    if (msg === "lease_ended") {
      return jsonMutationError(
        400,
        "EARLY_EXIT_LEASE_ENDED",
        "The lease period has already ended. Use normal maturity settlement instead of early exit.",
        msg,
        { suggested_action: "Use “Refresh settlement” or wait for automatic maturity processing." },
      )
    }
    if (msg === "stake_principal_mismatch") {
      return jsonMutationError(
        409,
        "STAKE_PRINCIPAL_MISMATCH",
        "Stake and session principal mismatch. Contact support.",
        msg,
        { suggested_action: "Contact support with approximate allocation time; do not repeat early exit." },
      )
    }
    if (msg.includes("SETTLEMENT_EARNINGS_EXCEEDS_UNRELEASED") || msg.includes("CUMULATIVE_RELEASE_EXCEEDS_MODELED")) {
      return jsonMutationError(
        409,
        "EARNINGS_CONSERVATION_VIOLATION",
        "Earnings were already released; only the remaining unreleased balance can be settled. Contact support if this persists.",
        msg,
        { suggested_action: "Refresh the desk and review wallet history." },
      )
    }

    return jsonMutationError(
      500,
      "INTERNAL_ERROR",
      "Early exit could not complete. Please try again or contact support.",
      msg,
    )
  }
}
