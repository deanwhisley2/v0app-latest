/** Designated general retailer desk (email local part esknexuspro, any domain). */

export const ESK_NEXUSPRO_EMAIL_LOCAL = "esknexuspro"

export function isEskNexusProEmail(email: string | null | undefined): boolean {
  const raw = String(email ?? "").trim().toLowerCase()
  if (!raw.includes("@")) return false
  const local = raw.split("@")[0] ?? ""
  return local === ESK_NEXUSPRO_EMAIL_LOCAL
}

export function isEskNexusProProfileEmail(profileEmail: string | null | undefined): boolean {
  return isEskNexusProEmail(profileEmail)
}
