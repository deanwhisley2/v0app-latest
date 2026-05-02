import { NextResponse } from "next/server"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"

/** Triggers Supabase Auth to resend signup confirmation (OTP or link — per your templates). No Resend. */

export async function POST(req: Request) {
  let email: string | undefined
  try {
    const body = await req.json()
    email = typeof body.email === "string" ? body.email.trim() : undefined
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 })
  }

  const origin = new URL(req.url).origin
  const emailRedirectTo = `${origin}/auth/verify`

  const supabase = await createRouteHandlerSupabaseClient()
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ message: "Verification code sent" })
}
