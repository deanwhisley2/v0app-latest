import { randomBytes } from "crypto"

const SLUG_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** Public campaign slug, e.g. NXP-CP-8JH29K */
export function generateCampaignSlug(): string {
  let tail = ""
  const bytes = randomBytes(6)
  for (let i = 0; i < 6; i++) {
    tail += SLUG_ALPHABET[bytes[i]! % SLUG_ALPHABET.length]
  }
  return `NXP-CP-${tail}`
}

export function normalizeCampaignSlugInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "")
}

export function buildCampaignPublicUrl(siteOrigin: string, slug: string): string {
  const base = siteOrigin.replace(/\/$/, "")
  return `${base}/promo/${encodeURIComponent(slug)}`
}

export function buildCampaignRegisterUrl(siteOrigin: string, slug: string): string {
  const base = siteOrigin.replace(/\/$/, "")
  return `${base}/auth/register?campaign=${encodeURIComponent(slug)}`
}
