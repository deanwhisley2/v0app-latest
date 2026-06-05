/**
 * Optional Brevo REST stats — requires BREVO_API_KEY (xkeysib…) on the server.
 * SMTP relay alone does not expose deferrals/bounces; ops should also review app.brevo.com logs.
 */

export type BrevoTransactionalStats = {
  configured: boolean
  window_hours: number
  fetched_at: string | null
  error: string | null
  smtp: {
    delivered?: number
    soft_bounces?: number
    hard_bounces?: number
    blocked?: number
    complaints?: number
    opens?: number
    clicks?: number
  } | null
  note: string
}

export async function fetchBrevoTransactionalStats(
  windowHours = 24,
): Promise<BrevoTransactionalStats> {
  const apiKey = process.env.BREVO_API_KEY?.trim() || process.env.BREVO_REST_API_KEY?.trim()
  if (!apiKey) {
    return {
      configured: false,
      window_hours: windowHours,
      fetched_at: null,
      error: null,
      smtp: null,
      note:
        "Set BREVO_API_KEY on the server to pull Brevo deferrals, bounces, and complaints into this dashboard. Review transactional logs at app.brevo.com in the meantime.",
    }
  }

  const end = new Date()
  const start = new Date(end.getTime() - windowHours * 3600 * 1000)
  const qs = new URLSearchParams({
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  })

  try {
    const res = await fetch(`https://api.brevo.com/v3/smtp/statistics/aggregatedReport?${qs}`, {
      headers: { "api-key": apiKey, accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return {
        configured: true,
        window_hours: windowHours,
        fetched_at: new Date().toISOString(),
        error: `Brevo API ${res.status}: ${body.slice(0, 200)}`,
        smtp: null,
        note: "Brevo API request failed — check API key permissions (SMTP statistics).",
      }
    }
    const data = (await res.json()) as Record<string, number>
    return {
      configured: true,
      window_hours: windowHours,
      fetched_at: new Date().toISOString(),
      error: null,
      smtp: {
        delivered: data.delivered,
        soft_bounces: data.softBounces,
        hard_bounces: data.hardBounces,
        blocked: data.blocked,
        complaints: data.complaints,
        opens: data.opens,
        clicks: data.clicks,
      },
      note: "Brevo aggregated SMTP report for the date window (UTC days). Pair with per-message logs in Brevo for deferrals.",
    }
  } catch (e) {
    return {
      configured: true,
      window_hours: windowHours,
      fetched_at: new Date().toISOString(),
      error: e instanceof Error ? e.message : String(e),
      smtp: null,
      note: "Could not reach Brevo API.",
    }
  }
}
