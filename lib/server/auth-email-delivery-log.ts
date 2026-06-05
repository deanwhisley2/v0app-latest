import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabaseAdmin"

export type AuthEmailChannel =
  | "register"
  | "send_verification"
  | "recovery"
  | "magic_link"
  | "settings"

export type AuthEmailOutcome = "sent" | "deferred" | "failed" | "skipped"

export type AuthEmailDeliveryLogInput = {
  channel: AuthEmailChannel
  outcome: AuthEmailOutcome
  email?: string | null
  userId?: string | null
  errorMessage?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  messageId?: string | null
}

function emailDomain(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase() ?? ""
  if (!trimmed.includes("@")) return null
  return trimmed.split("@")[1]?.slice(0, 120) ?? null
}

/** Structured console + durable row when table exists (best-effort). */
export async function logAuthEmailDeliveryEvent(
  input: AuthEmailDeliveryLogInput,
  admin?: SupabaseClient,
): Promise<void> {
  const payload = {
    ts: new Date().toISOString(),
    channel: input.channel,
    outcome: input.outcome,
    user_id: input.userId ?? null,
    email_domain: emailDomain(input.email),
    error: input.errorMessage?.slice(0, 500) ?? null,
    ip: input.ipAddress ?? null,
    ua: input.userAgent?.slice(0, 200) ?? null,
  }
  console.info("[auth-email]", JSON.stringify(payload))

  try {
    const client = admin ?? createAdminClient()
    const row: Record<string, unknown> = {
      user_id: input.userId ?? null,
      email_domain: payload.email_domain,
      channel: input.channel,
      outcome: input.outcome,
      error_message: payload.error,
      ip_address: payload.ip,
      user_agent: input.userAgent?.slice(0, 500) ?? null,
    }
    if (input.messageId) row.message_id = input.messageId.slice(0, 200)
    let { error } = await client.from("auth_email_delivery_events").insert(row)
    if (error && /message_id|column/i.test(error.message) && input.messageId) {
      const { message_id: _drop, ...withoutMessageId } = row
      ;({ error } = await client.from("auth_email_delivery_events").insert(withoutMessageId))
    }
    if (error && !/relation.*does not exist|auth_email_delivery_events/i.test(error.message)) {
      console.warn("[auth-email] persist:", error.message)
    }
  } catch (e) {
    console.warn("[auth-email] persist:", e instanceof Error ? e.message : String(e))
  }
}

export type AuthEmailHealthWindow = {
  window_hours: number
  registrations_estimate: number
  verification_codes_issued: number
  verification_completions_estimate: number
  delivery_events: {
    sent: number
    deferred: number
    failed: number
    skipped: number
  } | null
  register_send: {
    sent: number
    deferred: number
    failed: number
    skipped: number
  } | null
}

/** Platform health slice — queries durable tables (graceful if migration not applied). */
export async function getAuthEmailHealthStats(windowHours = 24): Promise<AuthEmailHealthWindow> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString()

  const { count: registrationsEstimate } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since)

  const { count: verificationCodesIssued } = await admin
    .from("email_verifications")
    .select("user_id", { count: "exact", head: true })
    .gte("created_at", since)

  const { count: verificationCompletionsEstimate } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_verified", true)
    .gte("updated_at", since)

  const emptyCounts = { sent: 0, deferred: 0, failed: 0, skipped: 0 }
  let deliveryEvents: AuthEmailHealthWindow["delivery_events"] = null
  let registerSend: AuthEmailHealthWindow["register_send"] = null

  const { data: rows, error } = await admin
    .from("auth_email_delivery_events")
    .select("channel, outcome")
    .gte("created_at", since)

  if (!error && rows) {
    deliveryEvents = { ...emptyCounts }
    registerSend = { ...emptyCounts }
    for (const row of rows) {
      const outcome = row.outcome as AuthEmailOutcome
      if (outcome in deliveryEvents) deliveryEvents[outcome] += 1
      if (row.channel === "register" && registerSend && outcome in registerSend) {
        registerSend[outcome] += 1
      }
    }
  }

  return {
    window_hours: windowHours,
    registrations_estimate: registrationsEstimate ?? 0,
    verification_codes_issued: verificationCodesIssued ?? 0,
    verification_completions_estimate: verificationCompletionsEstimate ?? 0,
    delivery_events: deliveryEvents,
    register_send: registerSend,
  }
}
