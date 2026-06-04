/** Persist registration wizard fields so users can return from email apps without losing progress. */

export const REGISTER_DRAFT_STORAGE_KEY = "nexus_register_draft_v1"
const PASSWORD_SESSION_KEY = "nexus_register_draft_password_v1"
const TTL_MS = 24 * 60 * 60 * 1000

export type RegisterDraft = {
  step: 1 | 2
  email: string
  phone: string
  full_name: string
  language: string
  operating_country: string
  referral_code: string
  campaign_slug: string
  created_at: number
}

function isBrowser(): boolean {
  return typeof window !== "undefined"
}

export function getRegisterDraft(): RegisterDraft | null {
  if (!isBrowser()) return null
  try {
    const raw = localStorage.getItem(REGISTER_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RegisterDraft>
    const created_at = typeof parsed.created_at === "number" ? parsed.created_at : 0
    if (!created_at || Date.now() - created_at > TTL_MS) {
      clearRegisterDraft()
      return null
    }
    const step = parsed.step === 2 ? 2 : 1
    return {
      step,
      email: typeof parsed.email === "string" ? parsed.email : "",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      full_name: typeof parsed.full_name === "string" ? parsed.full_name : "",
      language: typeof parsed.language === "string" ? parsed.language : "en",
      operating_country: typeof parsed.operating_country === "string" ? parsed.operating_country : "",
      referral_code: typeof parsed.referral_code === "string" ? parsed.referral_code : "",
      campaign_slug: typeof parsed.campaign_slug === "string" ? parsed.campaign_slug : "",
      created_at,
    }
  } catch {
    return null
  }
}

export function setRegisterDraft(draft: Omit<RegisterDraft, "created_at"> & { created_at?: number }): void {
  if (!isBrowser()) return
  const record: RegisterDraft = {
    ...draft,
    step: draft.step === 2 ? 2 : 1,
    created_at: draft.created_at ?? Date.now(),
  }
  try {
    localStorage.setItem(REGISTER_DRAFT_STORAGE_KEY, JSON.stringify(record))
  } catch {
    /* quota / private mode */
  }
}

export function patchRegisterDraft(patch: Partial<RegisterDraft>): void {
  const current = getRegisterDraft()
  if (!current) {
    setRegisterDraft({
      step: 1,
      email: "",
      phone: "",
      full_name: "",
      language: "en",
      operating_country: "",
      referral_code: "",
      campaign_slug: "",
      ...patch,
    })
    return
  }
  setRegisterDraft({ ...current, ...patch })
}

export function clearRegisterDraft(): void {
  if (!isBrowser()) return
  try {
    localStorage.removeItem(REGISTER_DRAFT_STORAGE_KEY)
    sessionStorage.removeItem(PASSWORD_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/** Password kept in sessionStorage only (never localStorage) for restore on step 2. */
export function getRegisterDraftPassword(): { password: string; confirmPassword: string } | null {
  if (!isBrowser()) return null
  try {
    const raw = sessionStorage.getItem(PASSWORD_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { password?: string; confirmPassword?: string; created_at?: number }
    const created_at = typeof parsed.created_at === "number" ? parsed.created_at : 0
    if (!created_at || Date.now() - created_at > TTL_MS) {
      sessionStorage.removeItem(PASSWORD_SESSION_KEY)
      return null
    }
    return {
      password: typeof parsed.password === "string" ? parsed.password : "",
      confirmPassword: typeof parsed.confirmPassword === "string" ? parsed.confirmPassword : "",
    }
  } catch {
    return null
  }
}

export function setRegisterDraftPassword(password: string, confirmPassword: string): void {
  if (!isBrowser()) return
  try {
    sessionStorage.setItem(
      PASSWORD_SESSION_KEY,
      JSON.stringify({ password, confirmPassword, created_at: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}
