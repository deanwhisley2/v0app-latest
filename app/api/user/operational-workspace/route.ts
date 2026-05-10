import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { hydrateWorkspaceFromRemote } from "@/lib/dashboard-activity-session"
import { createAdminClient } from "@/lib/supabaseAdmin"

/** Persist structured dashboard/command-center workspace (validated). */
export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth


    const body = await request.json().catch(() => ({}))
    const workspace = body.workspace
    if (!workspace || typeof workspace !== "object") {
      return NextResponse.json({ error: "workspace object required" }, { status: 400 })
    }

    const raw = JSON.stringify(workspace)
    if (raw.length > 48_000) {
      return NextResponse.json({ error: "workspace too large" }, { status: 413 })
    }

    const validated = hydrateWorkspaceFromRemote(workspace, user.id)
    if (!validated) return NextResponse.json({ error: "invalid workspace snapshot" }, { status: 400 })

    const admin = createAdminClient()
    const { data: updated, error } = await admin
      .from("profiles")
      .update({
        operational_workspace: validated as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("id")

    if (error) {
      console.error("[operational-workspace]", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!updated?.length) {
      return NextResponse.json({ error: "profile row missing" }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[operational-workspace] POST", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
