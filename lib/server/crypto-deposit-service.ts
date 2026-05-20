import type { SupabaseClient } from "@supabase/supabase-js"
import {
  CRYPTO_MIN_CONFIRMATIONS,
  NEXUS_TRC20_RECEIVE_ADDRESS,
  USDT_TRC20_CONTRACT,
} from "@/lib/server/admin-payment-config"
import {
  assessCryptoDepositAmounts,
  CRYPTO_COMPENSATION_USER_MESSAGE,
  isChainTransferTimely,
} from "@/lib/server/crypto-deposit-policy"
import {
  countRecentCompensationCredits,
  logCryptoDepositSecurityEvent,
} from "@/lib/server/crypto-deposit-security"
import { creditCustomerMainFromTreasuryUsd } from "@/lib/server/l5-funding-settlement"
import { ensureMainTreasuryCanCoverDebit } from "@/lib/server/main-treasury-float"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { appendUserAccountNotification } from "@/lib/server/user-account-notifications"
import { resolveCustomerExperience } from "@/lib/congo-customer-experience"
import { customerNotifyT } from "@/lib/server/customer-ui-language"
import { formatCustomerMoneyForUser } from "@/lib/server/customer-money-copy"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import {
  cryptoCronPausedGlobally,
  treasuryCryptoCronSafeModeEnabled,
} from "@/lib/server/treasury-automation-policy"
import { emitTreasuryStreamEvent } from "@/lib/server/treasury-operation-stream"
import {
  isValidTronTxHash,
  listRecentInboundUsdtTransfers,
  verifyTrc20DepositByTxHash,
} from "@/lib/server/tron-trc20-verify"
import {
  assertFundingPaymentReferenceAvailable,
  DuplicateFundingReferenceError,
  registerFundingPaymentReference,
} from "@/lib/server/funding-reference-guard"

const DEPOSIT_SELECT =
  "id,user_id,user_email,amount_usd,tx_hash,status,on_chain_amount_usdt,confirmations,min_confirmations,failure_reason,created_at,credited_at,credited_principal_usd,compensation_usd,total_credited_usd,chain_block_timestamp_ms,security_flag,auto_approved"

export type CryptoDepositRow = {
  id: string
  user_id: string
  user_email: string
  amount_usd: number
  tx_hash: string
  status: string
  on_chain_amount_usdt: number | null
  confirmations: number
  min_confirmations: number
  failure_reason: string | null
  created_at: string
  credited_at: string | null
  verified_at?: string | null
  credited_principal_usd?: number | null
  compensation_usd?: number | null
  total_credited_usd?: number | null
  chain_block_timestamp_ms?: number | null
  security_flag?: string | null
  auto_approved?: boolean | null
}

