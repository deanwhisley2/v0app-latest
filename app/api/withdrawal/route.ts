import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { currencyEngine } from "@/lib/financial/currency-engine"
import { treasury } from "@/lib/financial/treasury-authority"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { getUserFromBearer } from "@/lib/auth-api"
import { appendUserAccountNotification } from "@/lib/server/user-account-notifications"

type WithdrawalRequestBody = {
  amount?: number
  currency?: string
  withdrawalAddress?: string
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const user = auth.user

    const body = (await request.json().catch(() => ({}))) as WithdrawalRequestBody
    const amount = Number(body.amount ?? 0)
    const currency = (body.currency ?? "").trim().toUpperCase()
    const withdrawalAddress = (body.withdrawalAddress ?? "").trim()
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: "Invalid amount" }, { status: 400 })
    }
    if (!currency) {
      return NextResponse.json({ success: false, error: "currency is required" }, { status: 400 })
    }
    if (!withdrawalAddress) {
      return NextResponse.json({ success: false, error: "withdrawalAddress is required" }, { status: 400 })
    }

    const userCurrency = await currencyEngine.getUserCurrency(user.id)
    if (currency !== userCurrency) {
      return NextResponse.json(
        {
          success: false,
          error: `Withdrawal currency mismatch: ${currency} vs registered ${userCurrency}`,
        },
        { status: 400 },
      )
    }

    const userBalance = await treasury.getUserBalance(user.id, "NEXUS_MAIN", currency)
    if (userBalance < amount) {
      return NextResponse.json(
        { success: false, error: `Insufficient balance: ${currency} ${userBalance} < ${currency} ${amount}` },
        { status: 400 },
      )
    }

    const usdAmount = await currencyEngine.toUSD(amount, currency)
    const usdRate = await currencyEngine.getRate(currency, "USD")
    const txRef = `withdrawal_${Date.now()}`
    const debit = await treasury.mutateUserBalance(
      user.id,
      "NEXUS_MAIN",
      currency,
      "DEBIT",
      amount,
      txRef,
      `Withdrawal request to ${withdrawalAddress} (USD ref: ${usdAmount.toFixed(2)})`,
      user.id,
    )
    if (!debit.success) {
      return NextResponse.json({ success: false, error: debit.error }, { status: 500 })
    }

    const admin = createAdminClient()
    const { data: pending, error: pendingErr } = await admin
      .from("pending_requests")
      .insert({
        request_type: "WITHDRAWAL",
        user_id: user.id,
        amount_local: amount,
        currency,
        usd_amount: usdAmount,
        usd_rate: usdRate,
        status: "PENDING_ADMIN",
      })
      .select("id,usd_amount")
      .single()
    if (pendingErr) {
      return NextResponse.json({ success: false, error: pendingErr.message }, { status: 500 })
    }

    if (pending?.id) {
      await appendUserAccountNotification(admin, {
        userId: user.id,
        sourceKind: "pending_withdrawal",
        sourceId: String(pending.id),
        notificationType: "financial",
        title: "Withdrawal request",
        body: `${currency} ${amount.toFixed(2)} submitted — pending admin review. Ref ${txRef}.`,
        nav: { kind: "wallet" },
        metadata: {
          pending_id: pending.id,
          transaction_id: debit.transactionId,
          currency,
          amount_local: amount,
          usd_amount: usdAmount,
        },
      })
    }

    return NextResponse.json({
      success: true,
      pendingId: pending?.id,
      transactionId: debit.transactionId,
      amount,
      currency,
      usdReference: usdAmount,
      message: `${currency} ${amount} deducted. Awaiting admin approval.`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

type WithdrawalApprovalBody = {
  pendingId?: string
  approved?: boolean
}

export async function PUT(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) throw new Error("Unauthorized")
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as WithdrawalApprovalBody
    if (!body.pendingId) {
      return NextResponse.json({ success: false, error: "pendingId required" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: pending, error: pendingErr } = await admin
      .from("pending_requests")
      .select("id,user_id,amount_local,currency,usd_amount,status")
      .eq("id", body.pendingId)
      .maybeSingle()
    if (pendingErr) throw new Error(pendingErr.message)
    if (!pending) return NextResponse.json({ success: false, error: "Pending request not found" }, { status: 404 })

    const amount = Number(pending.amount_local ?? 0)
    const currency = String(pending.currency ?? "UGX").toUpperCase()
    const txRef = String(pending.id ?? crypto.randomUUID())

    if (body.approved !== true) {
      await treasury.mutateUserBalance(
        String(pending.user_id),
        "NEXUS_MAIN",
        currency,
        "CREDIT",
        amount,
        txRef,
        "Withdrawal rejected - rollback",
        actor.id,
      )
      await admin
        .from("pending_requests")
        .update({ status: "REJECTED" })
        .eq("id", body.pendingId)
      await appendUserAccountNotification(admin, {
        userId: String(pending.user_id),
        sourceKind: "pending_withdrawal_resolution",
        sourceId: `${body.pendingId}:rejected`,
        notificationType: "financial",
        title: "Withdrawal update",
        body: `Your ${currency} withdrawal was not approved. ${amount.toFixed(2)} ${currency} has been returned to your Nexus main balance.`,
        nav: { kind: "wallet" },
        metadata: { pending_id: body.pendingId, resolution: "rejected" },
      })
      return NextResponse.json({ success: true, message: "Withdrawal rejected, funds returned." })
    }

    const treasuryResult = await treasury.mutateTreasury(
      "CREDIT",
      Number(pending.usd_amount ?? 0),
      txRef,
      `Withdrawal completed for user ${pending.user_id} (original: ${currency} ${amount})`,
      actor.id,
      "MAIN_TREASURY",
    )
    if (!treasuryResult.success) {
      return NextResponse.json({ success: false, error: treasuryResult.error }, { status: 500 })
    }
    await admin
      .from("pending_requests")
      .update({ status: "COMPLETED" })
      .eq("id", body.pendingId)

    await appendUserAccountNotification(admin, {
      userId: String(pending.user_id),
      sourceKind: "pending_withdrawal_resolution",
      sourceId: `${body.pendingId}:approved`,
      notificationType: "financial",
      title: "Withdrawal completed",
      body: `Your ${currency} withdrawal (${amount.toFixed(2)}) has been completed and sent for settlement.`,
      nav: { kind: "wallet" },
      metadata: { pending_id: body.pendingId, resolution: "approved", treasury_tx: treasuryResult.transactionId },
    })

    return NextResponse.json({
      success: true,
      treasuryNewBalance: treasuryResult.newBalance,
      message: `Withdrawal completed. Treasury received ${currencyEngine.formatForUser(Number(pending.usd_amount ?? 0), "USD")}.`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const status = msg.includes("Unauthorized") || msg.includes("Level 5") ? 403 : 500
    return NextResponse.json({ success: false, error: msg }, { status })
  }
}

