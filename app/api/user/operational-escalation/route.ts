import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  bridgeCryptoDepositDispute,
  bridgeUserOperationalEscalation,
  type EscalationSource,
  type OperationalLinkedKind,
  type OperationalPriority,
  type OperationalThreadCategory,
} from "@/lib/server/operational-support-bridge"

const ALLOWED_CATEGORIES: OperationalThreadCategory[] = [
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
  "payout_dispute",
  "stuck_trade",
  "settlement_failure",
  "locked_balance",
  "verification_complaint",
]

const LINKED_KINDS: OperationalLinkedKind[] = [
  "retailer_fund_request",
  "withdrawal_request",
  "crypto_deposit_request",
  "trade_session",
  "copy_trade_session",
]

/** Unified operational escalation entry (all dispute types). */
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
      cryptoDepositId?: string
      source?: string
      priority?: string
      searchKey?: string
    }

    const admin = createAdminClient()

    if (body.cryptoDepositId && typeof body.body === "string") {
      const { threadId } = await bridgeCryptoDepositDispute(admin, {
        userId: user.id,
        depositId: body.cryptoDepositId.trim(),
        reason: body.body.trim(),
        priority: body.priority === "urgent" ? "urgent" : "high",
      })
      return NextResponse.json({ threadId, operationalStatus: "pending_admin" })
    }

    const text = typeof body.body === "string" ? body.body.trim() : ""
    if (!text || text.length > 12_000) {
      return NextResponse.json({ error: "body is required (max 12000 chars)." }, { status: 400 })
    }

    const catRaw = typeof body.category === "string" ? body.category.trim().toLowerCase() : ""
    const category = ALLOWED_CATEGORIES.includes(catRaw as OperationalThreadCategory)
      ? (catRaw as OperationalThreadCategory)
      : undefined

    const lk = body.linkedKind?.trim()
    const linkedKind = LINKED_KINDS.includes(lk as OperationalLinkedKind) ? (lk as OperationalLinkedKind) : null
    const linkedId =
      typeof body.linkedId === "string" && /^[0-9a-f-]{36}$/i.test(body.linkedId) ? body.linkedId : null

    const source = body.source === "assistant" ? "assistant" : "user"
    const escalationSource: EscalationSource = source === "assistant" ? "assistant" : "user_desk"
    const priority: OperationalPriority | undefined =
      body.priority === "urgent" || body.priority === "high" ? body.priority : undefined

    const { threadId, created } = await bridgeUserOperationalEscalation(admin, {
      userId: user.id,
      body: text,
      category,
      linkedKind,
      linkedId,
      source,
      escalationSource,
      priority,
      searchKey: typeof body.searchKey === "string" ? body.searchKey.trim().toLowerCase() : null,
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
