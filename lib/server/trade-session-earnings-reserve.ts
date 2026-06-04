import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { buildExactSumBuckets, stringSeed } from "@/lib/server/target-driven-accrual"

/** Policy constants — internal only; never expose in customer UI. */
export const TRADE_SESSION_MONTHLY_TARGET_PCT = 28
export const TRADE_SESSION_MONTHLY_TARGET_PCT_MIN = 27
export const TRADE_SESSION_MONTHLY_TARGET_PCT_MAX = 30
export const TRADE_SESSION_PLATFORM_FEE_RATE = 0.03
export const TRADE_SESSION_POLICY_DAYS = 30

const RECONCILE_EPSILON_USD = 0.02

/** Minimum visible settlement for active-session late joins (debited from reserve only). */
export const TRADE_SESSION_MIN_VISIBLE_SETTLEMENT_USD = 0.01
export const TRADE_SESSION_RESERVE_SOURCE = "monthly_reserve_v1"

export type SessionParticipationPayout = {
  payoutUsd: number
  allocatedUsd: number
  minFloorApplied: boolean
}

export type ReserveDaySchedule = {
  dailyUsd: number
  morningUsd: number
  eveningUsd: number
}

export type ReserveSchedulePayload = {
  v: 1
  days: ReserveDaySchedule[]
}

export type UserTradeSessionReserveRow = {
  id: string
  user_id: string
  period_key: string
  capital_usd: number
  monthly_target_pct: number
  gross_monthly_usd: number
  platform_fee_usd: number
  net_reserve_usd: number
  earned_usd: number
  forfeited_usd: number
  remaining_reserve_usd: number
  schedule: ReserveSchedulePayload
  seed_key: string
}

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function resolveTradeSessionMonthlyTargetPct(seedKey: string): number {
  const rnd = mulberry32(stringSeed(`trade-session-pct|${seedKey}`))
  const pct =
    TRADE_SESSION_MONTHLY_TARGET_PCT_MIN +
    rnd() * (TRADE_SESSION_MONTHLY_TARGET_PCT_MAX - TRADE_SESSION_MONTHLY_TARGET_PCT_MIN)
  return Math.round(pct * 100) / 100
}

export function computeMonthlyReserveAmounts(
  capitalUsd: number,
  targetPct: number,
  feeRate = TRADE_SESSION_PLATFORM_FEE_RATE,
): { grossMonthlyUsd: number; platformFeeUsd: number; netReserveUsd: number; targetPct: number } {
  const grossMonthlyUsd = roundUsd2(capitalUsd * (targetPct / 100))
  const platformFeeUsd = roundUsd2(grossMonthlyUsd * feeRate)
  const netReserveUsd = roundUsd2(Math.max(0, grossMonthlyUsd - platformFeeUsd))
  return { grossMonthlyUsd, platformFeeUsd, netReserveUsd, targetPct }
}

export function buildReserveSchedule(netReserveUsd: number, seedKey: string): ReserveSchedulePayload {
  const dailyUsd = buildExactSumBuckets(`${seedKey}|daily`, TRADE_SESSION_POLICY_DAYS, netReserveUsd)
  const days: ReserveDaySchedule[] = dailyUsd.map((daily, i) => {
    const rnd = mulberry32(stringSeed(`${seedKey}|slot|${i}`))
    const morningShare = 0.35 + rnd() * 0.3
    const morningUsd = roundUsd2(daily * morningShare)
    const eveningUsd = roundUsd2(daily - morningUsd)
    return { dailyUsd: daily, morningUsd, eveningUsd }
  })
  return { v: 1, days }
}

export function periodKeyFromDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

export function dayIndexInPeriod(sessionStartAt: string | Date, periodKey: string): number {
  const [y, m] = periodKey.split("-").map(Number)
  const monthStart = Date.UTC(y!, m! - 1, 1)
  const startMs = new Date(sessionStartAt).getTime()
  const idx = Math.floor((startMs - monthStart) / 86_400_000)
  return Math.max(0, Math.min(TRADE_SESSION_POLICY_DAYS - 1, idx))
}

