import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeTradeCode } from "@/lib/nexus-bot/trade-code"
import { diagnoseTradeSessionCode } from "@/lib/server/trade-sessions"

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
  const diagnosis = await diagnoseTradeSessionCode(admin, code)
  if (!diagnosis.ok) throw new Error(diagnosis.reason)
  const session = diagnosis.session

  const now = new Date()
  const endMs = new Date(session.endAt).getTime()
  if (endMs <= now.getTime()) throw new Error("SESSION_EXPIRED")

  // Valid through session end so users can pre-book hours before start.
  const expiresAt = new Date(endMs).toISOString()
  const verifiedAt = now.toISOString()

  await admin
    .from("trade_session_verifications")
    .update({ consumed_at: verifiedAt })
    .eq("user_id", userId)
    .eq("trade_session_id", session.id)
    .is("consumed_at", null)

  const { data: existingOpen } = await admin
    .from("trade_session_verifications")
    .select("id,verified_at,expires_at")
    .eq("user_id", userId)
    .eq("trade_session_id", session.id)
    .is("consumed_at", null)
    .maybeSingle()

  if (existingOpen) {
    const { data: refreshed, error: refreshErr } = await admin
      .from("trade_session_verifications")
      .update({ verified_at: verifiedAt, expires_at: expiresAt, code })
      .eq("id", existingOpen.id)
      .select("id,verified_at,expires_at")
      .single()
    if (refreshErr) throw new Error(refreshErr.message)
    return {
      verificationId: String(refreshed.id),
      verifiedAt: String(refreshed.verified_at),
      expiresAt: String(refreshed.expires_at),
      session: { id: session.id, startAt: session.startAt, endAt: session.endAt },
    }
  }

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

  const { data: ts, error: tsErr } = await admin
    .from("trade_sessions")
    .select("id,code,start_at,end_at,status")
    .eq("id", row.trade_session_id)
    .maybeSingle()
  if (tsErr) throw new Error(tsErr.message)
  if (!ts || ts.status !== "active") throw new Error("CODE_INVALID_OR_EXPIRED")

  const endMs = new Date(String(ts.end_at)).getTime()
  if (endMs <= Date.now()) throw new Error("SESSION_EXPIRED")

  const consumedAt = new Date().toISOString()
  const { error: uErr } = await admin
    .from("trade_session_verifications")
    .update({
      consumed_at: consumedAt,
      expires_at: String(ts.end_at),
    })
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
