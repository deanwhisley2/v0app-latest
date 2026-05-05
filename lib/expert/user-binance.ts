import { createAdminClient } from "@/lib/supabaseAdmin"

export type BinanceCreds = { apiKey: string; apiSecret: string }

/**
 * Loads Binance API keys stored for the user in Supabase Auth `user_metadata.nexus_exchanges`
 * (written by the client when you "connect" Binance). Server uses the service role to read this
 * only at execution time — never returned to the browser in API responses.
 *
 * Security note: storing raw secrets in user_metadata is convenient for cross-device sync but is
 * weaker than a dedicated secrets vault. Prefer migrating to encrypted storage or custodial keys.
 */
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
 * Keys used for Binance signed REST calls: per-user keys from metadata if present, else server env
 * (`BINANCE_API_KEY` / `BINANCE_SECRET_KEY`).
 */
export async function resolveBinanceCredentialsForExecution(userId: string): Promise<{
  creds: BinanceCreds
  source: "user" | "env"
}> {
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
