import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { adminRetailPoolUserId, getTreasurySettlementModeInfo } from "@/lib/server/admin-retail-pool"
import { roundFundingAmount } from "@/lib/server/funding-duplicate-guard"

type ProfileLite = {
  id: string
  email?: string | null
  full_name?: string | null
  funding_country_code?: string | null
}

export type OperationsDeskRow = {
  kind: "retailer_float_topup" | "user_add_funds" | "user_withdrawal"
  id: string
  status: string
  /** Primary subject (customer for funding, retailer for top-up). */
  subject_user_id: string
  subject_email: string | null
  subject_name: string | null
  country_code: string | null
  tx_reference: string
  amount: number
  request_type_label: string
  fund_channel: string | null
  mobile_network: string | null
  created_at: string
  reviewed_at?: string | null
  escalated_to_admin?: boolean | null
  pending_ms: number | null
  nexus_main_usd: number | null
  retail_balance_usd: number | null
  retailer_basin_usd: number | null
  retailer_desk_profile_id?: string | null
  retailer_desk_email?: string | null
  duplicate_risk_hint: string | null
  note?: string | null
  payer_display_name?: string | null
  payer_phone?: string | null
  commission_rate?: number | null
  amount_credited?: number | null
  resolution_note?: string | null
  /** Withdrawal recycle / external payout lifecycle (withdrawal_requests.payout_status). */
  payout_status?: string | null
  /** User's frozen withdrawal bucket at desk snapshot (withdrawal_pending_balance). */
  withdrawal_pending_usd?: number | null
}

function msSince(iso: string): number | null {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Date.now() - t)
}

