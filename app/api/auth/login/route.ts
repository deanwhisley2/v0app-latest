import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { grantNewMemberWelcomeBonus } from "@/lib/server/new-member-campaign"

type LoginBody = {
  email?: string
  password?: string
}

/**
 * Server-side sign-in so Supabase auth cookies are written via Next.js cookie store
 * (reliable on new devices/browsers). Client should hard-navigate to /dashboard after ok.
 */
export async function POST(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  let body: LoginBody
  try {
    body = (await request.json()) as LoginBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 })
  }

  const supabase = await createRouteHandlerSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const msg = error.message
    const status = msg.toLowerCase().includes("invalid login credentials") ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }

  if (!data.session?.user) {
    return NextResponse.json({ error: "No session returned. Try again or contact support." }, { status: 500 })
  }

  try {
    const admin = createAdminClient()
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("is_verified")
      .eq("id", data.user.id)
      .maybeSingle()

    if (profErr) {
      console.warn("[auth/login] profiles check:", profErr.message)
    } else if (profile?.is_verified === false) {
      await supabase.auth.signOut()
      return NextResponse.json(
        {
          error: "Verify your email before signing in.",
          code: "EMAIL_NOT_VERIFIED",
          email,
        },
        { status: 403 },
      )
    } else {
      try {
        await grantNewMemberWelcomeBonus(admin, data.user.id, "login")
      } catch (grantErr) {
        console.warn("[auth/login] welcome bonus:", grantErr instanceof Error ? grantErr.message : grantErr)
      }
    }
  } catch (e) {
    console.warn("[auth/login] profile gate:", e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ok: true, userId: data.user.id })
}
