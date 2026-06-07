/** Customer-visible Uganda MoMo receive rails for self-service copy & pay. */

import {
  ugDepositReceiveRoutesFallback,
  ugPayeeFromDepositRoutes,
} from "@/lib/client/ug-deposit-receive-routes"

export type UgMoMoNetwork = "MTN" | "Airtel"

export {
  ugDepositReceiveRoutesFallback,
  ugPayeeFromDepositRoutes,
  type UgDepositReceiveRouteClient,
  type UgDepositReceiveRoutesClient,
} from "@/lib/client/ug-deposit-receive-routes"

/** @deprecated Use ugDepositReceiveRoutesFallback().MTN — kept for import compatibility. */
export const UG_MTN_RECEIVE = {
  account: "+256794152339",
  name: "AZIZZA NANKWANGA",
} as const

/** @deprecated Use ugDepositReceiveRoutesFallback().Airtel */
export const UG_AIRTEL_RECEIVE = {
  account: "7095290",
  name: "Nexus Pro2",
  merchantMenuName: "Venture Nexus Pro",
} as const

export function ugMoMoPayeeForNetwork(network: UgMoMoNetwork): {
  account: string
  name: string
  accountLabel: string
} {
  const routes = ugDepositReceiveRoutesFallback()
  const row = ugPayeeFromDepositRoutes(routes, network)
  return {
    account: row.account,
    name: row.name,
    accountLabel: row.accountLabel,
  }
}