async function appendLog(
  admin: SupabaseClient,
  depositId: string,
  event: {
    event_type: string
    actor_type: "system" | "user" | "admin" | "cron"
    actor_id?: string | null
    result_code?: string
    message?: string
    payload?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await admin.from("crypto_deposit_verification_logs").insert({
    deposit_request_id: depositId,
    event_type: event.event_type,
    actor_type: event.actor_type,
    actor_id: event.actor_id ?? null,
    result_code: event.result_code ?? null,
    message: event.message ?? null,
    payload: event.payload ?? null,
  })
  if (error) console.error("[crypto-deposit] log insert failed", error.message)
}

async function resolveSettlementActorId(admin: SupabaseClient): Promise<string> {
  const fromEnv = process.env.NEXUS_CRYPTO_SETTLEMENT_ACTOR_ID?.trim()
  if (fromEnv) return fromEnv
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("trading_user_level", 5)
    .limit(1)
    .maybeSingle()
  if (data?.id) return String(data.id)
  throw new Error("No Level-5 settlement actor configured for crypto auto-credit.")
}

async function findDepositByTxHash(admin: SupabaseClient, txHash: string) {
  const { data } = await admin
    .from("crypto_deposit_requests")
    .select(`${DEPOSIT_SELECT},tx_hash_locked_at`)
    .ilike("tx_hash", txHash)
    .maybeSingle()
  return data as (CryptoDepositRow & { tx_hash_locked_at?: string | null }) | null
}

export async function createCryptoDepositRequest(
  admin: SupabaseClient,
  params: {
    userId: string
    userEmail: string
    amountUsd: number
    txHash: string
  },
): Promise<CryptoDepositRow> {
  const txHash = params.txHash.trim().toLowerCase()
  if (!isValidTronTxHash(txHash)) throw new Error("Invalid TRON transaction hash (64 hex characters).")
  const amountUsd = roundUsd2(params.amountUsd)
  if (!(amountUsd > 0)) throw new Error("Amount must be greater than zero.")

  try {
    await assertFundingPaymentReferenceAvailable(admin, {
      rawReference: txHash,
      userId: params.userId,
    })
  } catch (err) {
    if (err instanceof DuplicateFundingReferenceError) {
      await logCryptoDepositSecurityEvent(admin, {
        userId: params.userId,
        eventKind: "tx_hash_reuse_attempt",
        severity: "critical",
        txHash,
        message: err.customerMessage,
      })
      throw new Error(err.customerMessage)
    }
    throw err
  }

  const existing = await findDepositByTxHash(admin, txHash)
  if (existing) {
    if (existing.user_id === params.userId) {
      return existing as CryptoDepositRow
    }
    await logCryptoDepositSecurityEvent(admin, {
      userId: params.userId,
      depositRequestId: existing.id,
      eventKind: "duplicate_tx_other_user",
      severity: "critical",
      txHash,
      message: "Transaction reference unavailable.",
    })
    throw new Error("Transaction reference unavailable.")
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("crypto_deposit_requests")
    .insert({
      user_id: params.userId,
      user_email: params.userEmail.trim().slice(0, 320),
      amount_usd: amountUsd,
      tx_hash: txHash,
      receive_address: NEXUS_TRC20_RECEIVE_ADDRESS,
      token_contract: USDT_TRC20_CONTRACT,
      status: "verifying",
      min_confirmations: CRYPTO_MIN_CONFIRMATIONS,
      last_checked_at: now,
      updated_at: now,
    })
    .select(DEPOSIT_SELECT)
    .single()
  if (error) {
    if (error.code === "23505") {
      throw new Error("Transaction reference already used.")
    }
    throw new Error(error.message)
  }

  await registerFundingPaymentReference(admin, {
    normalized: txHash,
    userId: params.userId,
    sourceTable: "crypto_deposit_requests",
    sourceId: String(data.id),
    statusSnapshot: "verifying",
  })

  await appendLog(admin, data.id as string, {
    event_type: "deposit_created",
    actor_type: "user",
    actor_id: params.userId,
    result_code: "CREATED",
    message: "User submitted crypto deposit for on-chain verification.",
    payload: { amountUsd, txHash },
  })

  const expPending = await resolveCustomerExperience(admin, params.userId)
  const tPending = customerNotifyT(expPending.language)
  const amtPending = await formatCustomerMoneyForUser(admin, params.userId, amountUsd)
  await appendUserAccountNotification(admin, {
    userId: params.userId,
    sourceKind: "crypto_deposit",
    sourceId: data.id as string,
    notificationType: "crypto_deposit_pending",
    title: tPending("notifications.crypto.depositReceivedTitle"),
    body: tPending("notifications.crypto.depositVerifyingBody").replace("{{amount}}", amtPending),
    metadata: { txHash, amountUsd, status: "verifying", amount_usd: amountUsd },
  })

  return data as CryptoDepositRow
}

async function finalizeCreditedDepositRow(
  admin: SupabaseClient,
  row: CryptoDepositRow,
  assessment: ReturnType<typeof assessCryptoDepositAmounts>,
  actorId: string,
  actorType: "system" | "user" | "admin" | "cron",
  opts?: { forceCredit?: boolean },
): Promise<CryptoDepositRow> {
  const principalUsd = roundUsd2(assessment.principalUsd)
  const compensationUsd = roundUsd2(assessment.compensationUsd)
  const totalUsd = roundUsd2(assessment.totalCreditUsd)
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("crypto_deposit_requests")
    .update({
      status: "credited",
      credited_at: row.credited_at ?? now,
      verified_at: row.verified_at ?? now,
      tx_hash_locked_at: now,
      credited_principal_usd: principalUsd,
      compensation_usd: compensationUsd,
      total_credited_usd: totalUsd,
      on_chain_amount_usdt: principalUsd,
      failure_reason: null,
      auto_approved: !opts?.forceCredit,
      updated_at: now,
    })
    .eq("id", row.id)
    .in("status", [...CREDIT_CLAIM_STATUSES])
    .select(DEPOSIT_SELECT)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data ?? row) as CryptoDepositRow
}

async function creditDepositIfReady(
  admin: SupabaseClient,
  row: CryptoDepositRow,
  assessment: ReturnType<typeof assessCryptoDepositAmounts>,
  actorId: string,
  actorType: "system" | "user" | "admin" | "cron",
  opts?: { forceCredit?: boolean },
): Promise<CryptoDepositRow> {
  if (row.status === "credited") return row

  if (await treasurySettlementStarted(admin, row.id)) {
    const finalized = await finalizeCreditedDepositRow(admin, row, assessment, actorId, actorType, opts)
    if (finalized.status === "credited") return finalized
    return row
  }

  const claimNow = new Date().toISOString()
  const { data: claimed, error: claimErr } = await admin
    .from("crypto_deposit_requests")
    .update({ status: "crediting", last_checked_at: claimNow, updated_at: claimNow })
    .eq("id", row.id)
    .in("status", [...OPEN_DEPOSIT_STATUSES])
    .select(DEPOSIT_SELECT)
    .maybeSingle()
  if (claimErr) throw new Error(claimErr.message)
  if (!claimed) {
    const fresh = await loadDepositRow(admin, row.id)
    if (fresh?.status === "credited") return fresh
    if (fresh && (await treasurySettlementStarted(admin, row.id))) {
      return finalizeCreditedDepositRow(admin, fresh, assessment, actorId, actorType, opts)
    }
    throw new Error("Deposit settlement already in progress. Please wait a moment.")
  }

  const working = claimed as CryptoDepositRow

  const principalUsd = roundUsd2(assessment.principalUsd)
  const compensationUsd = roundUsd2(assessment.compensationUsd)
  const totalUsd = roundUsd2(assessment.totalCreditUsd)

  if (!(principalUsd > 0)) throw new Error("Cannot credit without a positive on-chain amount.")

  const farmingCount = await countRecentCompensationCredits(admin, row.user_id)
  if (compensationUsd > 0 && farmingCount >= 6) {
    await logCryptoDepositSecurityEvent(admin, {
      userId: row.user_id,
      depositRequestId: row.id,
      eventKind: "compensation_farming_suspect",
      severity: "warning",
      txHash: row.tx_hash,
      message: "High compensation frequency in 24h — flagged for review.",
      details: { farmingCount, compensationUsd },
    })
    if (!opts?.forceCredit) {
      const now = new Date().toISOString()
      await admin
        .from("crypto_deposit_requests")
        .update({
          status: "manual_review",
          on_chain_amount_usdt: principalUsd,
          failure_reason: "Compensation frequency limit — admin review required.",
          security_flag: "compensation_farming_suspect",
          last_checked_at: now,
          updated_at: now,
        })
        .eq("id", working.id)
        .eq("status", "crediting")
      throw new Error("Deposit requires admin review (compensation frequency).")
    }
  }

  const actor = await resolveSettlementActorId(admin)

  try {
    await ensureMainTreasuryCanCoverDebit(totalUsd)

    await creditCustomerMainFromTreasuryUsd(admin, {
      customerUserId: working.user_id,
      amountUsd: principalUsd,
      referenceId: `crypto_deposit:principal:${working.id}`,
      adminUserId: actor,
      reason: `USDT TRC20 principal ${working.tx_hash}`,
    })

    if (compensationUsd > 0) {
      await creditCustomerMainFromTreasuryUsd(admin, {
        customerUserId: working.user_id,
        amountUsd: compensationUsd,
        referenceId: `crypto_deposit:comp:${working.id}`,
        adminUserId: actor,
        reason: `USDT TRC20 fee compensation 6.5% ${working.tx_hash}`,
      })
    }
  } catch (e) {
    const revertNow = new Date().toISOString()
    await admin
      .from("crypto_deposit_requests")
      .update({ status: "verified", updated_at: revertNow, last_checked_at: revertNow })
      .eq("id", working.id)
      .eq("status", "crediting")
    throw e
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("crypto_deposit_requests")
    .update({
      status: "credited",
      credited_at: now,
      verified_at: now,
      tx_hash_locked_at: now,
      credited_principal_usd: principalUsd,
      compensation_usd: compensationUsd,
      total_credited_usd: totalUsd,
      on_chain_amount_usdt: principalUsd,
      failure_reason: null,
      auto_approved: !opts?.forceCredit,
      updated_at: now,
    })
    .eq("id", working.id)
    .eq("status", "crediting")
    .select(DEPOSIT_SELECT)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) {
    const fresh = await loadDepositRow(admin, working.id)
    if (fresh?.status === "credited") return fresh
    return working
  }

  await recordFinancialEvent({
    userId: working.user_id,
    eventType: "crypto_deposit_auto_credited",
    category: "funding",
    amount: totalUsd,
    balanceSource: "main_treasury_pool",
    balanceDestination: "nexus_main_available",
    status: "completed",
    actorType: actorType === "admin" ? "admin" : "system",
    actorId,
    transactionRef: working.tx_hash,
    summary: "USDT TRC20 deposit credited (received amount + fee compensation).",
    metadata: {
      depositId: working.id,
      txHash: working.tx_hash,
      principalUsd,
      compensationUsd,
      declaredUsd: working.amount_usd,
    },
  })

  const expCred = await resolveCustomerExperience(admin, working.user_id)
  const tCred = customerNotifyT(expCred.language)
  const amtCred = await formatCustomerMoneyForUser(admin, working.user_id, totalUsd)
  const bodyCred = tCred("notifications.crypto.depositCreditedBody").replace("{{amount}}", amtCred)
  await appendUserAccountNotification(admin, {
    userId: working.user_id,
    sourceKind: "crypto_deposit",
    sourceId: working.id,
    notificationType: "crypto_deposit_credited",
    title: tCred("notifications.crypto.depositCreditedTitle"),
    body: bodyCred,
    metadata: { principalUsd, compensationUsd, totalUsd, amount_usd: totalUsd, txHash: working.tx_hash },
  })

  await appendLog(admin, working.id, {
    event_type: "credited",
    actor_type: actorType,
    actor_id: actorId,
    result_code: "CREDITED",
    message: `Principal ${principalUsd} + compensation ${compensationUsd} = ${totalUsd} USD.`,
    payload: { principalUsd, compensationUsd, totalUsd },
  })

  return data as CryptoDepositRow
}

export async function processCryptoDepositVerification(
  admin: SupabaseClient,
  depositId: string,
  opts?: { actorId?: string; actorType?: "system" | "user" | "admin" | "cron"; forceCredit?: boolean },
): Promise<CryptoDepositRow> {
  const { data: row, error } = await admin
    .from("crypto_deposit_requests")
    .select(DEPOSIT_SELECT)
    .eq("id", depositId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!row) throw new Error("Deposit request not found.")

  const r = row as CryptoDepositRow
  if (r.status === "credited") return r
  if (r.status === "rejected") throw new Error("Deposit was rejected.")

  const actorType = opts?.actorType ?? "system"
  const actorId = opts?.actorId ?? r.user_id
  const now = new Date().toISOString()

  if (r.status === "verified") {
    const received = Number(r.on_chain_amount_usdt ?? 0)
    if (received > 0) {
      const assessment = assessCryptoDepositAmounts(Number(r.amount_usd), received)
      return creditDepositIfReady(admin, r, assessment, actorId, actorType, opts)
    }
  }

  let match = null as Awaited<ReturnType<typeof verifyTrc20DepositByTxHash>>
  try {
    match = await verifyTrc20DepositByTxHash(r.tx_hash)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "TronGrid error"
    await appendLog(admin, r.id, {
      event_type: "verify_error",
      actor_type: actorType,
      actor_id: actorId,
      result_code: "TRONGRID_ERROR",
      message: msg,
    })
    await admin
      .from("crypto_deposit_requests")
      .update({ status: "pending", last_checked_at: now, updated_at: now, failure_reason: msg })
      .eq("id", r.id)
    throw new Error(`Blockchain verification temporarily unavailable: ${msg}`)
  }

  if (!match || !match.success) {
    const reason = !match
      ? "Transaction not found on TRON yet — wait for confirmations and retry."
      : "Transaction failed on-chain."
    await admin
      .from("crypto_deposit_requests")
      .update({
        status: "failed",
        failure_reason: reason,
        last_checked_at: now,
        updated_at: now,
      })
      .eq("id", r.id)
    await appendLog(admin, r.id, {
      event_type: "verify_failed",
      actor_type: actorType,
      actor_id: actorId,
      result_code: "TX_NOT_FOUND",
      message: reason,
    })
    throw new Error(reason)
  }

  const timely = isChainTransferTimely(match.blockTimestampMs, r.created_at)
  if (!timely.ok && !opts?.forceCredit) {
    await logCryptoDepositSecurityEvent(admin, {
      userId: r.user_id,
      depositRequestId: r.id,
      eventKind: "stale_chain_tx",
      severity: "warning",
      txHash: r.tx_hash,
      message: timely.reason,
      details: { chainMs: match.blockTimestampMs, submittedAt: r.created_at },
    })
    await admin
      .from("crypto_deposit_requests")
      .update({
        status: "manual_review",
        on_chain_amount_usdt: match.amountUsdt,
        confirmations: match.confirmations,
        chain_block_timestamp_ms: match.blockTimestampMs,
        failure_reason: timely.reason ?? "Transaction timing review required.",
        last_checked_at: now,
        updated_at: now,
      })
      .eq("id", r.id)
    throw new Error(timely.reason ?? "Transaction timing review required.")
  }

  const assessment = assessCryptoDepositAmounts(Number(r.amount_usd), match.amountUsdt)

  if (!assessment.autoApprove && !opts?.forceCredit) {
    const reason =
      assessment.manualReviewReason ??
      "Deposit requires manual review before credit."
    await logCryptoDepositSecurityEvent(admin, {
      userId: r.user_id,
      depositRequestId: r.id,
      eventKind: "unrealistic_mismatch",
      severity: "warning",
      txHash: r.tx_hash,
      message: reason,
      details: {
        declared: r.amount_usd,
        received: match.amountUsdt,
        assessment,
      },
    })
    await admin
      .from("crypto_deposit_requests")
      .update({
        status: "manual_review",
        on_chain_amount_usdt: match.amountUsdt,
        confirmations: match.confirmations,
        chain_block_timestamp_ms: match.blockTimestampMs,
        failure_reason: reason,
        security_flag: "unrealistic_mismatch",
        last_checked_at: now,
        updated_at: now,
      })
      .eq("id", r.id)
    await appendLog(admin, r.id, {
      event_type: "manual_review",
      actor_type: actorType,
      actor_id: actorId,
      result_code: "MANUAL_REVIEW",
      message: reason,
      payload: { assessment, match },
    })
    throw new Error(reason)
  }

  const minConf = Number(r.min_confirmations ?? CRYPTO_MIN_CONFIRMATIONS)
  const nextStatus = match.confirmations >= minConf ? "verified" : "awaiting_confirmations"

  const { data: updated, error: upErr } = await admin
    .from("crypto_deposit_requests")
    .update({
      status: nextStatus,
      on_chain_amount_usdt: match.amountUsdt,
      confirmations: match.confirmations,
      chain_block_timestamp_ms: match.blockTimestampMs,
      failure_reason: null,
      verified_at: nextStatus === "verified" ? now : null,
      last_checked_at: now,
      updated_at: now,
    })
    .eq("id", r.id)
    .select(DEPOSIT_SELECT)
    .single()
  if (upErr) throw new Error(upErr.message)

  await appendLog(admin, r.id, {
    event_type: "verify_ok",
    actor_type: actorType,
    actor_id: actorId,
    result_code: nextStatus,
    message: `On-chain ${match.amountUsdt} USDT; confirmations=${match.confirmations}/${minConf}.`,
    payload: { match, assessment },
  })

  const out = updated as CryptoDepositRow
  if (nextStatus === "verified" || opts?.forceCredit) {
    return creditDepositIfReady(admin, out, assessment, actorId, actorType, opts)
  }
  return out
}

/** Audit credits in the last N hours (cron summary). */
export async function summarizeRecentCryptoCredits(
  admin: SupabaseClient,
  hours = 5,
): Promise<{ count: number; totalUsd: number; rows: Array<Record<string, unknown>> }> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  const { data } = await admin
    .from("crypto_deposit_requests")
    .select("id,user_email,amount_usd,credited_principal_usd,compensation_usd,total_credited_usd,tx_hash,credited_at")
    .eq("status", "credited")
    .gte("credited_at", since)
    .order("credited_at", { ascending: false })
    .limit(50)
  const rows = data ?? []
  const totalUsd = rows.reduce((s, r) => s + Number(r.total_credited_usd ?? 0), 0)
  return { count: rows.length, totalUsd: roundUsd2(totalUsd), rows }
}

