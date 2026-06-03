import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeTradeCode } from "@/lib/nexus-bot/trade-code"
import { findActiveTradeSessionByCode } from "@/lib/server/trade-sessions"

const VERIFY_TTL_MS = 30 * 60_000

export async function verifyTradeSessionCode(
  admin: SupabaseClient,
  userId: string,
  codeRaw: string,
): Promise<{
  verificationId: string
  verifiedAt: string
  expiresAt: string
  session: {
    id: string
    startAt: string
    endAt: string
  }
}> {
  const code = normalizeTradeCode(codeRaw)
  const session = await findActiveTradeSessionByCode(admin, code)
  if (!session) throw new Error("CODE_INVALID_OR_EXPIRED")

  const now = new Date()
  const endMs = new Date(session.endAt).getTime()
  if (endMs <= now.getTime()) throw new Error("SESSION_EXPIRED")

  const expiresAt = new Date(Math.min(endMs, now.getTime() + VERIFY_TTL_MS)).toISOString()
  const verifiedAt = now.toISOString()

  await admin
    .from("trade_session_verifications")
    .update({ consumed_at: verifiedAt })
    .eq("user_id", userId)
    .eq("trade_session_id", session.id)
    .is("consumed_at", null)

  const { data: row, error } = await admin
    .from("trade_session_verifications")
    .insert({
      user_id: userId,
      trade_session_id: session.id,
      code,
      verified_at: verifiedAt,
      expires_at: expiresAt,
    })
    .select("id,verified_at,expires_at")
    .single()
  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await admin
        .from("trade_session_verifications")
        .select("id,verified_at,expires_at")
        .eq("user_id", userId)
        .eq("trade_session_id", session.id)
        .is("consumed_at", null)
        .maybeSingle()
      if (existing) {
        return {
          verificationId: String(existing.id),
          verifiedAt: String(existing.verified_at),
          expiresAt: String(existing.expires_at),
          session: { id: session.id, startAt: session.startAt, endAt: session.endAt },
        }
      }
    }
    throw new Error(error.message)
  }

  return {
    verificationId: String(row.id),
    verifiedAt: String(row.verified_at),
    expiresAt: String(row.expires_at),
    session: { id: session.id, startAt: session.startAt, endAt: session.endAt },
  }
}

export async function consumeTradeSessionVerification(
  admin: SupabaseClient,
  userId: string,
  verificationId: string,
  codeRaw: string,
): Promise<{
  tradeSessionId: string
  code: string
  startAt: string
  endAt: string
  verifiedAt: string
}> {
  const code = normalizeTradeCode(codeRaw)
  const { data: row, error } = await admin
    .from("trade_session_verifications")
    .select("id,user_id,trade_session_id,code,verified_at,expires_at,consumed_at")
    .eq("id", verificationId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!row || row.consumed_at) throw new Error("VERIFICATION_INVALID")
  if (normalizeTradeCode(String(row.code)) !== code) throw new Error("VERIFICATION_CODE_MISMATCH")
  if (new Date(String(row.expires_at)).getTime() <= Date.now()) throw new Error("VERIFICATION_EXPIRED")

  const { data: ts, error: tsErr } = await admin
    .from("trade_sessions")
    .select("id,code,start_at,end_at,status")
    .eq("id", row.trade_session_id)
    .maybeSingle()
  if (tsErr) throw new Error(tsErr.message)
  if (!ts || ts.status !== "active") throw new Error("CODE_INVALID_OR_EXPIRED")

  const consumedAt = new Date().toISOString()
  const { error: uErr } = await admin
    .from("trade_session_verifications")
    .update({ consumed_at: consumedAt })
    .eq("id", row.id)
    .is("consumed_at", null)
  if (uErr) throw new Error(uErr.message)

  return {
    tradeSessionId: String(ts.id),
    code: String(ts.code),
    startAt: String(ts.start_at),
    endAt: String(ts.end_at),
    verifiedAt: String(row.verified_at),
  }
}