export function normalizeSessionSlot(raw: string): "morning" | "evening" {
  return String(raw).toLowerCase() === "evening" ? "evening" : "morning"
}

export function slotGrossUsdFromSchedule(
  schedule: ReserveSchedulePayload,
  dayIndex: number,
  sessionSlot: string,
): number {
  const day = schedule.days[dayIndex]
  if (!day) return 0
  return normalizeSessionSlot(sessionSlot) === "evening" ? day.eveningUsd : day.morningUsd
}

export function scheduleSlotTotalUsd(schedule: ReserveSchedulePayload): number {
  let sum = 0
  for (const d of schedule.days) {
    sum += d.morningUsd + d.eveningUsd
  }
  return roundUsd2(sum)
}

export function assertReserveConservation(row: Pick<UserTradeSessionReserveRow, "net_reserve_usd" | "earned_usd" | "forfeited_usd" | "remaining_reserve_usd">, context: string): void {
  const sum = roundUsd2(row.earned_usd + row.forfeited_usd + row.remaining_reserve_usd)
  const net = roundUsd2(row.net_reserve_usd)
  if (Math.abs(sum - net) > RECONCILE_EPSILON_USD) {
    throw new Error(
      `${context}: RESERVE_CONSERVATION_BROKEN earned=${row.earned_usd} forfeited=${row.forfeited_usd} remaining=${row.remaining_reserve_usd} net=${net}`,
    )
  }
}

function parseSchedule(raw: unknown): ReserveSchedulePayload {
  if (!raw || typeof raw !== "object") return { v: 1, days: [] }
  const o = raw as Record<string, unknown>
  const daysRaw = o.days
  if (!Array.isArray(daysRaw)) return { v: 1, days: [] }
  const days = daysRaw.map((d) => {
    const x = d as Record<string, unknown>
    return {
      dailyUsd: roundUsd2(Number(x.dailyUsd ?? 0)),
      morningUsd: roundUsd2(Number(x.morningUsd ?? 0)),
      eveningUsd: roundUsd2(Number(x.eveningUsd ?? 0)),
    }
  })
  return { v: 1, days }
}

function mapReserveRow(row: Record<string, unknown>): UserTradeSessionReserveRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    period_key: String(row.period_key),
    capital_usd: roundUsd2(Number(row.capital_usd ?? 0)),
    monthly_target_pct: Number(row.monthly_target_pct ?? TRADE_SESSION_MONTHLY_TARGET_PCT),
    gross_monthly_usd: roundUsd2(Number(row.gross_monthly_usd ?? 0)),
    platform_fee_usd: roundUsd2(Number(row.platform_fee_usd ?? 0)),
    net_reserve_usd: roundUsd2(Number(row.net_reserve_usd ?? 0)),
    earned_usd: roundUsd2(Number(row.earned_usd ?? 0)),
    forfeited_usd: roundUsd2(Number(row.forfeited_usd ?? 0)),
    remaining_reserve_usd: roundUsd2(Number(row.remaining_reserve_usd ?? 0)),
    schedule: parseSchedule(row.schedule),
    seed_key: String(row.seed_key ?? ""),
  }
}

/** Rebuild unsettled future day slots after capital increase; past settled slots unchanged. */
export function rebuildFutureScheduleSlots(
  existing: ReserveSchedulePayload,
  settledDaySlots: Set<string>,
  netRemainingUsd: number,
  seedKey: string,
  fromDayIndex: number,
): ReserveSchedulePayload {
  const futureKeys: string[] = []
  for (let d = fromDayIndex; d < TRADE_SESSION_POLICY_DAYS; d++) {
    for (const slot of ["morning", "evening"] as const) {
      const key = `${d}:${slot}`
      if (!settledDaySlots.has(key)) futureKeys.push(key)
    }
  }
  if (futureKeys.length === 0 || !(netRemainingUsd > 0)) {
    return existing
  }

  const amounts = buildExactSumBuckets(`${seedKey}|future|${fromDayIndex}`, futureKeys.length, netRemainingUsd)
  const days = existing.days.map((d) => ({ ...d }))
  while (days.length < TRADE_SESSION_POLICY_DAYS) {
    days.push({ dailyUsd: 0, morningUsd: 0, eveningUsd: 0 })
  }

  futureKeys.forEach((key, i) => {
    const [dStr, slot] = key.split(":")
    const d = Number(dStr)
    const amt = amounts[i] ?? 0
    const day = days[d]!
    if (slot === "evening") {
      day.eveningUsd = amt
    } else {
      day.morningUsd = amt
    }
    day.dailyUsd = roundUsd2(day.morningUsd + day.eveningUsd)
  })

  return { v: 1, days }
}

