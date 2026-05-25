import type { SupabaseClient } from "@supabase/supabase-js"

/** Optional Web Push via VAPID — no-op when keys or web-push module unavailable. */
export async function sendWebPushToUser(
  admin: SupabaseClient,
  params: {
    userId: string
    title: string
    body: string
    tag?: string
    url?: string
  },
): Promise<void> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return

  const { data: subs, error } = await admin
    .from("nexus_push_subscriptions")
    .select("endpoint,p256dh,auth_secret")
    .eq("user_id", params.userId)
    .limit(20)
  if (error || !subs?.length) return

  let webpush: typeof import("web-push") | null = null
  try {
    webpush = await import("web-push")
    webpush.setVapidDetails("mailto:esknexuspro@gmail.com", publicKey, privateKey)
  } catch {
    return
  }

  const payload = JSON.stringify({
    title: params.title,
    body: params.body.slice(0, 240),
    tag: params.tag,
    url: params.url ?? "/dashboard",
  })

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush!.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth_secret },
          },
          payload,
        )
      } catch {
        /* expired subscription — ignore */
      }
    }),
  )
}

const APPROVED_RE = /\b(approved|credited|deposit credited)\b/i
const REJECTED_RE = /\b(rejected|declined|denied)\b/i

/** Users: push only for approved/rejected funding or withdrawal outcomes. */
export function isCustomerFundingPushHeadline(headline: string): boolean {
  const h = headline.trim()
  if (!APPROVED_RE.test(h) && !REJECTED_RE.test(h)) return false
  if (/\bprocessing\b/i.test(h) && !APPROVED_RE.test(h) && !REJECTED_RE.test(h)) return false
  if (/\bheld\b|\breview\b|\bsubmitted\b/i.test(h) && !APPROVED_RE.test(h) && !REJECTED_RE.test(h)) {
    return false
  }
  return true
}

export async function notifyUserPushIfAllowed(
  admin: SupabaseClient,
  params: { userId: string; title: string; body: string; tag?: string; url?: string; headline?: string },
): Promise<void> {
  if (params.headline && !isCustomerFundingPushHeadline(params.headline)) return
  await sendWebPushToUser(admin, params)
}

export async function notifyAdminsPush(
  admin: SupabaseClient,
  params: { title: string; body: string; tag?: string; url?: string },
): Promise<void> {
  const { data: admins, error } = await admin.from("profiles").select("id").eq("trading_user_level", 5).limit(500)
  if (error) return
  for (const row of admins ?? []) {
    await sendWebPushToUser(admin, {
      userId: row.id,
      title: params.title,
      body: params.body,
      tag: params.tag,
      url: params.url ?? "/dashboard",
    })
  }
}

export async function notifyRetailersPushForCountry(
  admin: SupabaseClient,
  params: { countryCode: string; title: string; body: string; tag?: string },
): Promise<void> {
  const cc = params.countryCode.trim().toUpperCase().slice(0, 2)
  if (!cc) return
  const { data: retailers, error } = await admin
    .from("retailer_profiles")
    .select("user_id")
    .eq("country_code", cc)
    .eq("liquidity_status", "active")
    .limit(200)
  if (error) return
  for (const r of retailers ?? []) {
    if (r.user_id) {
      await sendWebPushToUser(admin, {
        userId: r.user_id as string,
        title: params.title,
        body: params.body,
        tag: params.tag,
        url: "/dashboard",
      })
    }
  }
}
