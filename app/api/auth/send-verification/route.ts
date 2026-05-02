import { NextResponse } from "next/server"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"

// Supabase sends the verification email when signup confirmation is enabled.
// This endpoint triggers a resend for users who did not receive it.

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

  const supabase = await createRouteHandlerSupabaseClient()
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ message: "Verification code sent" })
}
