import type { SupabaseClient } from "@supabase/supabase-js"

type AdminClient = SupabaseClient

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizePhoneCandidates(raw: string): string[] {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, "")
  const candidates = new Set<string>([trimmed])
  if (digits) {
    candidates.add(digits)
    candidates.add(`+${digits}`)
  }
  return [...candidates].filter(Boolean)
}

function uniqueEmails(rows: Array<{ email: string | null }>): string[] {
  return [...new Set(rows.map((r) => (r.email || "").trim().toLowerCase()).filter(Boolean))]
}

/**
 * Resolves login/recovery identifier to canonical email.
 * Accepted identifier: email, phone, or username-like value.
 * Username-like fallback maps to email local-part before "@".
 */
export async function resolveIdentifierToEmail(
  admin: AdminClient,
  identifierRaw: string
): Promise<string | null> {
  const identifier = identifierRaw.trim()
  if (!identifier) return null
  if (isEmailLike(identifier)) return identifier.toLowerCase()

  // 1) Try exact phone match variants.
  for (const phoneCandidate of normalizePhoneCandidates(identifier)) {
    const { data: phoneRows, error: phoneErr } = await admin
      .from("profiles")
      .select("email")
      .eq("phone", phoneCandidate)
      .limit(2)
    if (phoneErr) {
      console.error("resolveIdentifierToEmail phone lookup:", phoneErr)
      continue
    }
    const phoneEmails = uniqueEmails((phoneRows ?? []) as Array<{ email: string | null }>)
    if (phoneEmails.length === 1) return phoneEmails[0]
  }

  // 2) Try explicit username column when present.
  const { data: usernameRows, error: usernameErr } = await admin
    .from("profiles")
    .select("email")
    .eq("username", identifier.toLowerCase())
    .limit(2)
  if (!usernameErr) {
    const emails = uniqueEmails((usernameRows ?? []) as Array<{ email: string | null }>)
    if (emails.length === 1) return emails[0]
  }

  // 3) Username-like fallback: email local-part match (e.g. "dean" -> dean@...).
  const { data: localPartRows, error: localPartErr } = await admin
    .from("profiles")
    .select("email")
    .ilike("email", `${identifier.toLowerCase()}@%`)
    .limit(3)
  if (localPartErr) {
    console.error("resolveIdentifierToEmail local-part lookup:", localPartErr)
    return null
  }
  const localPartEmails = uniqueEmails((localPartRows ?? []) as Array<{ email: string | null }>)
  if (localPartEmails.length === 1) return localPartEmails[0]

  return null
}
