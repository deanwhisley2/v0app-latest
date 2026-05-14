import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"

type Metadata = Record<string, unknown>

type ModelMeta = {
  earnedUsd?: number
  drawdownPct?: number
  updatedAt?: string
}

function mergeCopyMetadata(
  prev: Metadata | null | undefined,
  patch: { autoAdjust?: boolean; modeledEarnedUsd?: number; modeledDrawdownPct?: number },
): Metadata {
  const base = prev && typeof prev === "object" ? { ...prev } : {}
  const ui = typeof base.ui === "object" && base.ui !== null ? { ...(base.ui as object) } : {}
  const next: Metadata = { ...base, v: 1, ui: { ...ui } }

  if (typeof patch.autoAdjust === "boolean") {
    next.ui = { ...(next.ui as object), autoAdjust: patch.autoAdjust }
  }

  if (patch.modeledEarnedUsd !== undefined || patch.modeledDrawdownPct !== undefined) {
    const prevModel =
      typeof base.model === "object" && base.model !== null ? { ...(base.model as ModelMeta) } : {}
    const model: ModelMeta = { ...prevModel, updatedAt: new Date().toISOString() }
    if (typeof patch.modeledEarnedUsd === "number" && Number.isFinite(patch.modeledEarnedUsd)) {
      model.earnedUsd = patch.modeledEarnedUsd
    }
    if (typeof patch.modeledDrawdownPct === "number" && Number.isFinite(patch.modeledDrawdownPct)) {
      model.drawdownPct = Math.max(0, Math.min(0.85, patch.modeledDrawdownPct))
    }
    next.model = model
  }

  return next
}

/** Persist copy-desk UI flags and last modeled marks for server-side expiry sweep — does not move money. */
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
      modeledEarnedUsd?: number
      modeledDrawdownPct?: number
    }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 })

    const hasAuto = typeof body.autoAdjust === "boolean"
    const hasModeledEarned = typeof body.modeledEarnedUsd === "number" && Number.isFinite(body.modeledEarnedUsd)
    const hasModeledDd = typeof body.modeledDrawdownPct === "number" && Number.isFinite(body.modeledDrawdownPct)
    if (!hasAuto && !hasModeledEarned && !hasModeledDd) {
      return NextResponse.json(
        { error: "Provide autoAdjust and/or modeledEarnedUsd / modeledDrawdownPct to update." },
        { status: 400 },
      )
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

    const nextMeta = mergeCopyMetadata(row.metadata as Metadata | null, {
      autoAdjust: hasAuto ? body.autoAdjust : undefined,
      modeledEarnedUsd: hasModeledEarned ? body.modeledEarnedUsd : undefined,
      modeledDrawdownPct: hasModeledDd ? body.modeledDrawdownPct : undefined,
    })
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
