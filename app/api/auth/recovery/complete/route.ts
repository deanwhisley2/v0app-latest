import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { completePasswordResetWithCode } from "@/lib/server/password-reset-auth"

type Body = { email?: string; code?: string; password?: string }

/**
 * POST /api/auth/recovery/complete
 * Verifies 6-digit reset code and sets a new password (no email links).
 */
export async function POST(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim() : ""
  const code = typeof body.code === "string" ? body.code : ""
  const password = typeof body.password === "string" ? body.password : ""

  if (!email || !code || !password) {
    return NextResponse.json(
      { error: "email, code, and password are required." },
      { status: 400 },
    )
  }

  const result = await completePasswordResetWithCode(email, code, password)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    ok: true,
    message: "Password updated. You can sign in with your new password.",
  })
}
