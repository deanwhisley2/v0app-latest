import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import {
  ADMIN_USDT_BINANCE_DEEP_LINK,
  ADMIN_USDT_TRC20_NETWORK,
  ADMIN_USDT_TRC20_WALLET,
  MAX_RETAILERS_ON_PAYMENT_PAGE,
  UGANDA_AIRTEL_MERCHANT_ID,
  UGANDA_AIRTEL_MERCHANT_NAME,
  UGANDA_AIRTEL_USSD_PREFIX,
} from "@/lib/server/admin-payment-config"

/** Public payment rails for Add Funds (Level-5 admin receive). */
export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response

    return NextResponse.json({
      globalCrypto: {
        network: ADMIN_USDT_TRC20_NETWORK,
        walletAddress: ADMIN_USDT_TRC20_WALLET,
        binanceDeepLink: ADMIN_USDT_BINANCE_DEEP_LINK,
        warning: "Send only USDT via TRC20 network.",
        routedTo: "level_5_admin",
      },
      ugandaAirtel: {
        merchantId: UGANDA_AIRTEL_MERCHANT_ID,
        merchantName: UGANDA_AIRTEL_MERCHANT_NAME,
        ussdPrefix: UGANDA_AIRTEL_USSD_PREFIX,
        referenceHint: "Use your login email as the payment reference.",
        routedTo: "level_5_admin",
      },
      maxRetailersOnPage: MAX_RETAILERS_ON_PAYMENT_PAGE,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
