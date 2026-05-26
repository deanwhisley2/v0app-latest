import type { PublicSecurityProfile } from "@/lib/nexus-security-profile-types"

const CACHE_KEY = "nexus_security_needs_setup_v1"
const CACHE_TS_KEY = "nexus_security_needs_setup_ts_v1"
const FETCH_TIMEOUT_MS = 5_000
const CACHE_TTL_MS = 5 * 60_000

let inflightStatus: Promise<{ needsSetup: boolean; error: string | null }> | null = null
let inflightProfile: Promise<{ profile: PublicSecurityProfile | null; error: string | null }> | null =
  null

let debugRenderCount = 0

export function securityProfileDebug(event: string, meta?: Record<string, unknown>): void {
  if (typeof window === "undefined") return
  try {
    const qs =
      typeof window.location !== "undefined" &&
      new URLSearchParams(window.location.search).get("nexus_security_debug") === "1"
    const stored = localStorage.getItem("nexus_security_debug") === "1"
    if (!qs && !stored) return
    console.info("[nexus-security]", event, meta ?? "")
  } catch {
    /* ignore */
  }
}

export function securityProfileDebugRender(surface: string): void {
  debugRenderCount += 1
  securityProfileDebug("render", { surface, count: debugRenderCount })
}

export function readCachedNeedsSetup(): boolean | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    const ts = Number(sessionStorage.getItem(CACHE_TS_KEY) ?? "0")
    if (raw !== "0" && raw !== "1") return null
    if (Date.now() - ts > CACHE_TTL_MS) return null
    return raw === "1"
  } catch {
    return null
  }
}

function writeCachedNeedsSetup(needsSetup: boolean): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(CACHE_KEY, needsSetup ? "1" : "0")
    sessionStorage.setItem(CACHE_TS_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

async function fetchJson<T>(
  token: string,
  label: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  securityProfileDebug("fetch_start", { label })
  try {
    const res = await fetch("/api/user/security-profile", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: controller.signal,
    })
    const j = (await res.json().catch(() => ({}))) as T & { error?: string }
    if (!res.ok) {
      const err = (j as { error?: string }).error ?? `${label} failed (${res.status})`
      securityProfileDebug("fetch_finish", { label, ok: false, status: res.status })
      return { ok: false, error: err }
    }
    securityProfileDebug("fetch_finish", { label, ok: true, status: res.status })
    return { ok: true, data: j }
  } catch (e) {
    const err =
      e instanceof Error && e.name === "AbortError"
        ? `${label} timed out`
        : e instanceof Error
          ? e.message
          : `${label} failed`
    securityProfileDebug("fetch_finish", { label, ok: false, error: err })
    return { ok: false, error: err }
  } finally {
    window.clearTimeout(timer)
  }
}

/** Passive status check — deduped, cached, never blocks UI. */
export async function fetchSecurityNeedsSetupPassive(
  token: string,
): Promise<{ needsSetup: boolean; error: string | null }> {
  if (inflightStatus) return inflightStatus

  inflightStatus = (async () => {
    const result = await fetchJson<{ profile?: { needsSetup?: boolean } }>(token, "needs_setup")
    if (!result.ok) {
      const cached = readCachedNeedsSetup()
      return {
        // Fail closed for funding/withdraw — stale "false" cache blocked users with no feedback.
        needsSetup: cached ?? true,
        error: result.error,
      }
    }
    const needsSetup = Boolean(result.data.profile?.needsSetup)
    writeCachedNeedsSetup(needsSetup)
    return { needsSetup, error: null }
  })().finally(() => {
    inflightStatus = null
  })

  return inflightStatus
}

export type SecurityProfileFetchResult = {
  profile: PublicSecurityProfile | null
  error: string | null
}

/** Full profile for Settings security screens only. */
export async function fetchSecurityProfilePassive(
  token: string,
): Promise<SecurityProfileFetchResult> {
  if (inflightProfile) return inflightProfile

  inflightProfile = (async () => {
    const result = await fetchJson<{ profile?: PublicSecurityProfile }>(token, "profile")
    if (!result.ok) {
      return { profile: null, error: result.error }
    }
    const profile = result.data.profile ?? null
    if (profile) writeCachedNeedsSetup(profile.needsSetup)
    return { profile, error: null }
  })().finally(() => {
    inflightProfile = null
  })

  return inflightProfile
}

/** Funding / withdraw gates — always fresh (no session cache for needsSetup). */
export async function fetchSecurityProfileForAction(
  token: string,
): Promise<SecurityProfileFetchResult> {
  const result = await fetchJson<{ profile?: PublicSecurityProfile }>(token, "profile_action")
  if (!result.ok) {
    return { profile: null, error: result.error }
  }
  const profile = result.data.profile ?? null
  if (profile) writeCachedNeedsSetup(profile.needsSetup)
  return { profile, error: null }
}
