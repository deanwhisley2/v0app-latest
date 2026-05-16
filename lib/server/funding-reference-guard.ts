import type { SupabaseClient } from "@supabase/supabase-js"
import {
  fundingReferenceKind,
  isFundingReferenceFormatValid,
  normalizeFundingPaymentReference,
} from "@/lib/server/funding-reference-normalize"

/** Customer-facing — no ledger/treasury wording. */
export const FUNDING_REFERENCE_ALREADY_USED_MESSAGE = "Transaction reference already used."
export const FUNDING_REFERENCE_UNAVAILABLE_MESSAGE = "Transaction reference unavailable."
export const FUNDING_REFERENCE_INVALID_MESSAGE = "Transaction reference invalid."

export class DuplicateFundingReferenceError extends Error {
  readonly code = "DUPLICATE_FUNDING_REFERENCE" as const
  readonly customerMessage: string
  readonly httpStatus = 409 as const

  constructor(customerMessage: string) {
    super(customerMessage)
    this.name = "DuplicateFundingReferenceError"
    this.customerMessage = customerMessage
  }
}

export type FundingReferenceRegistryRow = {
  reference_normalized: string
  source_table: string
  source_id: string
  user_id: string
  status_snapshot: string
  created_at: string
}

export type FundingReferenceLookup = {
  normalized: string
  registry: FundingReferenceRegistryRow | null
  legacySource: string | null
}

async function loadRegistryRow(
  admin: SupabaseClient,
  normalized: string,
): Promise<FundingReferenceRegistryRow | null> {
  const { data, error } = await admin
    .from("funding_payment_reference_registry")
    .select("reference_normalized,source_table,source_id,user_id,status_snapshot,created_at")
    .eq("reference_normalized", normalized)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as FundingReferenceRegistryRow | null
}

/** Rows indexed by normalized column (defense in depth if registry row missing). */
async function findLegacyReferenceOwner(
  admin: SupabaseClient,
  normalized: string,
): Promise<{ source: string; userId: string; id: string } | null> {
  const { data: fund } = await admin
    .from("retailer_fund_requests")
    .select("id,user_id")
    .eq("tx_reference_normalized", normalized)
    .limit(1)
    .maybeSingle()
  if (fund?.id) {
    return {
      source: "retailer_fund_requests",
      userId: String(fund.user_id),
      id: String(fund.id),
    }
  }

  const { data: crypto } = await admin
    .from("crypto_deposit_requests")
    .select("id,user_id")
    .eq("tx_hash", normalized)
    .limit(1)
    .maybeSingle()
  if (crypto?.id) {
    return {
      source: "crypto_deposit_requests",
      userId: String(crypto.user_id),
      id: String(crypto.id),
    }
  }

  const { data: topup } = await admin
    .from("retailer_admin_topup_requests")
    .select("id,retailer_user_id")
    .eq("crypto_tx_reference_normalized", normalized)
    .limit(1)
    .maybeSingle()
  if (topup?.id) {
    return {
      source: "retailer_admin_topup_requests",
      userId: String(topup.retailer_user_id),
      id: String(topup.id),
    }
  }

  return null
}

export async function lookupFundingPaymentReference(
  admin: SupabaseClient,
  rawReference: string,
): Promise<FundingReferenceLookup> {
  const normalized = normalizeFundingPaymentReference(rawReference) ?? ""
  const registry = normalized ? await loadRegistryRow(admin, normalized) : null
  if (registry) {
    return { normalized, registry, legacySource: null }
  }
  const legacy = normalized ? await findLegacyReferenceOwner(admin, normalized) : null
  return {
    normalized,
    registry: null,
    legacySource: legacy?.source ?? null,
  }
}

