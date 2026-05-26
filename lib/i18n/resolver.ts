import type { AppLanguage } from "@/lib/user-preferences"

/**
 * Resolve a UI translation key: overlay → English pack → safe human fallback.
 * Never returns empty for a non-empty key unless canonical pack is wrong.
 */
export function resolveUiString(
  canonical: Readonly<Record<string, string>>,
  overlay: Partial<Record<string, string>> | undefined,
  _lang: AppLanguage,
  key: string
): string {
  const trimmedKey = key.trim()
  if (!trimmedKey) return ""

  const fromOverlay = overlay?.[trimmedKey]
  if (fromOverlay != null && String(fromOverlay).trim() !== "") {
    return fromOverlay
  }

  const fromEn = canonical[trimmedKey]
  if (fromEn != null && String(fromEn).trim() !== "") {
    return fromEn
  }

  return humanizeKeyFallback(trimmedKey)
}

function humanizeKeyFallback(key: string): string {
  if (!key.includes(".")) return key
  const tail = key.split(".").pop() ?? key
  const spaced = tail
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .trim()
  return spaced.length > 0 ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key
}