export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)
    const admin = createAdminClient()

    const [topUpsRes, fundingRes, withdrawalRes] = await Promise.all([
      admin
        .from("retailer_admin_topup_requests")
        .select(
          "id,retailer_user_id,amount_requested,crypto_tx_reference,status,commission_rate,amount_credited,created_at,reviewed_at,note,resolution_note,held_at"
        )
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("retailer_fund_requests")
        .select(
          "id,user_id,retailer_id,amount,tx_reference,status,note,fund_channel,mobile_network,created_at,reviewed_at,resolved_at,appeal_note,payer_display_name,payer_phone,escalated_to_admin,resolution_note"
        )
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("withdrawal_requests")
        .select(
          "id,user_id,amount,currency_context,status,transaction_ref,created_at,reviewed_at,resolution_note,payout_status,held_at,metadata"
        )
        .order("created_at", { ascending: false })
        .limit(200),
    ])

    if (topUpsRes.error) return NextResponse.json({ error: topUpsRes.error.message }, { status: 500 })
    if (fundingRes.error) return NextResponse.json({ error: fundingRes.error.message }, { status: 500 })
    if (withdrawalRes.error) return NextResponse.json({ error: withdrawalRes.error.message }, { status: 500 })

    const topRows = topUpsRes.data ?? []
    const fundRows = fundingRes.data ?? []
    const wdRows = withdrawalRes.data ?? []
    const userIds = new Set<string>()
    const retailerIds: string[] = []
    for (const r of topRows) userIds.add((r as { retailer_user_id: string }).retailer_user_id)
    for (const r of fundRows) {
      userIds.add((r as { user_id: string }).user_id)
      retailerIds.push((r as { retailer_id: string }).retailer_id)
    }
    for (const r of wdRows) userIds.add(String((r as { user_id: string }).user_id))

    const retailerProfilesRes = retailerIds.length
      ? await admin
          .from("retailer_profiles")
          .select("id,user_id,credit_basin,country_code")
          .in("id", [...new Set(retailerIds)])
      : { data: [] as Record<string, unknown>[] }
    if ("error" in retailerProfilesRes && retailerProfilesRes.error) {
      return NextResponse.json({ error: retailerProfilesRes.error.message }, { status: 500 })
    }
    const desks = retailerProfilesRes.data ?? []
    for (const d of desks) userIds.add((d as { user_id: string }).user_id)

    const balancesRes = await admin
      .from("user_balances")
      .select("user_id,available_balance,retail_balance,withdrawal_pending_balance")
      .in("user_id", [...userIds])
    const balMap = new Map<string, { m: number; r: number; w: number }>()
    for (const b of balancesRes.data ?? []) {
      const row = b as {
        user_id: string
        available_balance?: unknown
        retail_balance?: unknown
        withdrawal_pending_balance?: unknown
      }
      balMap.set(row.user_id, {
        m: Number(row.available_balance ?? 0),
        r: Number(row.retail_balance ?? 0),
        w: Number(row.withdrawal_pending_balance ?? 0),
      })
    }

    const profilesRes = await admin
      .from("profiles")
      .select("id,email,full_name,funding_country_code")
      .in("id", [...userIds])
    const profMap = new Map<string, ProfileLite>()
    for (const p of profilesRes.data ?? []) {
      const row = p as ProfileLite
      profMap.set(row.id, row)
    }

    const deskByRetailProfileId = new Map<string, (typeof desks)[0]>()
    for (const d of desks) deskByRetailProfileId.set((d as { id: string }).id, d)

    const duplicateTopupRisk = (
      retailerUserId: string,
      amount: number,
      selfId: string,
    ): string | null => {
      const ra = roundFundingAmount(amount)
      const peers = topRows.filter(
        (row) =>
          (row as { id: string }).id !== selfId &&
          (row as { retailer_user_id: string }).retailer_user_id === retailerUserId &&
          ["pending", "under_review"].includes(String((row as { status: string }).status ?? "")),
      )
      const multi = peers.filter(
        (row) =>
          roundFundingAmount(Number((row as { amount_requested?: number }).amount_requested ?? 0)) === ra,
      )
      if (multi.length) return `${multi.length + 1} overlapping float requests share this amount · investigate duplicates.`
      return null
    }

    const duplicateFundingRisk = (
      uid: string,
      amount: number,
      ch: string,
      mob: string,
      selfId: string,
    ): string | null => {
      const ra = roundFundingAmount(amount)
      const peers = fundRows.filter(
        (row) =>
          (row as { id: string }).id !== selfId &&
          (row as { user_id: string }).user_id === uid &&
          ["pending", "under_review", "appealed"].includes(String((row as { status: string }).status ?? "")),
      )
      const multi = peers.filter((row) => {
        const a = roundFundingAmount(Number((row as { amount?: number }).amount ?? 0))
        const c = String((row as { fund_channel?: string }).fund_channel ?? "local_mobile")
        const n = String((row as { mobile_network?: string | null }).mobile_network ?? "").trim()
        return a === ra && c === ch && n === mob
      })
      if (multi.length) return `${multi.length + 1} overlapping customer requests share channel/amount/network.`
      return null
    }

    const mapTopUp = (
      raw: Record<string, unknown>,
      terminal: boolean,
    ): OperationsDeskRow => {
      const id = String(raw.id)
      const retailerUserId = String(raw.retailer_user_id ?? "")
      const amount = Number(raw.amount_requested ?? 0)
      const prof = profMap.get(retailerUserId)
      const bal = balMap.get(retailerUserId)
      const status = String(raw.status ?? "")
      const created_at = String(raw.created_at ?? "")
      return {
        kind: "retailer_float_topup",
        id,
        status,
        subject_user_id: retailerUserId,
        subject_email: prof?.email ?? null,
        subject_name: prof?.full_name ?? null,
        country_code: prof?.funding_country_code ?? null,
        tx_reference: String(raw.crypto_tx_reference ?? ""),
        amount,
        request_type_label: "Retailer float (crypto explorer ref)",
        fund_channel: null,
        mobile_network: null,
        created_at,
        reviewed_at: raw.reviewed_at ? String(raw.reviewed_at) : null,
        escalated_to_admin: null,
        pending_ms: terminal ? null : msSince(created_at),
        nexus_main_usd: bal ? bal.m : null,
        retail_balance_usd: bal ? bal.r : null,
        withdrawal_pending_usd: bal ? bal.w : null,
        retailer_basin_usd: null,
        duplicate_risk_hint: terminal ? null : duplicateTopupRisk(retailerUserId, amount, id),
        note: raw.note ? String(raw.note) : null,
        payer_display_name: null,
        payer_phone: null,
        commission_rate: raw.commission_rate != null ? Number(raw.commission_rate) : null,
        amount_credited: raw.amount_credited != null ? Number(raw.amount_credited) : null,
        resolution_note: raw.resolution_note ? String(raw.resolution_note) : null,
      }
    }

    const mapFunding = (
      raw: Record<string, unknown>,
      terminal: boolean,
    ): OperationsDeskRow => {
      const id = String(raw.id)
      const custId = String(raw.user_id ?? "")
      const retailPid = String(raw.retailer_id ?? "")
      const desk = deskByRetailProfileId.get(retailPid)
      const deskUid = desk ? String((desk as { user_id: string }).user_id) : ""
      const prof = profMap.get(custId)
      const bal = balMap.get(custId)
      const basin = desk ? Number((desk as { credit_basin?: unknown }).credit_basin ?? 0) : null
      const deskProf = deskUid ? profMap.get(deskUid) : undefined
      const amount = Number(raw.amount ?? 0)
      const ch = String(raw.fund_channel ?? "local_mobile")
      const mob = String(raw.mobile_network ?? "").trim()
      const created_at = String(raw.created_at ?? "")
      const status = String(raw.status ?? "")
      return {
        kind: "user_add_funds",
        id,
        status,
        subject_user_id: custId,
        subject_email: prof?.email ?? null,
        subject_name: prof?.full_name ?? null,
        country_code: prof?.funding_country_code ?? null,
        tx_reference: String(raw.tx_reference ?? ""),
        amount,
        request_type_label:
          ch === "local_mobile" ? "Customer add funds (local mobile-money)" : "Customer add funds (legacy admin basin)",
        fund_channel: ch,
        mobile_network: mob || null,
        created_at,
        reviewed_at: raw.reviewed_at ? String(raw.reviewed_at) : null,
        escalated_to_admin: Boolean(raw.escalated_to_admin ?? false),
        pending_ms: terminal ? null : msSince(created_at),
        nexus_main_usd: bal ? bal.m : null,
        retail_balance_usd: bal ? bal.r : null,
        withdrawal_pending_usd: bal ? bal.w : null,
        retailer_basin_usd: basin,
        retailer_desk_profile_id: retailPid || null,
        retailer_desk_email: deskProf?.email ?? null,
        duplicate_risk_hint: terminal ? null : duplicateFundingRisk(custId, amount, ch, mob, id),
        note: raw.note ? String(raw.note) : null,
        payer_display_name: raw.payer_display_name ? String(raw.payer_display_name) : null,
        payer_phone: raw.payer_phone ? String(raw.payer_phone) : null,
        commission_rate: null,
        amount_credited: null,
        resolution_note: raw.resolution_note ? String(raw.resolution_note) : null,
      }
    }

    const mapWithdrawal = (
      raw: Record<string, unknown>,
      terminal: boolean,
    ): OperationsDeskRow => {
      const id = String(raw.id)
      const uid = String(raw.user_id ?? "")
      const prof = profMap.get(uid)
      const bal = balMap.get(uid)
      const amount = Number(raw.amount ?? 0)
      const meta = (raw.metadata as Record<string, unknown>) ?? {}
      const rail = meta.payout_rail != null ? String(meta.payout_rail).trim() : ""
      const dest =
        meta.destination_hint != null
          ? String(meta.destination_hint).trim()
          : meta.destination != null
            ? String(meta.destination).trim()
            : ""
      const networkParts = [rail || null, dest || null].filter(Boolean) as string[]
      const payoutRailLine = networkParts.length ? networkParts.join(" · ") : null
      const cc = String(raw.currency_context ?? "").trim() || null
      const created_at = String(raw.created_at ?? "")
      const status = String(raw.status ?? "")
      const ps = raw.payout_status != null ? String(raw.payout_status) : null
      return {
        kind: "user_withdrawal",
        id,
        status,
        subject_user_id: uid,
        subject_email: prof?.email ?? null,
        subject_name: prof?.full_name ?? null,
        country_code: prof?.funding_country_code ?? null,
        tx_reference: String(raw.transaction_ref ?? ""),
        amount,
        request_type_label: "Withdrawal / cashout (internal recycle → master pool)",
        fund_channel: cc,
        mobile_network: payoutRailLine,
        created_at,
        reviewed_at: raw.reviewed_at ? String(raw.reviewed_at) : null,
        escalated_to_admin: null,
        pending_ms: terminal ? null : msSince(created_at),
        nexus_main_usd: bal ? bal.m : null,
        retail_balance_usd: bal ? bal.r : null,
        withdrawal_pending_usd: bal ? bal.w : null,
        retailer_basin_usd: null,
        retailer_desk_profile_id: null,
        retailer_desk_email: null,
        duplicate_risk_hint: null,
        note: null,
        payer_display_name: null,
        payer_phone: null,
        commission_rate: null,
        amount_credited: null,
        resolution_note: raw.resolution_note ? String(raw.resolution_note) : null,
        payout_status: ps,
      }
    }

    const pendingTopStatuses = ["pending", "under_review"]
    const pendingFundStatuses = ["pending", "under_review", "appealed", "escalated"]
    const terminalTopStatuses = ["approved", "rejected"]
    const terminalFundStatuses = ["approved", "rejected", "resolved"]
    const pendingWdStatuses = ["pending", "under_review"]
    const terminalWdStatuses = ["approved", "rejected"]

    const pending: OperationsDeskRow[] = []
    const history: OperationsDeskRow[] = []

    for (const r of topRows) {
      const st = String((r as { status: string }).status ?? "")
      const row = mapTopUp(r as Record<string, unknown>, !pendingTopStatuses.includes(st))
      if (pendingTopStatuses.includes(st)) pending.push(row)
      else if (terminalTopStatuses.includes(st)) history.push(row)
      else history.push(row)
    }
    for (const r of fundRows) {
      const st = String((r as { status: string }).status ?? "")
      const row = mapFunding(r as Record<string, unknown>, !pendingFundStatuses.includes(st))
      if (pendingFundStatuses.includes(st)) pending.push(row)
      else if (terminalFundStatuses.includes(st)) history.push(row)
      else history.push(row)
    }
    for (const r of wdRows) {
      const st = String((r as { status: string }).status ?? "")
      const row = mapWithdrawal(r as Record<string, unknown>, !pendingWdStatuses.includes(st))
      if (pendingWdStatuses.includes(st)) pending.push(row)
      else if (terminalWdStatuses.includes(st)) history.push(row)
      else history.push(row)
    }

    pending.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

    const poolUid = adminRetailPoolUserId()
    const settlement = getTreasurySettlementModeInfo()
    let poolAvailableUsd: number | null = null
    if (poolUid) {
      const { data: prow } = await admin.from("user_balances").select("available_balance").eq("user_id", poolUid).maybeSingle()
      poolAvailableUsd = prow ? Number(prow.available_balance ?? 0) : 0
    }

    let approvedFloatTopupsTotalUsd = 0
    let pendingFloatTopupCount = 0
    let pendingFloatTopupAmountUsd = 0
    let retailerDeskRetailBalanceTotalUsd = 0
    const { data: statRows, error: statsRpcError } = await admin.rpc("admin_treasury_float_stats")
    if (!statsRpcError && Array.isArray(statRows) && statRows[0]) {
      const row = statRows[0] as Record<string, unknown>
      approvedFloatTopupsTotalUsd = Number(row.approved_float_topups_total_usd ?? 0)
      pendingFloatTopupCount = Number(row.pending_float_topup_count ?? 0)
      pendingFloatTopupAmountUsd = Number(row.pending_float_topup_amount_requested_usd ?? 0)
      retailerDeskRetailBalanceTotalUsd = Number(row.retailer_desk_retail_balance_total_usd ?? 0)
    }

    return NextResponse.json({
      treasury: {
        operational_pool_env_configured: Boolean(poolUid),
        pool_available_usd: poolAvailableUsd,
        settlement_mode: settlement.settlementMode,
        debit_source: settlement.debitSource,
        pool_user_id_masked: settlement.poolUserIdMasked,
        master_liquidity_strict: settlement.masterLiquidityStrict,
        settlement_summary: settlement.summaryLine,
        settlement_remediation: settlement.remediationLine,
        approved_float_topups_total_usd: approvedFloatTopupsTotalUsd,
        pending_float_topup_count: pendingFloatTopupCount,
        pending_float_topup_amount_requested_usd: pendingFloatTopupAmountUsd,
        retailer_desk_retail_balance_total_usd: retailerDeskRetailBalanceTotalUsd,
        stats_available: !statsRpcError,
        stats_error: statsRpcError ? statsRpcError.message : null,
      },
      pending,
      history: history.slice(0, 150),
      generated_at: new Date().toISOString(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}