export async function loadUserReserveForPeriod(
  admin: SupabaseClient,
  userId: string,
  periodKey: string,
): Promise<UserTradeSessionReserveRow | null> {
  const { data, error } = await admin
    .from("user_trade_session_earnings_reserves")
    .select("*")
    .eq("user_id", userId)
    .eq("period_key", periodKey)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapReserveRow(data as Record<string, unknown>) : null
}

async function loadSettledDaySlots(
  admin: SupabaseClient,
  reserveId: string,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from("user_trade_session_slot_ledger")
    .select("day_index,session_slot")
    .eq("reserve_id", reserveId)
  if (error) throw new Error(error.message)
  const out = new Set<string>()
  for (const r of data ?? []) {
    out.add(`${Number(r.day_index)}:${normalizeSessionSlot(String(r.session_slot))}`)
  }
  return out
}

export async function ensureUserTradeSessionReserve(
  admin: SupabaseClient,
  userId: string,
  capitalUsd: number,
  anchorDate: Date = new Date(),
): Promise<UserTradeSessionReserveRow> {
  const capital = roundUsd2(capitalUsd)
  if (!(capital > 0)) throw new Error("INVALID_RESERVE_CAPITAL")

  const periodKey = periodKeyFromDate(anchorDate)
  const existing = await loadUserReserveForPeriod(admin, userId, periodKey)
  const now = new Date().toISOString()

  if (!existing) {
    const seedKey = `reserve|${userId}|${periodKey}|${capital}`
    const targetPct = resolveTradeSessionMonthlyTargetPct(seedKey)
    const amounts = computeMonthlyReserveAmounts(capital, targetPct)
    const schedule = buildReserveSchedule(amounts.netReserveUsd, seedKey)
    const { data, error } = await admin
      .from("user_trade_session_earnings_reserves")
      .insert({
        user_id: userId,
        period_key: periodKey,
        capital_usd: capital,
        monthly_target_pct: amounts.targetPct,
        gross_monthly_usd: amounts.grossMonthlyUsd,
        platform_fee_usd: amounts.platformFeeUsd,
        net_reserve_usd: amounts.netReserveUsd,
        earned_usd: 0,
        forfeited_usd: 0,
        remaining_reserve_usd: amounts.netReserveUsd,
        schedule,
        seed_key: seedKey,
        updated_at: now,
      })
      .select("*")
      .single()
    if (error) throw new Error(error.message)
    const row = mapReserveRow(data as Record<string, unknown>)
    assertReserveConservation(row, "ensureUserTradeSessionReserve:create")
    return row
  }

  if (capital <= existing.capital_usd + RECONCILE_EPSILON_USD) {
    return existing
  }

  const seedKey = `${existing.seed_key}|cap${capital}`
  const targetPct = existing.monthly_target_pct
  const amounts = computeMonthlyReserveAmounts(capital, targetPct)
  const settled = await loadSettledDaySlots(admin, existing.id)
  const fromDay = dayIndexInPeriod(anchorDate, periodKey)
  const remainingTarget = roundUsd2(
    Math.max(0, amounts.netReserveUsd - existing.earned_usd - existing.forfeited_usd),
  )
  const schedule = rebuildFutureScheduleSlots(
    existing.schedule,
    settled,
    remainingTarget,
    seedKey,
    fromDay,
  )

  const patch = {
    capital_usd: capital,
    gross_monthly_usd: amounts.grossMonthlyUsd,
    platform_fee_usd: amounts.platformFeeUsd,
    net_reserve_usd: amounts.netReserveUsd,
    remaining_reserve_usd: remainingTarget,
    schedule,
    seed_key: seedKey,
    updated_at: now,
  }

  const { data, error } = await admin
    .from("user_trade_session_earnings_reserves")
    .update(patch)
    .eq("id", existing.id)
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  const row = mapReserveRow(data as Record<string, unknown>)
  assertReserveConservation(row, "ensureUserTradeSessionReserve:recap")
  return row
}

