import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

const BUCKET = "funding-proofs"
const MAX_BYTES = 5 * 1024 * 1024

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
}

export function parseDataUrlImage(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim())
  if (!m) return null
  const mime = m[1].toLowerCase()
  if (!MIME_EXT[mime]) return null
  const buffer = Buffer.from(m[2], "base64")
  if (buffer.length < 8 || buffer.length > MAX_BYTES) return null
  return { buffer, mime }
}

export async function uploadFundingProof(
  admin: SupabaseClient,
  userId: string,
  dataUrl: string,
  requestId?: string,
): Promise<string> {
  const parsed = parseDataUrlImage(dataUrl)
  if (!parsed) throw new Error("Invalid payment proof image (JPEG/PNG/WebP, max 5 MB).")

  const ext = MIME_EXT[parsed.mime] ?? "jpg"
  const key = `${userId}/${requestId ?? randomUUID()}.${ext}`

  const { error } = await admin.storage.from(BUCKET).upload(key, parsed.buffer, {
    contentType: parsed.mime,
    upsert: false,
  })
  if (error) throw new Error(error.message)
  return key
}

export async function signedFundingProofUrl(
  admin: SupabaseClient,
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!path.trim()) return null
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path.trim(), expiresInSeconds)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
