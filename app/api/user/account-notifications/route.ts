import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()
    const { searchParams } = new URL(request.url)
    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") ?? 200)))
    const folder = (searchParams.get("folder") ?? "inbox").toLowerCase()

    let q = admin
      .from("user_account_notifications")
      .select("id,notification_type,title,body,nav,read_at,metadata,created_at,user_archived_at")
      .eq("user_id", user.id)
      .is("user_deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (folder === "archived") {
      q = q.not("user_archived_at", "is", null)
    } else {
      q = q.is("user_archived_at", null)
    }

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return NextResponse.json({ items: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as {
      id?: string
      action?: "mark_read" | "hide" | "clear_all" | "mark_all_read" | "archive" | "unarchive"
    }
    const admin = createAdminClient()
    const now = new Date().toISOString()

    if (body.action === "mark_all_read") {
      const { error } = await admin
        .from("user_account_notifications")
        .update({ read_at: now })
        .eq("user_id", user.id)
        .is("user_deleted_at", null)
        .is("user_archived_at", null)
        .is("read_at", null)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    if (body.action === "clear_all") {
      const { error } = await admin
        .from("user_account_notifications")
        .update({ user_deleted_at: now })
        .eq("user_id", user.id)
        .is("user_deleted_at", null)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    const id = typeof body.id === "string" ? body.id.trim() : ""
    if (!id || !UUID_RE.test(id) || !body.action) {
      return NextResponse.json({ error: "Valid id (uuid) and action are required." }, { status: 400 })
    }

    if (body.action === "mark_read") {
      const { error } = await admin
        .from("user_account_notifications")
        .update({ read_at: now })
        .eq("id", id)
        .eq("user_id", user.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    if (body.action === "hide") {
      const { error } = await admin
        .from("user_account_notifications")
        .update({ user_deleted_at: now })
        .eq("id", id)
        .eq("user_id", user.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    if (body.action === "archive") {
      const { error } = await admin
        .from("user_account_notifications")
        .update({ user_archived_at: now, read_at: now })
        .eq("id", id)
        .eq("user_id", user.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    if (body.action === "unarchive") {
      const { error } = await admin
        .from("user_account_notifications")
        .update({ user_archived_at: null })
        .eq("id", id)
        .eq("user_id", user.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
