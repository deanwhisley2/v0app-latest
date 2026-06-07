/** Customer-visible Uganda MoMo receive rails for self-service copy & pay. */

export type UgMoMoNetwork = "MTN" | "Airtel"

export const UG_MTN_RECEIVE = {
  account: "0791226253",
  name: "Jamadah Kayemba",
} as const

/** Mirrors L5 admin Airtel direct receive (`lib/server/admin-payment-config.ts`). */
export const UG_AIRTEL_RECEIVE = {
  account: "7095287",
  name: "Pegasus Technologies LTD",
  merchantMenuName: "Venture Nexus Pro",
} as const

export function ugMoMoPayeeForNetwork(network: UgMoMoNetwork): {
  account: string
  name: string
  accountLabel: string
} {
  if (network === "MTN") {
    return {
      account: UG_MTN_RECEIVE.account,
      name: UG_MTN_RECEIVE.name,
      accountLabel: "MTN Account",
    }
  }
  return {
    account: UG_AIRTEL_RECEIVE.account,
    name: UG_AIRTEL_RECEIVE.name,
    accountLabel: "Airtel Merchant ID",
  }
}
