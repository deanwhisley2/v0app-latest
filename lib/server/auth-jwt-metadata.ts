/**
 * Supabase stores Auth JWT claims from user_metadata. Large blobs (e.g. base64
 * selfies in avatar_url) blow past cookie/header limits → 431 / broken sessions.
 * Keep only small flags/hashes in metadata; store images in public.profiles only.
 */
const BULKY_METADATA_KEYS = new Set(["avatar_url", "selfie_image"])

export function mergeSafeUserMetadata(
  current: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base = { ...(current ?? {}) } as Record<string, unknown>
  for (const key of BULKY_METADATA_KEYS) {
    delete base[key]
  }
  for (const [k, v] of Object.entries(patch)) {
    if (BULKY_METADATA_KEYS.has(k)) continue
    base[k] = v
  }
  return base
}
