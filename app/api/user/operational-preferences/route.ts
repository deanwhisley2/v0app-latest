import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  mergeOperationalPreferencesInto,
  type OperationalPreferencesV1,
} from "@/lib/operational-preferences-types"

/**
 * PATCH merge into profiles.operational_preferences (notifications + uiChrome scaffolding).
 */
export async function POST(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const patch = body.patch ?? body.preferencesPatch
    if (!patch || typeof patch !== "object") {
      return NextResponse.json({ error: "patch object required" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: profile, error: readErr } = await admin
      .from("profiles")
      .select("operational_preferences")
      .eq("id", user.id)
      .maybeSingle()

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 })
    }

    const merged = mergeOperationalPreferencesInto(profile?.operational_preferences ?? null, patch as Partial<
      OperationalPreferencesV1
    >)

    const raw = JSON.stringify(merged)
    if (raw.length > 400_000) {
      return NextResponse.json({ error: "preferences payload too large" }, { status: 413 })
    }

    const { data: updated, error } = await admin
      .from("profiles")
      .update({
        operational_preferences: merged as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("id")

    if (error) {
      console.error("[operational-preferences]", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!updated?.length) {
      return NextResponse.json({ error: "profile row missing" }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[operational-preferences] POST", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
