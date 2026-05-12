import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { notifyLiquidityAdminsSupportQueue } from "@/lib/support-thread-notifications"

/** User lists / creates operational support threads (appeals). */
export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("operational_support_threads")
      .select("id,category,status,linked_kind,linked_id,escalated,unread_for_user,unread_for_admin,last_message_at,created_at,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(100)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ threads: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as {
      body?: string
      category?: string
      linkedKind?: string | null
      linkedId?: string | null
    }
    const text = typeof body.body === "string" ? body.body.trim() : ""
    if (!text || text.length > 12_000) {
      return NextResponse.json({ error: "body is required (max 12000 chars)." }, { status: 400 })
    }
    const catRaw = typeof body.category === "string" ? body.category.trim().toLowerCase() : "general"
    const category =
      catRaw === "funding_dispute" ||
      catRaw === "withdrawal_dispute" ||
      catRaw === "appeal" ||
      catRaw === "security" ||
      catRaw === "retailer"
        ? catRaw
        : "general"

    const lk = body.linkedKind?.trim()
    const linked_kind =
      lk === "retailer_fund_request" || lk === "withdrawal_request" ? lk : null
    const linked_id =
      typeof body.linkedId === "string" && /^[0-9a-f-]{36}$/i.test(body.linkedId) ? body.linkedId : null

    const admin = createAdminClient()
    const now = new Date().toISOString()
    const { data: thread, error: tErr } = await admin
      .from("operational_support_threads")
      .insert({
        user_id: user.id,
        category,
        status: "pending_admin",
        linked_kind,
        linked_id,
        unread_for_admin: true,
        unread_for_user: false,
        last_message_at: now,
        updated_at: now,
      })
      .select("id")
      .single()
    if (tErr || !thread?.id) {
      return NextResponse.json({ error: tErr?.message ?? "Failed to create thread." }, { status: 500 })
    }

    const { error: mErr } = await admin.from("operational_support_messages").insert({
      thread_id: thread.id,
      sender_user_id: user.id,
      sender_role: "user",
      body: text,
    })
    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 500 })
    }

    try {
      await notifyLiquidityAdminsSupportQueue(admin, {
        threadId: thread.id,
        title: "New support / appeal",
        body: text.slice(0, 400),
      })
    } catch (ne) {
      console.error("[support] notify admins failed:", ne)
    }

    return NextResponse.json({ threadId: thread.id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
