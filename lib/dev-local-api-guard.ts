import { NextResponse } from "next/server"
import { isDevLocalOnly } from "@/lib/dev-local-mode"

/** Use at the top of API route handlers that call the network. */
export function externalApisBlockedResponse(): NextResponse | null {
  /** Live Binance path uses server env keys; allow outbound exchange/network despite dev-local UI mode. */
  if (process.env.NEXUS_REAL_TRADING === "1") return null
  if (!isDevLocalOnly()) return null
  return NextResponse.json(
    {
      error:
        "External APIs are disabled (NEXT_PUBLIC_DEV_LOCAL_ONLY=1). Unset it to enable live services.",
    },
    { status: 503 }
  )
}
