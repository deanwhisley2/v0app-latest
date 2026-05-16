import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  bridgeUserOperationalEscalation,
  type OperationalLinkedKind,
  type OperationalThreadCategory,
} from "@/lib/server/operational-support-bridge"

/** Create or extend a unified operational thread (assistant / support escalation). */
export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as {
      body?: string
      category?: string
      linkedKind?: string
      linkedId?: string
      source?: string
    }
    const text = typeof body.body === "string" ? body.body.trim() : ""
    if (!text || text.length > 12_000) {
      return NextResponse.json({ error: "body is required (max 12000 chars)." }, { status: 400 })
    }

    const catRaw = typeof body.category === "string" ? body.category.trim().toLowerCase() : ""
    const allowedCategories: OperationalThreadCategory[] = [
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
    ]
    const category = allowedCategories.includes(catRaw as OperationalThreadCategory)
      ? (catRaw as OperationalThreadCategory)
      : undefined

    const lk = body.linkedKind?.trim()
    const linkedKinds: OperationalLinkedKind[] = [
      "retailer_fund_request",
      "withdrawal_request",
      "crypto_deposit_request",
    ]
    const linkedKind = linkedKinds.includes(lk as OperationalLinkedKind)
      ? (lk as OperationalLinkedKind)
      : null
    const linkedId =
      typeof body.linkedId === "string" && /^[0-9a-f-]{36}$/i.test(body.linkedId) ? body.linkedId : null

    const source = body.source === "assistant" ? "assistant" : "user"
    const admin = createAdminClient()
    const { threadId, created } = await bridgeUserOperationalEscalation(admin, {
      userId: user.id,
      body: text,
      category,
      linkedKind,
      linkedId,
      source,
    })

    return NextResponse.json({
      threadId,
      created,
      operationalStatus: "pending_admin",
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
