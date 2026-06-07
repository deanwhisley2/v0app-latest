/** Client shape for `/api/user/funding-payment-config` Uganda deposit routes. */

export type UgDepositReceiveRouteClient = {
  network: "MTN" | "Airtel"
  account: string
  name: string
  accountLabel: string
  ussdPrefix: string | null
  source: "database" | "fallback"
}

export type UgDepositReceiveRoutesClient = {
  MTN: UgDepositReceiveRouteClient
  Airtel: UgDepositReceiveRouteClient
}

/** Offline fallback when API has not loaded yet (mirrors ESK desk canonical lines). */
export function ugDepositReceiveRoutesFallback(): UgDepositReceiveRoutesClient {
  return {
    MTN: {
      network: "MTN",
      account: "+256794152339",
      name: "AZIZZA NANKWANGA",
      accountLabel: "MTN Account",
      ussdPrefix: "*165*1#",
      source: "fallback",
    },
    Airtel: {
      network: "Airtel",
      account: "7095290",
      name: "Nexus Pro2",
      accountLabel: "Airtel Merchant ID",
      ussdPrefix: "*185*9#",
      source: "fallback",
    },
  }
}

export function ugPayeeFromDepositRoutes(
  routes: UgDepositReceiveRoutesClient,
  network: "MTN" | "Airtel",
): UgDepositReceiveRouteClient {
  return routes[network]
}
