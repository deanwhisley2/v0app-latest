import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto"

const PBKDF2_ITERATIONS = 120_000
const SALT_BYTES = 16
const KEY_BYTES = 32

/** Validate 6-digit Nexus Security Code format (digits only). */
export function isValidSecurityCodeFormat(code: string): boolean {
  return /^\d{6}$/.test(code.trim())
}

export function hashSecurityCode(code: string): string {
  const normalized = code.trim()
  if (!isValidSecurityCodeFormat(normalized)) {
    throw new Error("Security code must be exactly 6 digits.")
  }
  const salt = randomBytes(SALT_BYTES)
  const derived = pbkdf2Sync(normalized, salt, PBKDF2_ITERATIONS, KEY_BYTES, "sha256")
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt.toString("base64")}$${derived.toString("base64")}`
}

export function verifySecurityCode(code: string, storedHash: string | null | undefined): boolean {
  if (!storedHash?.startsWith("pbkdf2_sha256$")) return false
  const parts = storedHash.split("$")
  if (parts.length !== 4) return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations < 10_000) return false
  const salt = Buffer.from(parts[2], "base64")
  const expected = Buffer.from(parts[3], "base64")
  const normalized = code.trim()
  if (!isValidSecurityCodeFormat(normalized)) return false
  const derived = pbkdf2Sync(normalized, salt, iterations, expected.length, "sha256")
  try {
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/** Mask phone or wallet for display — never expose full value on user surfaces after resolution. */
export function maskSensitiveValue(value: string, kind: "phone" | "wallet" | "generic"): string {
  const v = value.trim()
  if (!v) return "—"
  if (kind === "wallet" && v.length > 12) {
    return `${v.slice(0, 4)}…${v.slice(-4)}`
  }
  if (kind === "phone" && v.length > 6) {
    return `${v.slice(0, 4)}XXXX${v.slice(-3)}`
  }
  if (v.length <= 4) return "****"
  return `${v.slice(0, 2)}…${v.slice(-2)}`
}

export function fingerprintValue(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex").slice(0, 24)
}
