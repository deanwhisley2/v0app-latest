import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { resolveIdentifierToEmail } from "@/lib/server/auth-identifier"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requestPasswordResetCode } from "@/lib/server/password-reset-auth"
import { getRequestIpAddress } from "@/lib/server/request-geo"
import { isSmtpConfigured } from "@/lib/server/smtp-mail"

type Body = { identifier?: string }

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return email
  const safeLocal =
    local.length <= 2 ? `${local[0] || "*"}*` : `${local[0]}***${local.slice(-1)}`
  return `${safeLocal}@${domain}`
}

/**
 * POST /api/auth/recovery/send
 * Sends a branded 6-digit reset code (Cyberpersons REST or SMTP). Never uses Supabase default reset email.
 */
export async function POST(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  const hasEmailApi = Boolean(process.env.CYBERPERSONS_EMAIL_API_KEY?.trim())
  if (!hasEmailApi && !isSmtpConfigured()) {
    return NextResponse.json(
      { error: "Password reset email is not configured on the server." },
      { status: 503 },
    )
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : ""
  if (!identifier) {
    return NextResponse.json({ error: "identifier is required" }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const email = await resolveIdentifierToEmail(admin, identifier)
    if (!email) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    const result = await requestPasswordResetCode({
      emailRaw: email,
      requestIp: getRequestIpAddress(request),
      userAgent: request.headers.get("user-agent"),
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      ok: true,
      email,
      message: result.message,
      maskedEmail: result.maskedEmail ?? maskEmail(email),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Recovery request failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