/** Proportional slot share capped by remaining reserve; minimum floor when weight > 0. */
export function computeSessionParticipationPayoutUsd(params: {
  slotGrossUsd: number
  participationWeight: number
  remainingReserveUsd: number
}): SessionParticipationPayout {
  const weight = Math.min(1, Math.max(0, params.participationWeight))
  const slotGross = roundUsd2(params.slotGrossUsd)
  const remaining = roundUsd2(params.remainingReserveUsd)
  const allocatedUsd = roundUsd2(slotGross * weight)

  if (weight <= 0) {
    return { payoutUsd: 0, allocatedUsd: 0, minFloorApplied: false }
  }
  if (!(slotGross > 0) || !(remaining > 0)) {
    return { payoutUsd: 0, allocatedUsd, minFloorApplied: false }
  }

  const capped = roundUsd2(Math.min(allocatedUsd, remaining))
  if (capped > 0) {
    return { payoutUsd: capped, allocatedUsd, minFloorApplied: false }
  }

  const floor = roundUsd2(
    Math.min(TRADE_SESSION_MIN_VISIBLE_SETTLEMENT_USD, remaining, slotGross),
  )
  return {
    payoutUsd: floor > 0 ? floor : 0,
    allocatedUsd,
    minFloorApplied: floor > 0,
  }
}

export function projectSessionPayoutUsd(
  reserve: UserTradeSessionReserveRow,
  sessionStartAt: string,
  sessionSlot: string,
  participationWeight: number,
): number {
  const dayIndex = dayIndexInPeriod(sessionStartAt, reserve.period_key)
  const slotGross = slotGrossUsdFromSchedule(reserve.schedule, dayIndex, sessionSlot)
  return computeSessionParticipationPayoutUsd({
    slotGrossUsd: slotGross,
    participationWeight,
    remainingReserveUsd: reserve.remaining_reserve_usd,
  }).payoutUsd
}

async function slotLedgerExists(
  admin: SupabaseClient,
  userId: string,
  tradeSessionId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("user_trade_session_slot_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("trade_session_id", tradeSessionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data)
}

async function applyReserveDebit(
  admin: SupabaseClient,
  reserve: UserTradeSessionReserveRow,
  debitUsd: number,
  outcome: "earned" | "forfeited",
  payoutUsd: number,
): Promise<UserTradeSessionReserveRow> {
  const debit = roundUsd2(debitUsd)
  if (debit > reserve.remaining_reserve_usd + RECONCILE_EPSILON_USD) {
    throw new Error("RESERVE_DEBIT_EXCEEDS_REMAINING")
  }

  const earned = roundUsd2(reserve.earned_usd + (outcome === "earned" ? payoutUsd : 0))
  const forfeited = roundUsd2(reserve.forfeited_usd + (outcome === "forfeited" ? debit : 0))
  const remaining = roundUsd2(reserve.remaining_reserve_usd - debit)
  const now = new Date().toISOString()

  const { data, error } = await admin
    .from("user_trade_session_earnings_reserves")
    .update({
      earned_usd: earned,
      forfeited_usd: forfeited,
      remaining_reserve_usd: remaining,
      updated_at: now,
    })
    .eq("id", reserve.id)
    .eq("remaining_reserve_usd", reserve.remaining_reserve_usd)
    .select("*")
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "RESERVE_UPDATE_CONFLICT")
  }

  const row = mapReserveRow(data as Record<string, unknown>)
  assertReserveConservation(row, `applyReserveDebit:${outcome}`)
  return row
}

