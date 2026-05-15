import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { pollOpenCryptoDeposits } from "@/lib/server/crypto-deposit-service"

/** Poll TronGrid for open USDT TRC20 deposits and auto-credit when confirmed. */
export async function POST(request: Request) {
  try {
    const configured = process.env.CRON_SECRET?.trim()
    const headerSecret =
      request.headers.get("x-cron-secret")?.trim() ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
    if (!configured || headerSecret !== configured) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = createAdminClient()
    const result = await pollOpenCryptoDeposits(admin)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
