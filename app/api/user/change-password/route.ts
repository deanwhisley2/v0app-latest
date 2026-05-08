import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"

export async function POST(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const body = (await request.json().catch(() => ({}))) as {
      currentPassword?: string
      newPassword?: string
    }
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : ""
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : ""
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "currentPassword and newPassword are required" }, { status: 400 })
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
    const verifier = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const verify = await verifier.auth.signInWithPassword({ email: user.email ?? "", password: currentPassword })
    if (verify.error || !verify.data.session) {
      return NextResponse.json(
        { error: "Current password is incorrect. If unknown, use face recovery fallback." },
        { status: 400 }
      )
    }
    await verifier.auth.signOut()

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(user.id, { password: newPassword })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, message: "Password changed successfully." })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
