import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import { resolveIdentifierToEmail } from "@/lib/server/auth-identifier"
import { sendPasswordRecoveryEmail } from "@/lib/cyberpersons-email"
import { getPublicSiteOrigin } from "@/lib/site-public-url"

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

    const siteBase = getPublicSiteOrigin(request.url)
    const redirectTo = `${siteBase}/auth/reset-password`

    const supabase = await createRouteHandlerSupabaseClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    if (resetError) {
      // Fallback: deliver recovery link via Cyberpersons when Supabase SMTP send fails.
      console.warn("recovery resetPasswordForEmail failed; trying Cyberpersons fallback:", resetError.message)
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      })
      if (linkError || !linkData?.properties?.action_link) {
        console.error("recovery fallback generateLink failed:", linkError)
        return NextResponse.json(
          { error: resetError.message || "Could not send recovery email" },
          { status: 500 }
        )
      }

      await sendPasswordRecoveryEmail(
        email,
        linkData.properties.action_link,
        "Valued Customer"
      )

      return NextResponse.json({
        ok: true,
        message: `Recovery sent to ${maskEmail(email)} (email only).`,
      })
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
