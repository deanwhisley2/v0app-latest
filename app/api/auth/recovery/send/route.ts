import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import { resolveIdentifierToEmail } from "@/lib/server/auth-identifier"

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

    const supabase = await createRouteHandlerSupabaseClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })
    if (error) {
      console.error("recovery resetPasswordForEmail:", error)
      return NextResponse.json(
        { error: error.message || "Could not send recovery email" },
        { status: 500 }
      )
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
