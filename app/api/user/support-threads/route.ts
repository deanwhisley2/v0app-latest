import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
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
    const allowed = [
      "general",
      "funding_dispute",
      "withdrawal_dispute",
      "appeal",
      "security",
      "retailer",
      "crypto_dispute",
      "assistant_escalation",
      "transaction_review",
      "operational_complaint",
    ] as const
    const category = (allowed as readonly string[]).includes(catRaw) ? catRaw : "general"

    const lk = body.linkedKind?.trim()
    const linked_kind =
      lk === "retailer_fund_request" ||
      lk === "withdrawal_request" ||
      lk === "crypto_deposit_request"
        ? lk
        : null
    const linked_id =
      typeof body.linkedId === "string" && /^[0-9a-f-]{36}$/i.test(body.linkedId) ? body.linkedId : null

    const admin = createAdminClient()
    const { bridgeUserOperationalEscalation } = await import("@/lib/server/operational-support-bridge")
    const { threadId } = await bridgeUserOperationalEscalation(admin, {
      userId: user.id,
      body: text,
      category: category as (typeof allowed)[number],
      linkedKind: linked_kind as "retailer_fund_request" | "withdrawal_request" | "crypto_deposit_request" | null,
      linkedId: linked_id,
      source: "user",
    })

    return NextResponse.json({ threadId, operationalStatus: "pending_admin" })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
