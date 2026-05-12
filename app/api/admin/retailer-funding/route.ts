import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel, requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { treasury } from "@/lib/financial/treasury-authority"
import { creditCustomerMainFromTreasuryUsd } from "@/lib/server/l5-funding-settlement"
import { notifyCustomerFundingOperational, notifyRetailerOverrideDebit } from "@/lib/server/l5-funding-notify"
import {
  attachProfileEmailsToRetailers,
  getUserRetailBalance,
  transferRetailCreditToCustomer,
} from "@/lib/server/retailer-funding-helpers"
import { notifyUserFundingDecision } from "@/lib/server/approval-inbox-notify"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(user)
    const admin = createAdminClient()
    const [requestsRes, retailersRes] = await Promise.all([
      admin
        .from("retailer_fund_requests")
        .select(
          "id,user_id,retailer_id,amount,tx_reference,status,note,appeal_note,fund_channel,mobile_network,created_at,reviewed_at,resolved_at,escalated_to_admin,escalation_at,resolution_note,l5_settlement_mode,l5_override_note,approved_by_admin_for_retailer,retailer_approved_by,retailer_approved_at"
        )
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("retailer_profiles")
        .select(
          "id,user_id,credit_basin,payment_numbers,under_review,under_review_reason,country_code,is_country_retailer,liquidity_status,updated_at"
        )
        .order("updated_at", { ascending: false })
        .limit(100),
    ])
    if (requestsRes.error) return NextResponse.json({ error: requestsRes.error.message }, { status: 500 })
    if (retailersRes.error) return NextResponse.json({ error: retailersRes.error.message }, { status: 500 })
    const retailers = await attachProfileEmailsToRetailers(admin, retailersRes.data ?? [])
    return NextResponse.json({ requests: requestsRes.data ?? [], retailers })
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
      action?: "approve" | "reject" | "under_review" | "resolve" | "retailer_under_review"
      requestId?: string
      retailerId?: string
      reason?: string
      approvalMode?: "treasury_pool" | "retailer_retail_balance"
      overrideNote?: string
    }
    const admin = createAdminClient()
    const now = new Date().toISOString()
    const resolutionNote = body.reason?.trim() ? body.reason.trim().slice(0, 1200) : null

    if (body.action === "retailer_under_review") {
      if (!body.retailerId) return NextResponse.json({ error: "retailerId is required" }, { status: 400 })
      const { error } = await admin
        .from("retailer_profiles")
        .update({
          under_review: true,
          under_review_reason: body.reason?.trim() || "Marked under review by admin.",
          updated_at: now,
        })
        .eq("id", body.retailerId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (!body.requestId || !body.action) {
      return NextResponse.json({ error: "requestId and action are required" }, { status: 400 })
    }

    const { data: reqRow, error: reqErr } = await admin
      .from("retailer_fund_requests")
      .select("id,user_id,retailer_id,official_corridor_route_id,amount,tx_reference,status,fund_channel,retailer_approved_at")
      .eq("id", body.requestId)
      .maybeSingle()
    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })
    if (!reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 })

    const customerId = (reqRow as { user_id: string }).user_id
    if (body.action === "approve" || body.action === "resolve") {
      const buyerLvl = await getTradingUserLevel(customerId)
      if (buyerLvl === 5) {
        return NextResponse.json(
          {
            error:
              "Liquidity admins (level 5) cannot be funded via retailer workflows; deny or escalate outside this ledger.",
          },
          { status: 403 }
        )
      }
    }

    const fundChannel = String((reqRow as { fund_channel?: string }).fund_channel ?? "legacy_admin")

    const nextStatus =
      body.action === "approve"
        ? "approved"
        : body.action === "reject"
          ? "rejected"
          : body.action === "under_review"
            ? "under_review"
            : "resolved"

    if (fundChannel === "local_mobile") {
      type L5Mode = "treasury_pool" | "retailer_retail_balance"
      let settledApprovalMode: L5Mode | undefined
      let retailerDeskUserId: string | undefined

      const overrideNoteCombined = body.overrideNote?.trim()
        ? body.overrideNote.trim().slice(0, 1200)
        : null

      if (body.action === "approve") {
        if ((reqRow as { retailer_approved_at?: string }).retailer_approved_at) {
          return NextResponse.json({ error: "Already processed by retailer." }, { status: 400 })
        }

        const approvalMode = body.approvalMode
        if (!approvalMode || (approvalMode !== "treasury_pool" && approvalMode !== "retailer_retail_balance")) {
          return NextResponse.json(
            {
              error:
                "approvalMode is required: treasury_pool (company treasury) or retailer_retail_balance (admin acts for retailer desk).",
            },
            { status: 400 },
          )
        }

        const officialRouteFk = (reqRow as { official_corridor_route_id?: string | null }).official_corridor_route_id
        const retailerPid = (reqRow as { retailer_id?: string | null }).retailer_id
        const isOfficialOnly = Boolean(officialRouteFk && !retailerPid)

        if (isOfficialOnly && approvalMode !== "treasury_pool") {
          return NextResponse.json(
            {
              error:
                "Official company corridor funding settles from MAIN_TREASURY only — choose treasury_pool (not retailer liquidity).",
            },
            { status: 400 },
          )
        }

        settledApprovalMode = approvalMode

        const amount = Number((reqRow as { amount?: number }).amount ?? 0)
        const custId = (reqRow as { user_id: string }).user_id

        if (isOfficialOnly) {
          settledApprovalMode = "treasury_pool"
          const treasuryUsd = await treasury.getTreasuryBalance("MAIN_TREASURY")
          if (treasuryUsd < amount) {
            return NextResponse.json(
              {
                error: `Insufficient company treasury liquidity (available $${treasuryUsd.toFixed(2)} USD-equivalent).`,
              },
              { status: 400 },
            )
          }
          try {
            await creditCustomerMainFromTreasuryUsd(admin, {
              customerUserId: custId,
              amountUsd: amount,
              referenceId: `fund_req:${body.requestId}`,
              adminUserId: user.id,
              reason: `L5 treasury settle official corridor funding ${body.requestId}`,
            })
          } catch (err) {
            return NextResponse.json(
              { error: err instanceof Error ? err.message : "Treasury settlement failed." },
              { status: 400 },
            )
          }
        } else {
          if (!retailerPid) {
            return NextResponse.json({ error: "Retailer desk missing on this request." }, { status: 400 })
          }

          const { data: rp } = await admin
            .from("retailer_profiles")
            .select("user_id")
            .eq("id", retailerPid)
            .maybeSingle()
          const retailerUserId = rp?.user_id as string | undefined
          retailerDeskUserId = retailerUserId
          if (!retailerUserId) return NextResponse.json({ error: "Retailer desk missing." }, { status: 400 })

          if (approvalMode === "retailer_retail_balance") {
            const retail = await getUserRetailBalance(admin, retailerUserId)
            if (retail < amount) {
              return NextResponse.json(
                { error: "Retailer Retail Balance is insufficient for this override approval." },
                { status: 400 },
              )
            }
            try {
              await transferRetailCreditToCustomer(admin, {
                retailerUserId,
                customerUserId: custId,
                amount,
                requestId: body.requestId,
              })
            } catch (err) {
              return NextResponse.json({ error: err instanceof Error ? err.message : "Transfer failed." }, {
                status: 400,
              })
            }
          } else {
            const treasuryUsd = await treasury.getTreasuryBalance("MAIN_TREASURY")
            if (treasuryUsd < amount) {
              return NextResponse.json(
                {
                  error: `Insufficient company treasury liquidity (available $${treasuryUsd.toFixed(2)} USD-equivalent).`,
                },
                { status: 400 },
              )
            }
            try {
              await creditCustomerMainFromTreasuryUsd(admin, {
                customerUserId: custId,
                amountUsd: amount,
                referenceId: `fund_req:${body.requestId}`,
                adminUserId: user.id,
                reason: `L5 treasury-funded add-funds approval ${body.requestId}`,
              })
            } catch (err) {
              return NextResponse.json(
                { error: err instanceof Error ? err.message : "Treasury settlement failed." },
                { status: 400 },
              )
            }
          }
        }
      }

      const localPatch: Record<string, unknown> = {
        status: nextStatus,
        reviewed_by: user.id,
        reviewed_at: now,
        resolved_by: body.action === "resolve" ? user.id : null,
        resolved_at: body.action === "resolve" ? now : null,
        updated_at: now,
        resolution_note: resolutionNote,
      }

      if (body.action === "approve" && settledApprovalMode) {
        localPatch.l5_settlement_mode = settledApprovalMode
        localPatch.l5_override_note = overrideNoteCombined ?? resolutionNote
        localPatch.approved_by_admin_for_retailer = settledApprovalMode === "retailer_retail_balance"
        if (settledApprovalMode === "retailer_retail_balance") {
          localPatch.retailer_approved_by = user.id
          localPatch.retailer_approved_at = now
        } else {
          localPatch.retailer_approved_by = null
          localPatch.retailer_approved_at = null
        }
      }

      let statusQuery = admin.from("retailer_fund_requests").update(localPatch)
      statusQuery = statusQuery.eq("id", body.requestId)
      if (
        body.action === "approve" ||
        body.action === "reject" ||
        body.action === "resolve" ||
        body.action === "under_review"
      ) {
        statusQuery = statusQuery.in("status", ["pending", "under_review", "appealed", "escalated"])
      }
      const { error: updateErr } = await statusQuery
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      const reqMeta = reqRow as {
        id: string
        retailer_id: string
        amount?: number
        tx_reference?: string
      }

      if (body.action === "approve" && settledApprovalMode) {
        const isTreasury = settledApprovalMode === "treasury_pool"
        const classification = isTreasury ? "TREASURY_FUNDED_APPROVAL" : "RETAILER_OVERRIDE_APPROVAL"
        await recordFinancialEvent({
          userId: custIdSafe(reqRow),
          eventType: `funding_request_admin_${nextStatus}`,
          category: "admin",
          amount: Number(reqMeta.amount ?? 0),
          balanceSource: isTreasury ? "main_treasury_pool" : "retail_balance",
          balanceDestination: "nexus_main_available",
          status: "approved",
          actorType: "admin",
          actorId: user.id,
          transactionRef: reqMeta.tx_reference,
          summary: isTreasury
            ? "L5 approved add-funds using company treasury (MAIN_TREASURY debited; customer Nexus Main credited)."
            : "L5 approved add-funds on behalf of retailer desk (Retail Balance debited; customer Nexus Main credited).",
          metadata: {
            requestId: reqMeta.id,
            retailerId: reqMeta.retailer_id,
            fundChannel,
            approvalClassification: classification,
            approvalMode: settledApprovalMode,
            transactionCategory: "add_funds_settlement",
            l5ActingAdminId: user.id,
            debitedAccount: isTreasury ? "MAIN_TREASURY" : "retailer_retail_balance",
            creditedAccount: "customer_nexus_main_available",
            fundingSource: isTreasury ? "company_treasury_pool" : "retailer_retail_balance",
            actingAuthority: "level_5_admin",
          },
        })

        await notifyCustomerFundingOperational(admin, {
          userId: customerId,
          requestId: body.requestId!,
          viaTreasury: isTreasury,
        })
        if (!isTreasury && retailerDeskUserId) {
          await notifyRetailerOverrideDebit(admin, {
            retailerUserId: retailerDeskUserId,
            requestId: body.requestId!,
            amountUsd: Number(reqMeta.amount ?? 0),
          })
        }
      } else {
        await recordFinancialEvent({
          userId: custIdSafe(reqRow),
          eventType: `funding_request_admin_${nextStatus}`,
          category: "admin",
          amount: Number((reqRow as { amount?: number }).amount ?? 0),
          balanceSource: nextStatus === "approved" ? "retail_balance" : "nexus_main_pending",
          balanceDestination: nextStatus === "approved" ? "nexus_main_available" : "nexus_main_pending",
          status:
            nextStatus === "rejected"
              ? "rejected"
              : nextStatus === "under_review"
                ? "pending"
                : "approved",
          actorType: "admin",
          actorId: user.id,
          transactionRef: (reqRow as { tx_reference?: string }).tx_reference,
          summary: `Admin ${nextStatus} local mobile-money funding request (override / dispute desk).`,
          metadata: {
            requestId: (reqRow as { id: string }).id,
            retailerId: (reqRow as { retailer_id: string }).retailer_id,
            fundChannel,
          },
        })

        await notifyFundingStatus(admin, customerId, body.requestId, nextStatus, resolutionNote)
      }

      return NextResponse.json({ ok: true })
    }

    const { error: updateErr } = await admin
      .from("retailer_fund_requests")
      .update({
        status: nextStatus,
        reviewed_by: user.id,
        reviewed_at: now,
        resolved_by: body.action === "resolve" ? user.id : null,
        resolved_at: body.action === "resolve" ? now : null,
        updated_at: now,
        resolution_note: resolutionNote,
      })
      .eq("id", body.requestId)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    if (body.action === "approve" || body.action === "resolve") {
      const { data: retailer, error: retErr } = await admin
        .from("retailer_profiles")
        .select("credit_basin,under_review")
        .eq("id", (reqRow as { retailer_id: string }).retailer_id)
        .maybeSingle()
      if (retErr) return NextResponse.json({ error: retErr.message }, { status: 500 })
      const currentBasin = Number(retailer?.credit_basin ?? 0)
      const amount = Number((reqRow as { amount?: number }).amount ?? 0)
      if (currentBasin < amount) {
        await admin
          .from("retailer_profiles")
          .update({
            under_review: true,
            under_review_reason: "Retailer basin insufficient for pending request.",
            updated_at: now,
          })
          .eq("id", (reqRow as { retailer_id: string }).retailer_id)
      } else {
        await admin
          .from("retailer_profiles")
          .update({
            credit_basin: currentBasin - amount,
            under_review: false,
            under_review_reason: null,
            updated_at: now,
          })
          .eq("id", (reqRow as { retailer_id: string }).retailer_id)
      }
    }

    await recordFinancialEvent({
      userId: custIdSafe(reqRow),
      eventType: `funding_request_${nextStatus}`,
      category: "admin",
      amount: Number((reqRow as { amount?: number }).amount ?? 0),
      balanceSource: nextStatus === "approved" ? "retailer_basin" : "nexus_main_pending",
      balanceDestination: nextStatus === "approved" ? "available_balance" : "nexus_main_pending",
      status:
        nextStatus === "rejected"
          ? "rejected"
          : nextStatus === "under_review"
            ? "pending"
            : "approved",
      actorType: "admin",
      actorId: user.id,
      transactionRef: (reqRow as { tx_reference?: string }).tx_reference,
      summary: `Admin ${nextStatus} retailer funding request (legacy basin workflow).`,
      metadata: {
        requestId: (reqRow as { id: string }).id,
        retailerId: (reqRow as { retailer_id: string }).retailer_id,
        fundChannel: "legacy_admin",
      },
    })

    await notifyFundingStatus(admin, customerId, body.requestId, nextStatus, resolutionNote)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}

function custIdSafe(reqRow: unknown): string {
  return String((reqRow as { user_id?: string }).user_id ?? "")
}

async function notifyFundingStatus(
  admin: SupabaseClient,
  customerId: string,
  requestId: string,
  nextStatus: string,
  note: string | null,
): Promise<void> {
  let headline = ""
  if (nextStatus === "approved") headline = "Add-funds request approved — balance updated."
  else if (nextStatus === "rejected") headline = note ? `Add-funds rejected: ${note.slice(0, 80)}` : "Add-funds request rejected."
  else if (nextStatus === "under_review") headline = note ? `Add-funds held: ${note.slice(0, 80)}` : "Add-funds request held for operations review."
  else if (nextStatus === "resolved") headline = "Add-funds request resolved."
  else return
  await notifyUserFundingDecision(admin, { userId: customerId, headline, relatedId: requestId })
}
