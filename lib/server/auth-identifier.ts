import type { SupabaseClient } from "@supabase/supabase-js"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import { phoneAuthEmailFromDigits } from "@/lib/server/register-auth-access"

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

  // 1) Try exact phone match variants (profile email may be null until inbox verify).
  for (const phoneCandidate of normalizePhoneCandidates(identifier)) {
    const { data: phoneRows, error: phoneErr } = await admin
      .from("profiles")
      .select("id, email")
      .eq("phone", phoneCandidate)
      .limit(2)
    if (phoneErr) {
      console.error("resolveIdentifierToEmail phone lookup:", phoneErr)
      continue
    }
    const rows = (phoneRows ?? []) as Array<{ id: string; email: string | null }>
    if (rows.length !== 1) continue

    const profEmail = (rows[0].email ?? "").trim().toLowerCase()
    if (profEmail) return profEmail

    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(rows[0].id)
    if (authErr) {
      console.error("resolveIdentifierToEmail auth user:", authErr)
      continue
    }
    const authEmail = authUser.user?.email?.trim().toLowerCase()
    if (authEmail) return authEmail
  }

  const digits = identifier.replace(/\D/g, "")
  if (digits.length >= 9 && digits.length <= 15) {
    const internal = phoneAuthEmailFromDigits(digits)
    const uid = await findAuthUserIdByEmail(admin, internal)
    if (uid) return internal
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
