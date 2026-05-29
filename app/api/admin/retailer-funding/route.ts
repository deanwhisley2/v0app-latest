import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel, requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { treasury } from "@/lib/financial/treasury-authority"
import { creditCustomerMainFromTreasuryUsd } from "@/lib/server/l5-funding-settlement"
import {
  notifyCustomerFundingDeclined,
  notifyCustomerFundingOperational,
  notifyRetailerOverrideDebit,
} from "@/lib/server/l5-funding-notify"
import {
  buildFundingHeldCustomerCopy,
  buildFundingResolvedCustomerCopy,
  buildFundingStatusHeadline,
} from "@/lib/notifications/customer-notification-language"
import { appendUserAccountNotification } from "@/lib/server/user-account-notifications"
import {
  attachProfileEmailsToRetailers,
  finalizeRetailerLiquidityReservation,
  getUserRetailBalance,
  isFundingFxQuoteExpired,
  settlementUsdFromFundRequestRow,
  transferRetailCreditToCustomer,
} from "@/lib/server/retailer-funding-helpers"
import {
  recordRotationApproval,
  releaseRotationPending,
} from "@/lib/server/retailer-payment-rotation"
import { notifyUserFundingDecision } from "@/lib/server/approval-inbox-notify"
import { customerNotifyForUser } from "@/lib/server/customer-ui-language"
import { finalizeFundingFxOnApproval, getFundingFxSnapshotByRequestId } from "@/lib/server/funding-fx-middleware"
import { auditFundingConversion, persistFundingAudit } from "@/lib/server/funding-math-audit"
import { isAdminDirectFundChannel } from "@/lib/server/admin-payment-config"
import { signedFundingProofUrl } from "@/lib/server/funding-proof-storage"
import { assessFundingApprovalRisk } from "@/lib/server/funding-risk-score"
import { emitTreasuryStreamEvent } from "@/lib/server/treasury-operation-stream"
import { fundingRiskScoreBlockThreshold } from "@/lib/server/treasury-automation-policy"

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
          "id,user_id,retailer_id,amount,amount_usd_locked,tx_reference,status,note,appeal_note,fund_channel,mobile_network,payment_proof_path,created_at,reviewed_at,resolved_at,escalated_to_admin,escalation_at,resolution_note,l5_settlement_mode,l5_override_note,approved_by_admin_for_retailer,retailer_approved_by,retailer_approved_at"
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

    const userIds = [...new Set((requestsRes.data ?? []).map((r) => String((r as { user_id?: string }).user_id ?? "")))]
    const emailByUser = new Map<string, string>()
    if (userIds.length) {
      const { data: profs } = await admin.from("profiles").select("id,email").in("id", userIds)
      for (const p of profs ?? []) {
        const id = String((p as { id?: string }).id ?? "")
        const em = String((p as { email?: string }).email ?? "").trim()
        if (id && em) emailByUser.set(id, em)
      }
    }

    const rows = requestsRes.data ?? []
    const ids = rows.map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean)
    const fxByReq = new Map<string, Record<string, unknown>>()
    if (ids.length) {
      const { data: fxRows, error: fxErr } = await admin
        .from("funding_fx_normalization")
        .select(
          "fund_request_id,routing_lane,amount_input_local,input_currency,local_per_usd,rate_date,rate_source,rate_captured_at,middleware_version,amount_usd_normalized,settled_amount_usd,settled_local_equivalent",
        )
        .in("fund_request_id", ids)
      if (!fxErr && fxRows?.length) {
        for (const f of fxRows) {
          const rid = String((f as { fund_request_id?: string }).fund_request_id ?? "")
          if (rid) fxByReq.set(rid, f as Record<string, unknown>)
        }
      }
    }

    const requests = await Promise.all(
      rows.map(async (row) => {
        const r = row as { id?: string; user_id?: string; payment_proof_path?: string | null }
        const proofPath = String(r.payment_proof_path ?? "").trim()
        const payment_proof_url = proofPath ? await signedFundingProofUrl(admin, proofPath) : null
        const rid = String(r.id ?? "")
        return {
          ...row,
          user_email: emailByUser.get(String(r.user_id ?? "")) ?? null,
          payment_proof_url,
          l5_settlement_usd: settlementUsdFromFundRequestRow(
            row as { amount_usd_locked?: unknown; amount?: unknown; amount_input_local?: unknown },
            fxByReq.get(rid) ?? null,
          ),
          fx_middleware: fxByReq.get(rid) ?? null,
        }
      }),
    )

    return NextResponse.json({ requests, retailers })
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
      .select(
        "id,user_id,retailer_id,official_corridor_route_id,amount,amount_usd_locked,fx_quote_expires_at,tx_reference,status,fund_channel,retailer_approved_at",
      )
      .eq("id", body.requestId)
      .maybeSingle()
    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })
    if (!reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 })

    let fxSnap: Record<string, unknown> | null = null
    try {
      fxSnap = await getFundingFxSnapshotByRequestId(admin, body.requestId)
    } catch {
      fxSnap = null
    }
    const fundRowUsd = reqRow as {
      amount_usd_locked?: unknown
      amount?: unknown
      amount_input_local?: unknown
    }

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

    if (body.action === "approve") {
      const settlementUsdPre = settlementUsdFromFundRequestRow(fundRowUsd, fxSnap)
      const risk = await assessFundingApprovalRisk(admin, {
        requestId: body.requestId,
        retailerId: (reqRow as { retailer_id?: string | null }).retailer_id ?? null,
        txReference: (reqRow as { tx_reference?: string }).tx_reference,
        amountUsdLocked: settlementUsdPre,
        fundChannel,
        adminUserId: user.id,
      })
      const th = fundingRiskScoreBlockThreshold()
      if ((risk.score ?? 0) >= 30) {
        await emitTreasuryStreamEvent(admin, {
          eventType: "risk_flag",
          fundRequestId: body.requestId,
          userId: customerId,
          correlationId: `risk_gate:${body.requestId}:${risk.score}`,
          payload: {
            score: risk.score,
            flags: risk.flags,
            blocking_threshold_configured: th ?? null,
          },
        })
      }
      if (th != null && risk.score >= th) {
        return NextResponse.json(
          {
            error: `Funding blocked by internal risk scoring (score ${risk.score}; minimum safe threshold configured at ${th}). Resolve flags manually or escalate outside auto-approve.`,
            code: "FUNDING_RISK_BLOCKED",
            risk,
          },
          { status: 409 },
        )
      }
    }

    if (body.action === "under_review") {
      await emitTreasuryStreamEvent(admin, {
        eventType: "approval_requested",
        fundRequestId: body.requestId,
        userId: customerId,
        payload: { fundChannel, escalated_via: "l5_manual_hold" },
      })
    }

    const nextStatus =
      body.action === "approve"
        ? "approved"
        : body.action === "reject"
          ? "rejected"
          : body.action === "under_review"
            ? "under_review"
            : "resolved"

    if (isAdminDirectFundChannel(fundChannel)) {
      const settlementUsd = settlementUsdFromFundRequestRow(fundRowUsd, fxSnap)
      const custId = (reqRow as { user_id: string }).user_id

      if (body.action === "approve") {
        const treasuryUsd = await treasury.getTreasuryBalance("MAIN_TREASURY")
        if (treasuryUsd < settlementUsd) {
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
            amountUsd: settlementUsd,
            referenceId: `fund_req:${body.requestId}`,
            adminUserId: user.id,
            reason: `L5 admin direct ${fundChannel} funding approval ${body.requestId}`,
          })
        } catch (err) {
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "Treasury settlement failed." },
            { status: 400 },
          )
        }
      }

      if (body.action === "approve") {
        await finalizeFundingFxOnApproval(admin, {
          fundRequestId: body.requestId!,
          settledAmountUsd: settlementUsd,
          settledByUserId: user.id,
        })
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
          l5_settlement_mode: body.action === "approve" ? "treasury_pool" : null,
          approved_by_admin_for_retailer: false,
        })
        .eq("id", body.requestId)
        .in("status", ["pending", "under_review", "appealed", "escalated"])
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      if (body.action === "approve") {
        const fxLink = await ledgerFxLinkageMetadata(admin, body.requestId!)
        await recordFinancialEvent({
          userId: custId,
          eventType: "funding_request_admin_approved",
          category: "admin",
          amount: settlementUsd,
          balanceSource: "main_treasury_pool",
          balanceDestination: "nexus_main_available",
          status: "approved",
          actorType: "admin",
          actorId: user.id,
          transactionRef: (reqRow as { tx_reference?: string }).tx_reference,
          summary: "Deposit approved and credited (admin treasury settlement).",
          metadata: { requestId: body.requestId, fundChannel, ...fxLink },
        })
        await notifyCustomerFundingOperational(admin, {
          userId: custId,
          requestId: body.requestId!,
          viaTreasury: true,
        })
      } else {
        await recordFinancialEvent({
          userId: custId,
          eventType: `funding_request_admin_${nextStatus}`,
          category: "admin",
          amount: settlementUsd,
          balanceSource: "nexus_main_pending",
          balanceDestination: "nexus_main_pending",
          status: nextStatus === "rejected" ? "rejected" : "pending",
          actorType: "admin",
          actorId: user.id,
          transactionRef: (reqRow as { tx_reference?: string }).tx_reference,
          summary:
            nextStatus === "rejected"
              ? "Funding request rejected."
              : nextStatus === "under_review"
                ? "Funding request held for review."
                : "Funding request updated.",
          metadata: { requestId: body.requestId, fundChannel },
        })
        await notifyFundingStatus(admin, custId, body.requestId!, nextStatus, resolutionNote)
      }

      return NextResponse.json({ ok: true })
    }

    if (fundChannel === "local_mobile") {
      type L5Mode = "treasury_pool" | "retailer_retail_balance"
      let settledApprovalMode: L5Mode | undefined
      let retailerDeskUserId: string | undefined

      const overrideNoteCombined = body.overrideNote?.trim()
        ? body.overrideNote.trim().slice(0, 1200)
        : null

      const settlementUsd = settlementUsdFromFundRequestRow(fundRowUsd, fxSnap)
      const fxRow = reqRow as { fx_quote_expires_at?: string | null }

      if (body.action === "approve") {
        const mathAudit = auditFundingConversion({
          amountInputLocal: Number((reqRow as { amount_input_local?: unknown }).amount_input_local ?? 0) || null,
          inputCurrency: String((reqRow as { input_currency?: string }).input_currency ?? "") || null,
          fxRateSnapshot: Number((reqRow as { fx_rate_snapshot?: unknown }).fx_rate_snapshot ?? 0) || null,
          amountUsdLocked: settlementUsd,
        })
        await persistFundingAudit(admin, {
          fundRequestId: body.requestId,
          userId: customerId,
          retailerId: (reqRow as { retailer_id?: string }).retailer_id ?? null,
          result: mathAudit,
        })
        if (!mathAudit.ok && mathAudit.severity === "critical") {
          return NextResponse.json(
            {
              error: `Funding blocked: ${mathAudit.message} Resolve or reject before crediting.`,
              auditCode: mathAudit.code,
            },
            { status: 422 },
          )
        }
        if (isFundingFxQuoteExpired(fxRow)) {
          return NextResponse.json(
            { error: "This funding quote has expired under policy — reject or resolve so the customer can submit a fresh request." },
            { status: 400 },
          )
        }
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

        const custId = (reqRow as { user_id: string }).user_id

        if (isOfficialOnly) {
          settledApprovalMode = "treasury_pool"
          const treasuryUsd = await treasury.getTreasuryBalance("MAIN_TREASURY")
          if (treasuryUsd < settlementUsd) {
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
              amountUsd: settlementUsd,
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
            if (retail < settlementUsd) {
              return NextResponse.json(
                { error: "Retailer Retail Balance is insufficient for this override approval." },
                { status: 400 },
              )
            }
            try {
              await transferRetailCreditToCustomer(admin, {
                retailerUserId,
                customerUserId: custId,
                amount: settlementUsd,
                requestId: body.requestId,
              })
            } catch (err) {
              return NextResponse.json({ error: err instanceof Error ? err.message : "Transfer failed." }, {
                status: 400,
              })
            }
          } else {
            const treasuryUsd = await treasury.getTreasuryBalance("MAIN_TREASURY")
            if (treasuryUsd < settlementUsd) {
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
                amountUsd: settlementUsd,
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
            try {
              await finalizeRetailerLiquidityReservation(
                admin,
                body.requestId!,
                "released",
                "l5_treasury_pool_settlement",
              )
            } catch (relErr) {
              return NextResponse.json(
                { error: relErr instanceof Error ? relErr.message : "Could not release retailer liquidity reservation." },
                { status: 500 },
              )
            }
          }
        }
      }

      if (
        (body.action === "reject" || body.action === "resolve") &&
        (reqRow as { retailer_id?: string | null }).retailer_id
      ) {
        try {
          await finalizeRetailerLiquidityReservation(
            admin,
            body.requestId!,
            "released",
            body.action === "reject" ? "admin_rejected" : "admin_resolved",
          )
        } catch (relErr) {
          return NextResponse.json(
            { error: relErr instanceof Error ? relErr.message : "Could not release retailer liquidity reservation." },
            { status: 500 },
          )
        }
        try {
          await releaseRotationPending(admin, body.requestId!)
        } catch {
          /* non-fatal */
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
        amount_usd_locked?: number
        tx_reference?: string
      }

      if (body.action === "approve" && settledApprovalMode) {
        const isTreasury = settledApprovalMode === "treasury_pool"
        const classification = isTreasury ? "TREASURY_FUNDED_APPROVAL" : "RETAILER_OVERRIDE_APPROVAL"

        await finalizeFundingFxOnApproval(admin, {
          fundRequestId: body.requestId!,
          settledAmountUsd: settlementUsd,
          settledByUserId: user.id,
        })

        const fxLink = await ledgerFxLinkageMetadata(admin, body.requestId!)
        await recordFinancialEvent({
          userId: custIdSafe(reqRow),
          eventType: `funding_request_admin_${nextStatus}`,
          category: "admin",
          amount: settlementUsd,
          balanceSource: isTreasury ? "main_treasury_pool" : "retail_balance",
          balanceDestination: "nexus_main_available",
          status: "approved",
          actorType: "admin",
          actorId: user.id,
          transactionRef: reqMeta.tx_reference,
          summary: isTreasury
            ? "Deposit approved and credited (company treasury settlement)."
            : "Deposit approved and credited (retailer desk settlement).",
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
            ...fxLink,
          },
        })

        await notifyCustomerFundingOperational(admin, {
          userId: customerId,
          requestId: body.requestId!,
          viaTreasury: isTreasury,
        })
        if (!isTreasury) {
          try {
            await recordRotationApproval(admin, body.requestId!)
          } catch {
            /* non-fatal */
          }
        }
        if (!isTreasury && retailerDeskUserId) {
          await notifyRetailerOverrideDebit(admin, {
            retailerUserId: retailerDeskUserId,
            requestId: body.requestId!,
            amountUsd: settlementUsd,
          })
        }
      } else {
        await recordFinancialEvent({
          userId: custIdSafe(reqRow),
          eventType: `funding_request_admin_${nextStatus}`,
          category: "admin",
          amount: settlementUsd,
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
          summary:
            nextStatus === "rejected"
              ? "Funding request rejected."
              : nextStatus === "under_review"
                ? "Funding request held for review."
                : "Local mobile-money funding request updated.",
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
      const amount = settlementUsdFromFundRequestRow(fundRowUsd, fxSnap)
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

    const legacySettlementUsd = settlementUsdFromFundRequestRow(fundRowUsd, fxSnap)

    if (body.action === "approve") {
      await finalizeFundingFxOnApproval(admin, {
        fundRequestId: body.requestId!,
        settledAmountUsd: legacySettlementUsd,
        settledByUserId: user.id,
      })
      try {
        await recordRotationApproval(admin, body.requestId!)
      } catch {
        /* non-fatal */
      }
    } else if (body.action === "reject" || body.action === "resolve") {
      try {
        await releaseRotationPending(admin, body.requestId!)
      } catch {
        /* non-fatal */
      }
    }

    const fxLedger =
      body.action === "approve" ? await ledgerFxLinkageMetadata(admin, body.requestId!) : {}

    await recordFinancialEvent({
      userId: custIdSafe(reqRow),
      eventType: `funding_request_${nextStatus}`,
      category: "admin",
      amount: legacySettlementUsd,
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
      summary:
        nextStatus === "rejected"
          ? "Funding request rejected."
          : nextStatus === "under_review"
            ? "Funding request held for review."
            : "Retailer funding request updated.",
      metadata: {
        requestId: (reqRow as { id: string }).id,
        retailerId: (reqRow as { retailer_id: string }).retailer_id,
        fundChannel: "legacy_admin",
        ...fxLedger,
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

async function ledgerFxLinkageMetadata(admin: SupabaseClient, requestId: string): Promise<Record<string, unknown>> {
  try {
    const fx = await getFundingFxSnapshotByRequestId(admin, requestId)
    return {
      fundingFxNormalizationId: fx?.id != null ? String(fx.id) : null,
      treasuryDebitReferenceId: `fund_req:${requestId}`,
    }
  } catch {
    return { fundingFxNormalizationId: null, treasuryDebitReferenceId: `fund_req:${requestId}` }
  }
}

async function notifyFundingStatus(
  admin: SupabaseClient,
  customerId: string,
  requestId: string,
  nextStatus: string,
  note: string | null,
): Promise<void> {
  if (nextStatus === "approved") {
    await notifyCustomerFundingOperational(admin, {
      userId: customerId,
      requestId,
      viaTreasury: false,
    })
    return
  }

  if (nextStatus === "rejected") {
    await notifyCustomerFundingDeclined(admin, { userId: customerId, requestId, resolutionNote: note })
  } else if (nextStatus === "under_review") {
    const { t } = await customerNotifyForUser(admin, customerId)
    const held = buildFundingHeldCustomerCopy(note, t)
    await appendUserAccountNotification(admin, {
      userId: customerId,
      sourceKind: "funding_status",
      sourceId: `${requestId}:under_review`,
      notificationType: "financial",
      title: held.title,
      body: held.body,
      nav: { kind: "notifications" },
      metadata: { requestId, ops_audit: { status: "under_review", fund_request_id: requestId } },
    })
  } else if (nextStatus === "resolved") {
    const { t } = await customerNotifyForUser(admin, customerId)
    const resolved = buildFundingResolvedCustomerCopy(t)
    await appendUserAccountNotification(admin, {
      userId: customerId,
      sourceKind: "funding_status",
      sourceId: `${requestId}:resolved`,
      notificationType: "financial",
      title: resolved.title,
      body: resolved.body,
      nav: { kind: "notifications" },
      metadata: { requestId, ops_audit: { status: "resolved", fund_request_id: requestId } },
    })
  } else {
    return
  }

  const { t } = await customerNotifyForUser(admin, customerId)
  const headline = buildFundingStatusHeadline(nextStatus, note, t)
  await notifyUserFundingDecision(admin, { userId: customerId, headline, relatedId: requestId })
}
