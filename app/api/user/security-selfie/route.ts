import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      hasSelfie: Boolean(data?.avatar_url),
      avatarUrl: data?.avatar_url ?? null,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const avatarUrl = typeof body.avatar_url === "string" ? body.avatar_url.trim() : ""
    if (!avatarUrl) {
      return NextResponse.json({ error: "avatar_url is required" }, { status: 400 })
    }
    if (avatarUrl.length > 500_000) {
      return NextResponse.json({ error: "Selfie payload too large" }, { status: 413 })
    }

    const admin = createAdminClient()
    const nowIso = new Date().toISOString()
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        avatar_url: avatarUrl,
        updated_at: nowIso,
      })
      .eq("id", user.id)
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

    const currentMeta = (user.user_metadata ?? {}) as Record<string, unknown>
    const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...currentMeta,
        avatar_url: avatarUrl,
        selfie_enrolled_at: nowIso,
      },
    })
    if (metaError) return NextResponse.json({ error: metaError.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
