import { NextResponse } from "next/server"

/** Consistent 4xx/423/5xx body for user-facing mutations (Option C). */
export type MutationErrorContext = {
  next_unlock_at?: string
  remaining_seconds?: number
  remaining_duration_phrase?: string
  current_accrued_gross_usd?: number
  cumulative_released_gross_usd?: number
  headroom_usd?: number
  withdraw_percent?: number
  suggested_action?: string
  lease_ends_at?: string
  session_id?: string
  [key: string]: string | number | boolean | undefined
}

export type MutationErrorBody = {
  success: false
  error_code: string
  user_message: string
  technical_message: string
  context?: MutationErrorContext
}

export function jsonMutationError(
  status: number,
  error_code: string,
  user_message: string,
  technical_message: string,
  context?: MutationErrorContext,
): NextResponse<MutationErrorBody> {
  return NextResponse.json(
    { success: false, error_code, user_message, technical_message, ...(context ? { context } : {}) },
    { status },
  )
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** Map Postgres RPC `fixed_trade_release_earnings_window_v1` / preview failure rows to envelope. */
export function envelopeFromFixedTradeReleaseRpc(rpc: Record<string, unknown>): MutationErrorBody {
  const code = typeof rpc.error === "string" ? rpc.error : "FIXED_TRADE_RELEASE_FAILED"

  if (code === "WITHDRAW_WINDOW_LOCKED") {
    return {
      success: false,
      error_code: code,
      user_message:
        typeof rpc.user_message === "string"
          ? rpc.user_message
          : "This earnings release window is not open yet. Accruals continue until the next unlock.",
      technical_message:
        "fixed_trade_release: calendar window closed (5-day rolling gate vs last_earnings_release_at).",
      context: {
        next_unlock_at: typeof rpc.next_unlock_at === "string" ? rpc.next_unlock_at : undefined,
        remaining_seconds: num(rpc.remaining_duration_seconds),
        remaining_duration_phrase:
          typeof rpc.remaining_duration_phrase === "string" ? rpc.remaining_duration_phrase : undefined,
        current_accrued_gross_usd: num(rpc.current_accrued_gross_usd),
        cumulative_released_gross_usd: num(rpc.cumulative_released_gross_usd),
        headroom_usd: num(rpc.headroom_usd),
        withdraw_percent: num(rpc.withdraw_percent),
        suggested_action: "Try again after the next unlock time shown above.",
      },
    }
  }

  if (code === "session_not_found") {
    return {
      success: false,
      error_code: "SESSION_NOT_FOUND",
      user_message: "Fixed allocation not found. Refresh dashboard and retry.",
      technical_message: "fixed_trade_release: session id not found or not visible.",
      context: { suggested_action: "Refresh Container Mode or open a new allocation." },
    }
  }

  if (code === "forbidden") {
    return {
      success: false,
      error_code: "FORBIDDEN",
      user_message: "You do not have access to act on this allocation.",
      technical_message: "fixed_trade_release: session user_id mismatch.",
      context: { suggested_action: "Sign in with the account that funded this session." },
    }
  }

  if (code === "session_not_active") {
    return {
      success: false,
      error_code: "SESSION_NOT_ACTIVE",
      user_message: "This fixed allocation is no longer active, so earnings cannot be released here.",
      technical_message: `fixed_trade_release: status ${String(rpc.status ?? "")}.`,
      context: { suggested_action: "Check maturity or early exit history in your wallet activity." },
    }
  }

  if (code === "no_accrual_yet") {
    return {
      success: false,
      error_code: "NO_ACCRUAL_YET",
      user_message: "No accrued earnings are available to release yet. The schedule continues to build.",
      technical_message: "fixed_trade_release: policy gross is zero at current time.",
      context: { suggested_action: "Check back after more session time has elapsed." },
    }
  }

  if (code === "headroom_exhausted") {
    return {
      success: false,
      error_code: "HEADROOM_EXHAUSTED",
      user_message:
        "Everything accrued so far for this window is already reflected in your container liquid balance.",
      technical_message: "fixed_trade_release: headroom gross minus cumulative is zero.",
      context: {
        current_accrued_gross_usd: num(rpc.policy_gross_usd),
        cumulative_released_gross_usd: num(rpc.cumulative_released_usd),
        suggested_action: "No further release is needed until new accrual builds headroom.",
      },
    }
  }

  if (code === "no_eligible_slice") {
    return {
      success: false,
      error_code: "NO_ELIGIBLE_SLICE",
      user_message: "Nothing is eligible for release in this window after policy caps.",
      technical_message: "fixed_trade_release: computed release slice is zero.",
      context: { suggested_action: "Wait for the next window or more accrual." },
    }
  }

  if (code === "balance_row_missing") {
    return {
      success: false,
      error_code: "BALANCE_ROW_MISSING",
      user_message: "Your wallet record is not ready yet. Please try again in a moment or contact support.",
      technical_message: "fixed_trade_release: user_balances row missing for user.",
      context: { suggested_action: "Retry after refresh; if it persists, contact support." },
    }
  }

  if (code === "negative_net_liquid") {
    return {
      success: false,
      error_code: "NEGATIVE_NET_LIQUID",
      user_message: "Release fee math produced an invalid result. Please try again or contact support.",
      technical_message: "fixed_trade_release: net liquid negative after fee.",
      context: { suggested_action: "Contact support if this repeats." },
    }
  }

  return {
    success: false,
    error_code: "FIXED_TRADE_RELEASE_FAILED",
      user_message: "Earnings release failed. Retry or contact support.",
    technical_message: `fixed_trade_release: unmapped error ${code}.`,
    context: { suggested_action: "Retry shortly; include approximate time if you contact support." },
  }
}

export function envelopeFromMaturityExceptionMessage(msg: string): MutationErrorBody {
  if (msg === "LEASE_NOT_ENDED") {
    return {
      success: false,
      error_code: "MATURITY_LEASE_NOT_ENDED",
      user_message: "This allocation has not reached its lease end yet, so maturity settlement is not available.",
      technical_message: "settleFixedTradeMaturityForUser: now < lease_end.",
      context: { suggested_action: "Return after the countdown reaches lease end." },
    }
  }
  if (msg === "FIXED_LIFECYCLE_BUCKET_RECONCILE_FAILED") {
    return {
      success: false,
      error_code: "MATURITY_LIFECYCLE_RECONCILE",
      user_message: "Settlement paused pending desk review. Contact support if persistent.",
      technical_message: "settleFixedTradeMaturityForUser: daily bucket sum does not reconcile to target.",
      context: { suggested_action: "Contact support with your session approximate open time." },
    }
  }
  if (msg === "Session not found") {
    return {
      success: false,
      error_code: "SESSION_NOT_FOUND",
      user_message: "That session was not found for your account.",
      technical_message: msg,
      context: { suggested_action: "Refresh the dashboard." },
    }
  }
  if (msg === "Forbidden") {
    return {
      success: false,
      error_code: "FORBIDDEN",
      user_message: "You cannot settle this session from the signed-in account.",
      technical_message: msg,
    }
  }
  return {
    success: false,
    error_code: "MATURITY_SETTLEMENT_FAILED",
    user_message: "Maturity settlement could not complete. You can retry shortly or contact support.",
    technical_message: msg,
    context: { suggested_action: "Use “Refresh settlement” again after a few minutes." },
  }
}

export function envelopeFromCopyCloseMessage(msg: string): MutationErrorBody {
  if (msg === "Session not found") {
    return {
      success: false,
      error_code: "SESSION_NOT_FOUND",
      user_message: "Copy allocation not found. Refresh and retry.",
      technical_message: "copy_trade_close: session row missing.",
      context: { suggested_action: "Refresh Container Mode." },
    }
  }
  if (msg === "Forbidden") {
    return {
      success: false,
      error_code: "FORBIDDEN",
      user_message: "You cannot close this copy session from the signed-in account.",
      technical_message: "copy_trade_close: user mismatch.",
    }
  }
  if (msg === "Session already closed") {
    return {
      success: false,
      error_code: "COPY_SESSION_ALREADY_CLOSED",
      user_message: "This copy session is already closed or settling.",
      technical_message: "copy_trade_close: idempotent / duplicate close.",
      context: { suggested_action: "Refresh the dashboard to sync state." },
    }
  }
  return {
    success: false,
    error_code: "COPY_SETTLEMENT_FAILED",
    user_message: "Copy settlement did not complete. Please try again or contact support.",
    technical_message: msg,
    context: { suggested_action: "Retry in a few minutes." },
  }
}
