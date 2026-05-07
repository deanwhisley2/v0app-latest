import { createAdminClient } from "@/lib/supabaseAdmin"

export type BinanceCreds = { apiKey: string; apiSecret: string }

/**
 * Loads Binance API keys from `profiles.nexus_exchanges` first, then
 * Supabase Auth `user_metadata.nexus_exchanges` (written when the user connects an exchange).
 * Server uses the service role to read this only at execution time — never returned to the browser in API responses.
 *
 * Security note: storing raw secrets in DB metadata is convenient for cross-device sync but is
 * weaker than a dedicated secrets vault. Prefer encrypting at rest or custodial keys.
 */
async function getBinanceFromProfile(userId: string): Promise<BinanceCreds | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("profiles")
      .select("nexus_exchanges")
      .eq("id", userId)
      .maybeSingle()
    if (error || !data) return null
    const rows = (data as { nexus_exchanges?: unknown }).nexus_exchanges
    if (!Array.isArray(rows)) return null
    const row = rows.find(
      (r: { id?: string; name?: string }) =>
        r.id === "binance" || String(r.name ?? "").toLowerCase() === "binance"
    ) as { _apiKey?: string; _apiSecret?: string; apiKey?: string } | undefined
    if (!row) return null
    const apiKey = (row._apiKey ?? row.apiKey ?? "").trim()
    const apiSecret = (row._apiSecret ?? "").trim()
    if (!apiKey || !apiSecret) return null
    return { apiKey, apiSecret }
  } catch {
    return null
  }
}

async function getBinanceFromUserMetadata(userId: string): Promise<BinanceCreds | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data.user) return null
    const meta = data.user.user_metadata as Record<string, unknown> | undefined
    const rows = meta?.nexus_exchanges
    if (!Array.isArray(rows)) return null
    const row = rows.find(
      (r: { id?: string; name?: string }) =>
        r.id === "binance" || String(r.name ?? "").toLowerCase() === "binance"
    ) as { _apiKey?: string; _apiSecret?: string; apiKey?: string } | undefined
    if (!row) return null
    const apiKey = (row._apiKey ?? row.apiKey ?? "").trim()
    const apiSecret = (row._apiSecret ?? "").trim()
    if (!apiKey || !apiSecret) return null
    return { apiKey, apiSecret }
  } catch {
    return null
  }
}

/**
 * Keys used for Binance signed REST calls: per-user keys from profile / metadata if present, else server env
 * (`BINANCE_API_KEY` / `BINANCE_SECRET_KEY`).
 */
export async function resolveBinanceCredentialsForExecution(userId: string): Promise<{
  creds: BinanceCreds
  source: "user" | "env"
}> {
  const fromProfile = await getBinanceFromProfile(userId)
  if (fromProfile) {
    return { creds: fromProfile, source: "user" }
  }
  const fromUser = await getBinanceFromUserMetadata(userId)
  if (fromUser) {
    return { creds: fromUser, source: "user" }
  }
  const apiKey = process.env.BINANCE_API_KEY?.trim()
  const apiSecret = (process.env.BINANCE_SECRET_KEY || process.env.BINANCE_API_SECRET || "").trim()
  if (!apiKey || !apiSecret) {
    throw new Error("MISSING_BINANCE_KEYS")
  }
  return { creds: { apiKey, apiSecret }, source: "env" }
}