export async function settleTradeSessionParticipation(
  admin: SupabaseClient,
  params: {
    userId: string
    tradeSessionId: string
    sessionStartAt: string
    sessionSlot: string
    capitalUsd: number
    participationWeight: number
    forceFullParticipation?: boolean
    joinedAt?: string | null
  },
): Promise<{
  profitUsd: number
  reserve: UserTradeSessionReserveRow
  allocatedUsd: number
  minFloorApplied: boolean
}> {
  const weight = params.forceFullParticipation
    ? 1
    : Math.min(1, Math.max(0, params.participationWeight))

  if (await slotLedgerExists(admin, params.userId, params.tradeSessionId)) {
    const reserve = await ensureUserTradeSessionReserve(
      admin,
      params.userId,
      params.capitalUsd,
      new Date(params.sessionStartAt),
    )
    const { data } = await admin
      .from("user_trade_session_slot_ledger")
      .select("payout_usd")
      .eq("user_id", params.userId)
      .eq("trade_session_id", params.tradeSessionId)
      .maybeSingle()
    return {
      profitUsd: roundUsd2(Number(data?.payout_usd ?? 0)),
      reserve,
      allocatedUsd: 0,
      minFloorApplied: false,
    }
  }

  let reserve = await ensureUserTradeSessionReserve(
    admin,
    params.userId,
    params.capitalUsd,
    new Date(params.sessionStartAt),
  )

  const dayIndex = dayIndexInPeriod(params.sessionStartAt, reserve.period_key)
  const slotGross = slotGrossUsdFromSchedule(reserve.schedule, dayIndex, params.sessionSlot)
  const { payoutUsd, allocatedUsd, minFloorApplied } = computeSessionParticipationPayoutUsd({
    slotGrossUsd: slotGross,
    participationWeight: weight,
    remainingReserveUsd: reserve.remaining_reserve_usd,
  })
  const debitUsd = payoutUsd

  const { error: insErr } = await admin.from("user_trade_session_slot_ledger").insert({
    user_id: params.userId,
    reserve_id: reserve.id,
    trade_session_id: params.tradeSessionId,
    day_index: dayIndex,
    session_slot: normalizeSessionSlot(params.sessionSlot),
    slot_gross_usd: slotGross,
    participation_weight: weight,
    allocated_profit_usd: allocatedUsd,
    payout_usd: payoutUsd,
    outcome: "earned",
    joined_at: params.joinedAt ?? null,
    reserve_source: TRADE_SESSION_RESERVE_SOURCE,
  })
  if (insErr) {
    if (insErr.code === "23505") {
      const { data } = await admin
        .from("user_trade_session_slot_ledger")
        .select("payout_usd")
        .eq("user_id", params.userId)
        .eq("trade_session_id", params.tradeSessionId)
        .maybeSingle()
      return {
        profitUsd: roundUsd2(Number(data?.payout_usd ?? 0)),
        reserve,
        allocatedUsd: 0,
        minFloorApplied: false,
      }
    }
    throw new Error(insErr.message)
  }

  reserve = await applyReserveDebit(admin, reserve, debitUsd, "earned", payoutUsd)
  return { profitUsd: payoutUsd, reserve, allocatedUsd, minFloorApplied }
}

