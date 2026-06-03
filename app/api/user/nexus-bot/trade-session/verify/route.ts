import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { normalizeTradeCode } from "@/lib/nexus-bot/trade-code"
import { VERIFY_STEPS_USER } from "@/lib/nexus-bot/user-session-messaging"
import { expireDueTradeSessions } from "@/lib/server/trade-sessions"
import { verifyTradeSessionCode } from "@/lib/server/trade-session-verification"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as { code?: string }
    const code = normalizeTradeCode(body.code ?? "")
    if (!code) return NextResponse.json({ error: "Enter a trade code." }, { status: 400 })

    const admin = createAdminClient()
    await expireDueTradeSessions(admin)

    const out = await verifyTradeSessionCode(admin, user.id, code)
    const now = Date.now()
    const startMs = new Date(out.session.startAt).getTime()
    const preBook = startMs > now

    return NextResponse.json({
      ok: true,
      verified: true,
      verificationId: out.verificationId,
      verifiedAt: out.verifiedAt,
      expiresAt: out.expiresAt,
      preBookAllowed: true,
      preBook,
      session: {
        id: out.session.id,
      },
      steps: [...VERIFY_STEPS_USER],
      headline: "Code verified",
      detail: preBook
        ? "Select capital and activate Nexus Bot to book your trade before the session starts."
        : "Select capital and activate Nexus Bot to join this session.",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const status =
      msg === "CODE_INVALID_OR_EXPIRED" || msg === "SESSION_EXPIRED" ? 400 : 500
    return NextResponse.json(
      {
        ok: false,
        error:
          msg === "CODE_INVALID_OR_EXPIRED"
            ? "This trade code is not active or has expired."
            : msg === "SESSION_EXPIRED"
              ? "This session window has ended."
              : msg,
      },
      { status },
    )
  }
}
