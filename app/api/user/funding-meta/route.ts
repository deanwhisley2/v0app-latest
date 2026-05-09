import { NextResponse } from "next/server"

/** Public funding display (company crypto receive address). No secrets. */
export async function GET() {
  const address = (process.env.NEXUS_COMPANY_CRYPTO_WALLET ?? "").trim()
  const network = (process.env.NEXUS_COMPANY_CRYPTO_NETWORK ?? "USDT TRC20").trim()
  return NextResponse.json({
    companyCryptoWallet: address || null,
    companyCryptoNetwork: network,
  })
}
