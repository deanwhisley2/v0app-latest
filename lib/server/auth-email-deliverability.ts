import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  getAuthEmailHealthStats,
  type AuthEmailHealthWindow,
} from "@/lib/server/auth-email-delivery-log"
import { fetchBrevoTransactionalStats } from "@/lib/server/brevo-transactional-stats"
import {
  transactionalSenderFromEnv,
  NEXUS_SECURITY_EMAIL,
  NEXUS_SUPPORT_EMAIL,
} from "@/lib/server/transactional-sender"

export type DeliveryLatencyRating = "excellent" | "acceptable" | "investigate" | "insufficient_data"

export type AuthEmailDeliverabilityDashboard = AuthEmailHealthWindow & {
  window_hours: number
  sender_identity: {
    from_email: string
    from_name: string
    reply_to: string
    recommended_from: string
    recommended_reply_to: string
  }
  pipeline: {
    emails_accepted_by_provider: number
    emails_deferred: number
    emails_failed_generation: number
    resend_requests: number
    verification_completions: number
    profiles_without_code_after_signup: number
  }
  latency: {
    sample_count: number
    average_seconds: number | null
    p50_seconds: number | null
    rating: DeliveryLatencyRating
    targets: { excellent_under_seconds: 30; acceptable_under_seconds: 60; investigate_over_seconds: 120 }
  }
  domain_breakdown: Array<{ domain: string; accepted: number; deferred: number; failed: number }>
  brevo: Awaited<ReturnType<typeof fetchBrevoTransactionalStats>>
}

function latencyRating(avgSeconds: number | null): DeliveryLatencyRating {
  if (avgSeconds == null) return "insufficient_data"
  if (avgSeconds < 30) return "excellent"
  if (avgSeconds < 60) return "acceptable"
  if (avgSeconds >= 120) return "investigate"
  return "acceptable"
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx] ?? null
}

/** Level-5 ops slice — registrations, sends, completions, latency proxy, optional Brevo stats. */
export async function getAuthEmailDeliverabilityDashboard(
  windowHours = 24,
): Promise<AuthEmailDeliverabilityDashboard> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString()
  const base = await getAuthEmailHealthStats(windowHours)
  const sender = transactionalSenderFromEnv()

  const { data: events } = await admin
    .from("auth_email_delivery_events")
    .select("channel, outcome, email_domain, created_at")
    .gte("created_at", since)

  let accepted = 0
  let deferred = 0
  let failed = 0
  let resendRequests = 0
  const domainMap = new Map<string, { accepted: number; deferred: number; failed: number }>()

  for (const row of events ?? []) {
    const domain = String(row.email_domain ?? "unknown")
    const bucket = domainMap.get(domain) ?? { accepted: 0, deferred: 0, failed: 0 }
    if (row.outcome === "sent") {
      accepted += 1
      bucket.accepted += 1
    } else if (row.outcome === "deferred") {
      deferred += 1
      bucket.deferred += 1
    } else if (row.outcome === "failed") {
      failed += 1
      bucket.failed += 1
    }
    if (row.channel === "send_verification") resendRequests += 1
    domainMap.set(domain, bucket)
  }

  const { count: verificationCompletions } = await admin
    .from("signup_corridor_events")
    .select("id", { count: "exact", head: true })
    .eq("action", "verify_code")
    .gte("created_at", since)

  const { data: recentProfiles } = await admin
    .from("profiles")
    .select("id, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100)

  const latencies: number[] = []
  let profilesWithoutCode = 0

  for (const p of recentProfiles ?? []) {
    const { data: auth } = await admin.auth.admin.getUserById(p.id)
    const email = auth.user?.email ?? ""
    if (!email.includes("@") || email.includes("@accounts.nexuspro.it.com")) continue

    const { data: codeRow } = await admin
      .from("email_verifications")
      .select("created_at")
      .eq("user_id", p.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!codeRow?.created_at) {
      profilesWithoutCode += 1
      continue
    }

    const deltaSec =
      (new Date(codeRow.created_at).getTime() - new Date(p.created_at).getTime()) / 1000
    if (Number.isFinite(deltaSec) && deltaSec >= 0 && deltaSec < 600) latencies.push(deltaSec)
  }

  latencies.sort((a, b) => a - b)
  const avg =
    latencies.length > 0
      ? Math.round((latencies.reduce((s, v) => s + v, 0) / latencies.length) * 10) / 10
      : null

  const brevo = await fetchBrevoTransactionalStats(windowHours)

  return {
    ...base,
    window_hours: windowHours,
    sender_identity: {
      from_email: sender.fromEmail,
      from_name: sender.fromName,
      reply_to: sender.replyToEmail,
      recommended_from: NEXUS_SECURITY_EMAIL,
      recommended_reply_to: NEXUS_SUPPORT_EMAIL,
    },
    pipeline: {
      emails_accepted_by_provider: accepted,
      emails_deferred: deferred,
      emails_failed_generation: failed,
      resend_requests: resendRequests,
      verification_completions: verificationCompletions ?? 0,
      profiles_without_code_after_signup: profilesWithoutCode,
    },
    latency: {
      sample_count: latencies.length,
      average_seconds: avg,
      p50_seconds: percentile(latencies, 50),
      rating: latencyRating(avg),
      targets: {
        excellent_under_seconds: 30,
        acceptable_under_seconds: 60,
        investigate_over_seconds: 120,
      },
    },
    domain_breakdown: [...domainMap.entries()]
      .map(([domain, counts]) => ({ domain, ...counts }))
      .sort((a, b) => b.accepted - a.accepted),
    brevo,
  }
}
