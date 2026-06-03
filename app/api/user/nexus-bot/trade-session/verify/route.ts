import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { normalizeTradeCode } from "@/lib/nexus-bot/trade-code"
import { expireDueTradeSessions, findActiveTradeSessionByCode } from "@/lib/server/trade-sessions"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response

    const body = (await request.json().catch(() => ({}))) as { code?: string }
    const code = normalizeTradeCode(body.code ?? "")
    if (!code) return NextResponse.json({ error: "Enter a trade code." }, { status: 400 })

    const admin = createAdminClient()
    await expireDueTradeSessions(admin)

    const session = await findActiveTradeSessionByCode(admin, code)
    if (!session) {
      return NextResponse.json(
        { ok: false, phase: "expired", message: "This code is not active or has expired." },
        { status: 400 },
      )
    }

    const now = Date.now()
    const startMs = new Date(session.startAt).getTime()
    const endMs = new Date(session.endAt).getTime()
    const phase =
      now < startMs ? "pending" : now >= endMs ? "expired" : "ready"

    return NextResponse.json({
      ok: true,
      verified: true,
      phase,
      session: {
        id: session.id,
        code: session.code,
        sessionName: session.sessionName,
        displayLabel: session.displayLabel,
        sessionSlot: session.sessionSlot,
        startAt: session.startAt,
        endAt: session.endAt,
      },
      steps: [
        "Checking code…",
        "Code verified…",
        "Valid session found…",
        phase === "pending" ? "Waiting for session start…" : "Preparing trade session…",
      ],
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
