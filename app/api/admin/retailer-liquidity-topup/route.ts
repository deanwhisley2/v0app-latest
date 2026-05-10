import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { creditRetailerLiquidityPlusCommission } from "@/lib/server/retailer-funding-helpers"
import type { FloatLiquidityDebitSource } from "@/lib/server/admin-retail-pool"
import {
  adminRetailPoolUserId,
  debitFloatLiquidityOnApproval,
  getTreasurySettlementModeInfo,
  refundFloatLiquidityDebit,
} from "@/lib/server/admin-retail-pool"
import { notifyUserFundingDecision } from "@/lib/server/approval-inbox-notify"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(user)
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("retailer_admin_topup_requests")
      .select(
        "id,retailer_user_id,amount_requested,crypto_tx_reference,status,commission_rate,amount_credited,created_at,reviewed_at,note,resolution_note,held_at"
      )
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ requests: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(user)
    const body = (await request.json().catch(() => ({}))) as {
      requestId?: string
      action?: "approve" | "reject" | "hold"
      resolutionNote?: string
    }
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : ""
    if (!requestId || !body.action) {
      return NextResponse.json({ error: "requestId and action required." }, { status: 400 })
    }
    const resolutionNote =
      typeof body.resolutionNote === "string" ? body.resolutionNote.trim().slice(0, 1200) || null : null

    const admin = createAdminClient()
    const { data: row, error: fe } = await admin
      .from("retailer_admin_topup_requests")
      .select(
        "id,retailer_user_id,amount_requested,crypto_tx_reference,status,commission_rate,amount_credited,resolution_note",
      )
      .eq("id", requestId)
      .maybeSingle()
    if (fe) return NextResponse.json({ error: fe.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 })
    if (row.status !== "pending" && row.status !== "under_review") {
      return NextResponse.json({ error: "Request already processed." }, { status: 400 })
    }
    const now = new Date().toISOString()

    if (body.action === "hold") {
      const { error: up } = await admin
        .from("retailer_admin_topup_requests")
        .update({
          status: "under_review",
          held_at: now,
          resolution_note: resolutionNote,
          updated_at: now,
        })
        .eq("id", requestId)
      if (up) return NextResponse.json({ error: up.message }, { status: 400 })
      await recordFinancialEvent({
        userId: row.retailer_user_id,
        eventType: "retailer_admin_topup_hold",
        category: "admin",
        amount: Number(row.amount_requested ?? 0),
        status: "pending",
        actorType: "admin",
        actorId: user.id,
        transactionRef: row.crypto_tx_reference,
        summary: "Float top-up placed on hold / investigation by Level-5 liquidity admin.",
        metadata: { requestId, resolutionNote },
      })
      await notifyUserFundingDecision(admin, {
        userId: row.retailer_user_id,
        headline: "Float top-up held for operations review",
        relatedId: requestId,
      })
      return NextResponse.json({ ok: true })
    }

    if (body.action === "reject") {
      const { error: up } = await admin
        .from("retailer_admin_topup_requests")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: now,
          resolution_note: resolutionNote,
          updated_at: now,
        })
        .eq("id", requestId)
      if (up) return NextResponse.json({ error: up.message }, { status: 400 })
      await recordFinancialEvent({
        userId: row.retailer_user_id,
        eventType: "retailer_admin_topup_rejected",
        category: "admin",
        amount: Number(row.amount_requested ?? 0),
        status: "rejected",
        actorType: "admin",
        actorId: user.id,
        transactionRef: row.crypto_tx_reference,
        summary: resolutionNote
          ? `Admin rejected retailer float top-up. Note: ${resolutionNote}`
          : "Admin rejected retailer crypto top-up request.",
        metadata: { requestId, resolutionNote },
      })
      await notifyUserFundingDecision(admin, {
        userId: row.retailer_user_id,
        headline: resolutionNote
          ? `Float top-up rejected: ${resolutionNote.slice(0, 80)}`
          : "Float top-up rejected",
        relatedId: requestId,
      })
      return NextResponse.json({ ok: true })
    }

    const base = Number(row.amount_requested ?? 0)
    const rate = Number(row.commission_rate ?? 0.05)
    const credited = Math.round(base * (1 + Math.max(0, Number.isFinite(rate) ? rate : 0)) * 100) / 100

    let liquiditySource: FloatLiquidityDebitSource
    try {
      liquiditySource = await debitFloatLiquidityOnApproval(admin, credited, user.id)
    } catch (debitErr) {
      const settlement = getTreasurySettlementModeInfo()
      const msg = debitErr instanceof Error ? debitErr.message : "Treasury debit failed."
      return NextResponse.json(
        {
          error: msg,
          treasury: {
            settlement_mode: settlement.settlementMode,
            debit_source: settlement.debitSource,
            remediation: settlement.remediationLine,
            hint:
              "Credit amount would have been base × (1 + commission), debited from treasury Nexus Main in configured modes.",
          },
        },
        { status: 400 },
      )
    }
    try {
      await creditRetailerLiquidityPlusCommission(admin, row.retailer_user_id, base, rate)
    } catch (err) {
      await refundFloatLiquidityDebit(admin, credited, liquiditySource, user.id)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not credit retailer; treasury restored." },
        { status: 400 },
      )
    }
    const { error: up } = await admin
      .from("retailer_admin_topup_requests")
      .update({
        status: "approved",
        amount_credited: credited,
        reviewed_by: user.id,
        reviewed_at: now,
        resolution_note: resolutionNote,
        updated_at: now,
      })
      .eq("id", requestId)
    if (up) return NextResponse.json({ error: up.message }, { status: 400 })

    const poolUid = adminRetailPoolUserId()
    const treasuryNote =
      liquiditySource === "pool"
        ? `Company pool debited ${credited.toFixed(2)} (NEXUS_ADMIN_RETAIL_POOL_USER_ID).`
        : liquiditySource === "approver"
          ? `Approver Nexus Main debited ${credited.toFixed(2)} (NEXUS_FLOAT_DEBIT_USE_APPROVER_WITHOUT_POOL).`
          : "No treasury debit configured — retailer credited without company-side deduction."

    await recordFinancialEvent({
      userId: row.retailer_user_id,
      eventType: "retailer_admin_topup_approved",
      category: "admin",
      amount: credited,
      balanceDestination: "retail_balance",
      status: "approved",
      actorType: "admin",
      actorId: user.id,
      transactionRef: row.crypto_tx_reference,
      summary: `Admin approved retailer crypto top-up. Credited base ${base} + commission (${rate * 100}%) = ${credited}. ${treasuryNote}`,
      metadata: {
        requestId,
        baseRequested: base,
        commissionRate: rate,
        companyLiquidityDebitUsd: liquiditySource === "none" ? 0 : credited,
        companyLiquidityDebitSource: liquiditySource,
        treasuryPoolUserId: poolUid,
      },
    })

    await notifyUserFundingDecision(admin, {
      userId: row.retailer_user_id,
      headline: `Float top-up approved (+$${credited.toFixed(2)} Retail Balance)`,
      relatedId: requestId,
    })

    return NextResponse.json({ ok: true, amountCredited: credited })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}
