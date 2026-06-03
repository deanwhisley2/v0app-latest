import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { resolvePublicTradeSignal } from "@/lib/server/trade-signal-public"

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params
    const admin = createAdminClient()
    const signal = await resolvePublicTradeSignal(admin, code, request.url)
    return NextResponse.json({ ok: true, signal })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
