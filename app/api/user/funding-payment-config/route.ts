import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import {
  ADMIN_USDT_BINANCE_DEEP_LINK,
  ADMIN_USDT_TRC20_NETWORK,
  CRYPTO_MIN_CONFIRMATIONS,
  MAX_RETAILERS_ON_PAYMENT_PAGE,
  NEXUS_TRC20_RECEIVE_ADDRESS,
  UGANDA_AIRTEL_MERCHANT_ID,
  UGANDA_AIRTEL_MERCHANT_NAME,
  UGANDA_AIRTEL_LEGAL_PAYEE,
  UGANDA_AIRTEL_USSD_PREFIX,
} from "@/lib/server/admin-payment-config"
import { isUgandaAdminAirtelEligible } from "@/lib/operating-countries"
import { createAdminClient } from "@/lib/supabaseAdmin"

/** Public payment rails for Add Funds (Level-5 admin receive). */
export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response

    const admin = createAdminClient()
    const { data: prof } = await admin
      .from("profiles")
      .select("funding_country_code")
      .eq("id", auth.user.id)
      .maybeSingle()
    const fundingCountry = String(prof?.funding_country_code ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 2)
    const ugandaAirtelEligible = isUgandaAdminAirtelEligible(fundingCountry)

    return NextResponse.json({
      fundingCountryCode: fundingCountry.length === 2 ? fundingCountry : null,
      rails: {
        globalCrypto: true,
        ugandaAirtel: ugandaAirtelEligible,
        localMobile: true,
      },
      globalCrypto: {
        network: ADMIN_USDT_TRC20_NETWORK,
        walletAddress: NEXUS_TRC20_RECEIVE_ADDRESS,
        binanceDeepLink: ADMIN_USDT_BINANCE_DEEP_LINK,
        warning: "Send only USDT via TRC20 network.",
        autoVerify: true,
        minConfirmations: CRYPTO_MIN_CONFIRMATIONS,
        routedTo: "tronlink_automated",
      },
      ugandaAirtel: ugandaAirtelEligible
        ? {
            merchantId: UGANDA_AIRTEL_MERCHANT_ID,
            merchantName: UGANDA_AIRTEL_MERCHANT_NAME,
            legalPayeeName: UGANDA_AIRTEL_LEGAL_PAYEE,
            networkMerchantNamesHint: "Nexus Pro or Venture Nexus Pro",
            ussdPrefix: UGANDA_AIRTEL_USSD_PREFIX,
            referenceHint: "Use your login email as the payment reference.",
            routedTo: "level_5_admin",
          }
        : null,
      maxRetailersOnPage: MAX_RETAILERS_ON_PAYMENT_PAGE,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
