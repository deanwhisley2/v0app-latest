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
    // Kenya / East Africa: 07xxxxxxxx <-> 2547xxxxxxxx
    if (digits.startsWith("0") && digits.length >= 10) {
      const intl = `254${digits.slice(1)}`
      candidates.add(intl)
      candidates.add(`+${intl}`)
    }
    if (digits.startsWith("254") && digits.length >= 12) {
      candidates.add(`0${digits.slice(3)}`)
      candidates.add(`+${digits}`)
    }
    if (digits.length === 9 && /^[17]/.test(digits)) {
      candidates.add(`254${digits}`)
      candidates.add(`+254${digits}`)
      candidates.add(`0${digits}`)
    }
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

  // 2) Email local-part prefix (e.g. "kisumu" -> kisumusahil8@gmail.com when unique).
  const localKey = identifier.toLowerCase()
  if (localKey.length >= 4) {
    const { data: localPartRows, error: localPartErr } = await admin
      .from("profiles")
      .select("email")
      .ilike("email", `${localKey}%@%`)
      .limit(3)
    if (localPartErr) {
      console.error("resolveIdentifierToEmail local-part lookup:", localPartErr)
      return null
    }
    const localPartEmails = uniqueEmails((localPartRows ?? []) as Array<{ email: string | null }>)
    if (localPartEmails.length === 1) return localPartEmails[0]
  }

  return null
}
