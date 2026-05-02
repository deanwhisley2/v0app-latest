import { NextResponse } from "next/server"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import { createAdminClient } from "@/lib/supabaseAdmin"

/**
 * Confirms signup OTP via Supabase Auth, syncs profiles.is_verified, optional legacy cleanup.
 * Codes are issued by Auth emails — not stored in public.email_verifications by this app.
 */
export async function POST(request: Request) {
  try {
    let email: string | undefined
    let codeRaw: string | undefined
    try {
      const body = await request.json()
      email = typeof body.email === "string" ? body.email.trim() : undefined
      codeRaw = typeof body.code === "string" ? body.code.trim() : undefined
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!email || !codeRaw) {
      return NextResponse.json({ error: "email and code are required" }, { status: 400 })
    }

    const code = codeRaw.replace(/\D/g, "").slice(0, 6)
    if (code.length !== 6) {
      return NextResponse.json({ error: "Enter the 6-digit code" }, { status: 400 })
    }

    const supabase = await createRouteHandlerSupabaseClient()

    const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "signup",
    })

    if (otpError) {
      return NextResponse.json(
        { error: otpError.message || "Invalid or expired code" },
        { status: 400 }
      )
    }

    const userId = otpData.session?.user?.id ?? otpData.user?.id
    if (!userId) {
      return NextResponse.json(
        { error: "Verification incomplete. Try again." },
        { status: 400 }
      )
    }

    const nowIso = new Date().toISOString()
    const admin = createAdminClient()

    const { error: profileErr } = await admin
      .from("profiles")
      .update({ is_verified: true })
      .eq("id", userId)

    if (profileErr) {
      console.error("profiles update:", profileErr)
      return NextResponse.json({ error: "Could not activate account" }, { status: 500 })
    }

    const { error: confirmErr } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    })

    if (confirmErr) {
      console.error("auth email_confirm:", confirmErr)
      return NextResponse.json(
        { error: "Could not finalize email confirmation" },
        { status: 500 }
      )
    }

    const { error: balanceUpsertErr } = await admin.from("user_balances").upsert(
      {
        user_id: userId,
        total_earnings: 0,
        current_stake: 0,
        available_balance: 0,
        last_updated: nowIso,
      },
      { onConflict: "user_id" }
    )

    if (balanceUpsertErr) {
      console.error("user_balances upsert:", balanceUpsertErr)
    }

    await admin.from("email_verifications").delete().eq("user_id", userId)

    await supabase.auth.signOut()

    return NextResponse.json({ ok: true, message: "Email verified. You can sign in." })
  } catch (e) {
    console.error("verify-code:", e)
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
