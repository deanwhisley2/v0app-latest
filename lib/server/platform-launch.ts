import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  DEFAULT_UGANDA_LAUNCH_PROGRAMS,
  type LaunchProgramsConfig,
  type PlatformLaunchPublicStatus,
  UGANDA_LAUNCH_SLUG,
} from "@/lib/platform-launch-config"

export type { PlatformLaunchPublicStatus }

export type PlatformLaunchWindowRow = {
  slug: string
  title: string
  region_code: string
  duration_days: number
  auto_activate: boolean
  activated_at: string | null
  ends_at: string | null
  status: string
  programs: LaunchProgramsConfig
}

const CACHE_MS = 15_000
let cacheAt = 0
let cacheStatus: PlatformLaunchPublicStatus | null = null

function parsePrograms(raw: unknown): LaunchProgramsConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_UGANDA_LAUNCH_PROGRAMS
  return { ...DEFAULT_UGANDA_LAUNCH_PROGRAMS, ...(raw as LaunchProgramsConfig) }
}

function computePublicStatus(row: PlatformLaunchWindowRow | null): PlatformLaunchPublicStatus {
  if (!row) {
    return {
      active: false,
      slug: null,
      title: null,
      regionCode: null,
      activatedAt: null,
      endsAt: null,
      daysRemaining: 0,
      hoursRemaining: 0,
      programs: {},
      launchMode: false,
    }
  }

  const now = Date.now()
  const activatedAt = row.activated_at
  const endsAt = row.ends_at
  const endMs = endsAt ? new Date(endsAt).getTime() : 0
  const startMs = activatedAt ? new Date(activatedAt).getTime() : 0
  const active =
    row.status === "active" &&
    Boolean(activatedAt && endsAt) &&
    now >= startMs &&
    now < endMs

  const msLeft = active ? Math.max(0, endMs - now) : 0

  return {
    active,
    slug: row.slug,
    title: row.title,
    regionCode: row.region_code,
    activatedAt,
    endsAt,
    daysRemaining: Math.ceil(msLeft / (24 * 60 * 60 * 1000)),
    hoursRemaining: Math.ceil(msLeft / (60 * 60 * 1000)),
    programs: parsePrograms(row.programs),
    launchMode: active,
  }
}

async function expireIfNeeded(admin: SupabaseClient, row: PlatformLaunchWindowRow): Promise<void> {
  if (!row.ends_at || row.status === "expired") return
  if (new Date(row.ends_at).getTime() > Date.now()) return
  const { error } = await admin
    .from("platform_launch_windows")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("slug", row.slug)
  if (error) {
    console.warn("[platform-launch] expire update:", error.message)
  }
}

async function activateIfScheduled(admin: SupabaseClient, row: PlatformLaunchWindowRow): Promise<PlatformLaunchWindowRow> {
  if (row.status !== "scheduled" || !row.auto_activate) return row
  const now = new Date()
  const ends = new Date(now.getTime() + row.duration_days * 24 * 60 * 60 * 1000)
  const patch = {
    status: "active",
    activated_at: now.toISOString(),
    ends_at: ends.toISOString(),
    updated_at: now.toISOString(),
  }
  const { error } = await admin.from("platform_launch_windows").update(patch).eq("slug", row.slug)
  if (error) {
    console.warn("[platform-launch] auto-activate:", error.message)
    return row
  }
  return { ...row, ...patch, status: "active" }
}

export async function loadLaunchWindow(
  admin: SupabaseClient,
  slug: string = UGANDA_LAUNCH_SLUG,
): Promise<PlatformLaunchWindowRow | null> {
  const { data, error } = await admin.from("platform_launch_windows").select("*").eq("slug", slug).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null

  let row = data as PlatformLaunchWindowRow
  row.programs = parsePrograms(row.programs)
  row = await activateIfScheduled(admin, row)
  await expireIfNeeded(admin, row)

  const { data: refreshed } = await admin.from("platform_launch_windows").select("*").eq("slug", slug).maybeSingle()
  if (!refreshed) return row
  const out = refreshed as PlatformLaunchWindowRow
  out.programs = parsePrograms(out.programs)
  return out
}

export async function getPlatformLaunchStatus(force = false): Promise<PlatformLaunchPublicStatus> {
  const now = Date.now()
  if (!force && cacheStatus && now - cacheAt < CACHE_MS) return cacheStatus

  try {
    const admin = createAdminClient()
    const row = await loadLaunchWindow(admin)
    const status = computePublicStatus(row)
    cacheAt = now
    cacheStatus = status
    return status
  } catch (e) {
    console.warn("[platform-launch] status:", e instanceof Error ? e.message : String(e))
    const fallback = computePublicStatus(null)
    cacheAt = now
    cacheStatus = fallback
    return fallback
  }
}

export function invalidatePlatformLaunchCache(): void {
  cacheAt = 0
  cacheStatus = null
}

export async function isUgandaLaunchActive(): Promise<boolean> {
  const s = await getPlatformLaunchStatus()
  return s.active && s.regionCode === "UG"
}

export function getLaunchReferralFirstDepositRate(
  programs: LaunchProgramsConfig,
  defaultRate: number,
): number {
  const r = programs.referrals?.first_deposit_rate
  if (typeof r === "number" && r > 0 && r <= 0.15) return r
  return defaultRate
}

export function getLaunchReferrerFlatUsd(
  programs: LaunchProgramsConfig,
  defaultUsd: number,
): number {
  const v = programs.referrals?.referrer_flat_usd
  if (typeof v === "number" && v > 0 && v <= 50) return v
  return defaultUsd
}

export function getLaunchRefereeFirstDepositRate(
  programs: LaunchProgramsConfig,
  defaultRate: number,
): number {
  const r = programs.referrals?.referee_first_deposit_rate
  if (typeof r === "number" && r > 0 && r <= 0.5) return r
  return defaultRate
}

export function getLaunchStarterFixPersonaId(programs: LaunchProgramsConfig): string {
  const id = String(programs.onboarding?.starter_fix_persona_id ?? "").trim()
  return id.length ? id : "fix_l1_t1"
}

export function launchPromotionsActive(status: PlatformLaunchPublicStatus): boolean {
  return Boolean(status.active && status.programs.referrals?.enabled)
}

export function getLaunchValidRefereeMinFundedUsd(
  programs: LaunchProgramsConfig,
  defaultUsd: number,
): number {
  const v = programs.onboarding?.valid_referee_min_funded_usd
  if (typeof v === "number" && v > 0 && v <= defaultUsd) return v
  return defaultUsd
}
