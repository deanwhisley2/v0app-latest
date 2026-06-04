import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { requestMagicLink } from "@/lib/server/magic-link-auth"
import { getRequestIpAddress } from "@/lib/server/request-geo"
import { isSmtpConfigured } from "@/lib/server/smtp-mail"

type Body = { email?: string }

/**
 * POST /api/auth/request-magic-link
 * Sends a 6-digit sign-in code (Cyberpersons REST or SMTP). Anti-enumeration: same response when email unknown.
 */
export async function POST(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  if (!isSmtpConfigured()) {
    return NextResponse.json(
      {
        error:
          "Magic link email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD on the server.",
      },
      { status: 503 },
    )
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim() : ""
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 })
  }

  const result = await requestMagicLink({
    emailRaw: email,
    requestUrl: request.url,
    requestIp: getRequestIpAddress(request),
    userAgent: request.headers.get("user-agent"),
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    ok: true,
    message: result.message,
    maskedEmail: result.maskedEmail,
  })
}