export async function forfeitMissedTradeSessionSlot(
  admin: SupabaseClient,
  params: {
    userId: string
    tradeSessionId: string
    sessionStartAt: string
    sessionSlot: string
  },
): Promise<UserTradeSessionReserveRow | null> {
  if (await slotLedgerExists(admin, params.userId, params.tradeSessionId)) {
    return loadUserReserveForPeriod(
      admin,
      params.userId,
      periodKeyFromDate(new Date(params.sessionStartAt)),
    )
  }

  const periodKey = periodKeyFromDate(new Date(params.sessionStartAt))
  const reserve = await loadUserReserveForPeriod(admin, params.userId, periodKey)
  if (!reserve) return null

  const dayIndex = dayIndexInPeriod(params.sessionStartAt, periodKey)
  const slotGross = slotGrossUsdFromSchedule(reserve.schedule, dayIndex, params.sessionSlot)
  if (!(slotGross > 0)) return reserve

  const forfeitUsd = roundUsd2(Math.min(slotGross, reserve.remaining_reserve_usd))
  if (!(forfeitUsd > 0)) return reserve

  const { error: insErr } = await admin.from("user_trade_session_slot_ledger").insert({
    user_id: params.userId,
    reserve_id: reserve.id,
    trade_session_id: params.tradeSessionId,
    day_index: dayIndex,
    session_slot: normalizeSessionSlot(params.sessionSlot),
    slot_gross_usd: slotGross,
    participation_weight: 0,
    payout_usd: 0,
    outcome: "forfeited",
  })
  if (insErr) {
    if (insErr.code === "23505") return reserve
    throw new Error(insErr.message)
  }

  return applyReserveDebit(admin, reserve, forfeitUsd, "forfeited", 0)
}

export function previewSessionPayoutFromCapital(params: {
  userId: string
  capitalUsd: number
  sessionStartAt: string
  sessionSlot: string
  participationWeight: number
  existingReserve?: UserTradeSessionReserveRow | null
}): number {
  const periodKey = periodKeyFromDate(new Date(params.sessionStartAt))
  if (params.existingReserve?.period_key === periodKey) {
    return projectSessionPayoutUsd(
      params.existingReserve,
      params.sessionStartAt,
      params.sessionSlot,
      params.participationWeight,
    )
  }

  const capital = roundUsd2(params.capitalUsd)
  const seedKey = `reserve|${params.userId}|${periodKey}|${capital}`
  const targetPct = resolveTradeSessionMonthlyTargetPct(seedKey)
  const amounts = computeMonthlyReserveAmounts(capital, targetPct)
  const schedule = buildReserveSchedule(amounts.netReserveUsd, seedKey)
  const provisional: UserTradeSessionReserveRow = {
    id: "preview",
    user_id: params.userId,
    period_key: periodKey,
    capital_usd: capital,
    monthly_target_pct: amounts.targetPct,
    gross_monthly_usd: amounts.grossMonthlyUsd,
    platform_fee_usd: amounts.platformFeeUsd,
    net_reserve_usd: amounts.netReserveUsd,
    earned_usd: 0,
    forfeited_usd: 0,
    remaining_reserve_usd: amounts.netReserveUsd,
    schedule,
    seed_key: seedKey,
  }
  return projectSessionPayoutUsd(
    provisional,
    params.sessionStartAt,
    params.sessionSlot,
    params.participationWeight,
  )
}

/** After a trade session ends, forfeit slots for reserve holders who did not participate. */
export async function processTradeSessionForfeitures(
  admin: SupabaseClient,
  tradeSession: {
    id: string
    session_slot: string
    start_at: string
  },
): Promise<number> {
  const periodKey = periodKeyFromDate(new Date(tradeSession.start_at))
  const { data: reserves, error } = await admin
    .from("user_trade_session_earnings_reserves")
    .select("user_id")
    .eq("period_key", periodKey)
  if (error) throw new Error(error.message)

  const { data: participants, error: pErr } = await admin
    .from("user_trade_session_slot_ledger")
    .select("user_id")
    .eq("trade_session_id", tradeSession.id)
  if (pErr) throw new Error(pErr.message)

  const participated = new Set((participants ?? []).map((r) => String(r.user_id)))
  let n = 0
  for (const r of reserves ?? []) {
    const userId = String(r.user_id)
    if (participated.has(userId)) continue
    await forfeitMissedTradeSessionSlot(admin, {
      userId,
      tradeSessionId: tradeSession.id,
      sessionStartAt: tradeSession.start_at,
      sessionSlot: tradeSession.session_slot,
    })
    n += 1
  }
  return n
}
