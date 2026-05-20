import { jsonMutationError } from "@/lib/api/mutation-error-envelope"
import { getCustomerTradingAccessGate } from "@/lib/server/security-authz"
import {
  isLiquidityAdminDesk,
  isRetailerCreditDesk,
  type TradingUserLevel,
} from "@/lib/platform-roles"

/** Block copy/fix/trade-session APIs for retailer desks and L5 admin only — not all level-2 users. */
export async function customerTradingApiGuardResponse(
  userId: string,
  email: string | null | undefined,
  technicalPrefix: string,
) {
  const gate = await getCustomerTradingAccessGate(userId, email)
  return customerTradingApiGuardFromGate(gate.level, gate.retailerCreditSeller, technicalPrefix)
}

export function customerTradingApiGuardFromGate(
  level: TradingUserLevel,
  retailerCreditSeller: boolean,
  technicalPrefix: string,
) {
  if (isLiquidityAdminDesk(level)) {
    return jsonMutationError(
      403,
      "ADMIN_DESK_TRADING_BLOCKED",
      "Liquidity admin accounts cannot use customer trading from this flow.",
      `${technicalPrefix}: level 5 admin desk.`,
      { suggested_action: "Use a standard customer trading account." },
    )
  }
  if (isRetailerCreditDesk(level, retailerCreditSeller)) {
    return jsonMutationError(
      403,
      "RETAILER_DESK_TRADING_BLOCKED",
      "Retailer liquidity desks cannot use customer trading APIs.",
      `${technicalPrefix}: retailer_credit_seller desk.`,
      { suggested_action: "Use a non-retailer trading account for container mode." },
    )
  }
  return null
}
