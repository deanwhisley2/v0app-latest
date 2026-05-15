import { NextResponse } from "next/server"
import { ADMIN_USDT_TRC20_NETWORK, ADMIN_USDT_TRC20_WALLET } from "@/lib/server/admin-payment-config"

/** Public funding display (company crypto receive address). No secrets. */
export async function GET() {
  return NextResponse.json({
    companyCryptoWallet: ADMIN_USDT_TRC20_WALLET,
    companyCryptoNetwork: ADMIN_USDT_TRC20_NETWORK,
  })
}
