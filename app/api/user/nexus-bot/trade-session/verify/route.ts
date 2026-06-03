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

    return NextResponse.json({
      ok: true,
      verified: true,
      verificationId: out.verificationId,
      verifiedAt: out.verifiedAt,
      expiresAt: out.expiresAt,
      session: {
        id: out.session.id,
        startAt: out.session.startAt,
        endAt: out.session.endAt,
      },
      steps: [...VERIFY_STEPS_USER],
      headline: "Trade Session Ready",
      detail: "Code verified · Strategy verified",
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
