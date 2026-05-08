import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { resolveIdentifierToEmail } from "@/lib/server/auth-identifier"
import { getBrevoMessageEvent, sendPasswordRecoveryEmail } from "@/lib/brevo"

type Body = { identifier?: string }

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return email
  const safeLocal =
    local.length <= 2 ? `${local[0] || "*"}*` : `${local[0]}***${local.slice(-1)}`
  return `${safeLocal}@${domain}`
}

export async function POST(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

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

    const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(
      /\/$/,
      ""
    )
    const redirectTo = `${siteBase}/auth/reset-password`

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    })
    if (error || !data?.properties?.action_link) {
      console.error("recovery generateLink:", error)
      return NextResponse.json(
        { error: error?.message || "Could not generate recovery link" },
        { status: 500 }
      )
    }

    const messageId = await sendPasswordRecoveryEmail(
      email,
      data.properties.action_link,
      "Valued Customer"
    )

    // Fast feedback: catch immediate soft/hard bounces to avoid false success.
    if (messageId) {
      await new Promise((r) => setTimeout(r, 1300))
      const ev = await getBrevoMessageEvent(messageId)
      if (ev?.event === "softBounces" || ev?.event === "hardBounces") {
        console.error("recovery delivery bounce:", ev.reason || ev.event)
        return NextResponse.json(
          {
            error:
              "Recovery email was blocked by the recipient provider. Try a non-Gmail address, check sender reputation settings, or retry shortly.",
          },
          { status: 502 }
        )
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Recovery sent to ${maskEmail(email)} (email only).`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Recovery request failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
