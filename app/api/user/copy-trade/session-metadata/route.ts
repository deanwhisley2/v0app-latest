import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"

type Metadata = Record<string, unknown>

function mergeCopyMetadata(prev: Metadata | null | undefined, autoAdjust: boolean): Metadata {
  const base = prev && typeof prev === "object" ? { ...prev } : {}
  const ui = typeof base.ui === "object" && base.ui !== null ? { ...(base.ui as object) } : {}
  return { ...base, v: 1, ui: { ...ui, autoAdjust } }
}

/** Persist copy-desk UI flags (e.g. auto-adjust) for session recovery — does not move money. */
export async function PATCH(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level === 2 || level === 5) {
      return NextResponse.json({ error: "Trading metadata not available for this account type." }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string
      autoAdjust?: boolean
    }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 })
    if (typeof body.autoAdjust !== "boolean") {
      return NextResponse.json({ error: "autoAdjust boolean required" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: row, error: fErr } = await admin
      .from("copy_trade_sessions")
      .select("id,user_id,status,metadata")
      .eq("id", sessionId)
      .maybeSingle()
    if (fErr) throw new Error(fErr.message)
    if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    if (row.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (row.status !== "active") {
      return NextResponse.json({ error: "Session is not active" }, { status: 400 })
    }

    const nextMeta = mergeCopyMetadata(row.metadata as Metadata | null, body.autoAdjust)
    const { error: uErr } = await admin
      .from("copy_trade_sessions")
      .update({ metadata: nextMeta })
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .eq("status", "active")
    if (uErr) throw new Error(uErr.message)

    return NextResponse.json({ ok: true, metadata: nextMeta })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