export async function assertFundingPaymentReferenceAvailable(
  admin: SupabaseClient,
  params: {
    rawReference: string
    userId: string
    /** When re-submitting same user's in-flight row, allow same source id */
    allowSameSource?: { sourceTable: string; sourceId: string }
  },
): Promise<string> {
  const normalized = normalizeFundingPaymentReference(params.rawReference)
  if (!isFundingReferenceFormatValid(normalized)) {
    throw new DuplicateFundingReferenceError(FUNDING_REFERENCE_INVALID_MESSAGE)
  }

  const lookup = await lookupFundingPaymentReference(admin, params.rawReference)
  let ownerUserId: string | null = null
  let sourceTable: string | null = null
  let sourceId: string | null = null

  if (lookup.registry) {
    ownerUserId = lookup.registry.user_id
    sourceTable = lookup.registry.source_table
    sourceId = lookup.registry.source_id
  } else {
    const legacy = await findLegacyReferenceOwner(admin, normalized!)
    if (legacy) {
      ownerUserId = legacy.userId
      sourceTable = legacy.source
      sourceId = legacy.id
    }
  }

  if (!ownerUserId || !sourceTable || !sourceId) return normalized!

  const allow = params.allowSameSource
  if (allow && allow.sourceTable === sourceTable && allow.sourceId === sourceId) {
    return normalized!
  }

  await logFundingReferenceReuseAttempt(admin, {
    userId: params.userId,
    normalized: normalized!,
    priorUserId: ownerUserId,
    priorSourceTable: sourceTable,
    priorSourceId: sourceId,
  })

  if (ownerUserId === params.userId) {
    throw new DuplicateFundingReferenceError(FUNDING_REFERENCE_ALREADY_USED_MESSAGE)
  }
  throw new DuplicateFundingReferenceError(FUNDING_REFERENCE_UNAVAILABLE_MESSAGE)
}

export async function registerFundingPaymentReference(
  admin: SupabaseClient,
  params: {
    normalized: string
    userId: string
    sourceTable: "retailer_fund_requests" | "crypto_deposit_requests" | "retailer_admin_topup_requests"
    sourceId: string
    statusSnapshot: string
  },
): Promise<void> {
  const { error } = await admin.from("funding_payment_reference_registry").insert({
    reference_normalized: params.normalized,
    reference_kind: fundingReferenceKind(params.normalized),
    source_table: params.sourceTable,
    source_id: params.sourceId,
    user_id: params.userId,
    status_snapshot: params.statusSnapshot.slice(0, 32),
  })
  if (error) {
    if (error.code === "23505") {
      throw new DuplicateFundingReferenceError(FUNDING_REFERENCE_ALREADY_USED_MESSAGE)
    }
    throw new Error(error.message)
  }
}

const REUSE_BURST_WINDOW_MS = 60 * 60 * 1000
const REUSE_BURST_LIMIT = 5

async function logFundingReferenceReuseAttempt(
  admin: SupabaseClient,
  params: {
    userId: string
    normalized: string
    priorUserId: string
    priorSourceTable: string
    priorSourceId: string
  },
): Promise<void> {
  const since = new Date(Date.now() - REUSE_BURST_WINDOW_MS).toISOString()
  const { count } = await admin
    .from("funding_reference_security_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .eq("event_kind", "reuse_attempt")
    .gte("created_at", since)

  const attemptCount = (count ?? 0) + 1
  const severity = attemptCount >= REUSE_BURST_LIMIT ? "high" : "medium"

  await admin.from("funding_reference_security_events").insert({
    user_id: params.userId,
    reference_normalized: params.normalized,
    event_kind: "reuse_attempt",
    severity,
    attempt_count: attemptCount,
    prior_user_id: params.priorUserId,
    prior_source_table: params.priorSourceTable,
    prior_source_id: params.priorSourceId,
    details: {
      prior_user_id: params.priorUserId,
      prior_source_table: params.priorSourceTable,
      prior_source_id: params.priorSourceId,
    },
  })
}

export async function isFundingReferenceCooldownActive(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - REUSE_BURST_WINDOW_MS).toISOString()
  const { count, error } = await admin
    .from("funding_reference_security_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_kind", "reuse_attempt")
    .gte("created_at", since)
  if (error) return false
  return (count ?? 0) >= REUSE_BURST_LIMIT
}