const OPEN_DEPOSIT_STATUSES = [
  "pending",
  "verifying",
  "awaiting_confirmations",
  "verified",
  "manual_review",
] as const

const CREDIT_CLAIM_STATUSES = [...OPEN_DEPOSIT_STATUSES, "crediting"] as const

async function loadDepositRow(admin: SupabaseClient, depositId: string): Promise<CryptoDepositRow | null> {
  const { data, error } = await admin
    .from("crypto_deposit_requests")
    .select(DEPOSIT_SELECT)
    .eq("id", depositId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? (data as CryptoDepositRow) : null
}

async function treasurySettlementStarted(admin: SupabaseClient, depositId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("unified_ledger")
    .select("transaction_id")
    .eq("reference_id", `crypto_deposit:principal:${depositId}`)
    .eq("operation", "DEBIT")
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data)
}

/** Re-run TronGrid verify + credit for one user's open deposits (UI poll / refresh). */
export async function refreshUserCryptoDeposits(
  admin: SupabaseClient,
  userId: string,
): Promise<{ refreshed: number; credited: number; errors: string[] }> {
  const { data: rows, error } = await admin
    .from("crypto_deposit_requests")
    .select("id")
    .eq("user_id", userId)
    .in("status", [...OPEN_DEPOSIT_STATUSES])
    .order("created_at", { ascending: false })
    .limit(10)
  if (error) throw new Error(error.message)

  let refreshed = 0
  let credited = 0
  const errors: string[] = []

  for (const r of rows ?? []) {
    try {
      const res = await processCryptoDepositVerification(admin, String(r.id), {
        actorId: userId,
        actorType: "user",
      })
      refreshed += 1
      if (res.status === "credited") credited += 1
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  return { refreshed, credited, errors }
}

export async function pollOpenCryptoDeposits(admin: SupabaseClient): Promise<{
  processed: number
  credited: number
  errors: string[]
  auditLast5h: { count: number; totalUsd: number }
}> {
  if (cryptoCronPausedGlobally() || treasuryCryptoCronSafeModeEnabled()) {
    await emitTreasuryStreamEvent(admin, {
      eventType: "automation_safe_mode_block",
      payload: {
        surface: "crypto_deposit_cron",
        cron_paused: cryptoCronPausedGlobally(),
        treasury_safe_mode: treasuryCryptoCronSafeModeEnabled(),
      },
    })
    return {
      processed: 0,
      credited: 0,
      errors: [
        cryptoCronPausedGlobally()
          ? "CRYPTO_CRON_PAUSED — verification cron short-circuit (incident stance)."
          : "TREASURY_AUTOMATION_SAFE_MODE — auto USDT verification/credit suppressed.",
      ],
      auditLast5h: { count: 0, totalUsd: 0 },
    }
  }

  const { data: rows, error } = await admin
    .from("crypto_deposit_requests")
    .select("id")
    .in("status", [...OPEN_DEPOSIT_STATUSES])
    .order("created_at", { ascending: true })
    .limit(40)
  if (error) throw new Error(error.message)

  let processed = 0
  let credited = 0
  const errors: string[] = []

  for (const r of rows ?? []) {
    try {
      const res = await processCryptoDepositVerification(admin, String(r.id), {
        actorType: "cron",
      })
      processed += 1
      if (res.status === "credited") credited += 1
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  const recent = await listRecentInboundUsdtTransfers(NEXUS_TRC20_RECEIVE_ADDRESS, USDT_TRC20_CONTRACT, 12)
  for (const t of recent) {
    const linked = await findDepositByTxHash(admin, t.txHash)
    if (linked?.id && linked.status !== "credited" && linked.status !== "rejected") {
      try {
        const res = await processCryptoDepositVerification(admin, String(linked.id), {
          actorType: "cron",
        })
        processed += 1
        if (res.status === "credited") credited += 1
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
  }

  const auditLast5h = await summarizeRecentCryptoCredits(admin, 5)
  return { processed, credited, errors, auditLast5h }
}

export async function adminOverrideCryptoDeposit(
  admin: SupabaseClient,
  params: {
    depositId: string
    adminUserId: string
    action: "approve" | "reject" | "retry"
    note?: string
  },
): Promise<CryptoDepositRow> {
  if (params.action === "reject") {
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from("crypto_deposit_requests")
      .update({
        status: "rejected",
        failure_reason: params.note?.trim() || "Rejected by admin.",
        updated_at: now,
      })
      .eq("id", params.depositId)
      .select(DEPOSIT_SELECT)
      .single()
    if (error) throw new Error(error.message)
    await appendLog(admin, params.depositId, {
      event_type: "admin_rejected",
      actor_type: "admin",
      actor_id: params.adminUserId,
      result_code: "REJECTED",
      message: params.note || undefined,
    })
    return data as CryptoDepositRow
  }

  if (params.action === "retry") {
    return processCryptoDepositVerification(admin, params.depositId, {
      actorId: params.adminUserId,
      actorType: "admin",
    })
  }

  return processCryptoDepositVerification(admin, params.depositId, {
    actorId: params.adminUserId,
    actorType: "admin",
    forceCredit: true,
  })
}

export async function listCryptoDepositSecurityEvents(
  admin: SupabaseClient,
  limit = 100,
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await admin
    .from("crypto_deposit_security_events")
    .select("id,user_id,deposit_request_id,event_kind,severity,tx_hash,message,details,created_at")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}
