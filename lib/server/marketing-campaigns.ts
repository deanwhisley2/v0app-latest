import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  buildFacebookSharePost,
  buildWhatsAppSharePost,
} from "@/lib/marketing/campaign-share-copy"
import { buildCampaignPublicUrl, generateCampaignSlug } from "@/lib/marketing/campaign-slug"
import type {
  CampaignAnalytics,
  CampaignLanguage,
  CampaignType,
  MarketingCampaignRow,
} from "@/lib/marketing/campaign-types"
import { getPublicSiteOrigin } from "@/lib/site-public-url"

export function computeCampaignStatus(
  startAt: string,
  endAt: string,
  now = Date.now(),
): "scheduled" | "active" | "ended" {
  const start = new Date(startAt).getTime()
  const end = new Date(endAt).getTime()
  if (now < start) return "scheduled"
  if (now > end) return "ended"
  return "active"
}

export async function refreshCampaignStatuses(admin: SupabaseClient): Promise<void> {
  const { data: rows, error } = await admin.from("marketing_campaigns").select("id,start_at,end_at,status")
  if (error || !rows?.length) return
  const now = Date.now()
  for (const row of rows) {
    const next = computeCampaignStatus(row.start_at as string, row.end_at as string, now)
    if (row.status === "draft") continue
    if (row.status !== next) {
      await admin
        .from("marketing_campaigns")
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq("id", row.id)
    }
  }
}

export async function getCampaignBySlug(
  admin: SupabaseClient,
  slug: string,
): Promise<MarketingCampaignRow | null> {
  const { data, error } = await admin
    .from("marketing_campaigns")
    .select("*")
    .eq("slug", slug.toUpperCase())
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as MarketingCampaignRow | null) ?? null
}

export async function recordCampaignEvent(params: {
  campaignId: string
  eventType: "view" | "click" | "registration" | "first_deposit" | "referral_conversion"
  visitorId?: string | null
  userId?: string | null
  source?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("marketing_campaign_events").insert({
    campaign_id: params.campaignId,
    event_type: params.eventType,
    visitor_id: params.visitorId ?? null,
    user_id: params.userId ?? null,
    source: params.source ?? "promo",
    metadata: params.metadata ?? {},
  })
  if (error) throw new Error(error.message)
}

export async function attributeRegistrationToCampaign(params: {
  userId: string
  campaignSlug: string
}): Promise<void> {
  const admin = createAdminClient()
  const campaign = await getCampaignBySlug(admin, params.campaignSlug)
  if (!campaign) return

  const { error: profErr } = await admin
    .from("profiles")
    .update({
      registration_campaign_id: campaign.id,
      registration_campaign_slug: campaign.slug,
      registration_campaign_source: "promo_link",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.userId)
  if (profErr) {
    console.warn("[campaign] profile attribution:", profErr.message)
    return
  }

  await recordCampaignEvent({
    campaignId: campaign.id,
    eventType: "registration",
    userId: params.userId,
    source: "register",
  })

  const { data: prof } = await admin
    .from("profiles")
    .select("referred_by")
    .eq("id", params.userId)
    .maybeSingle()
  if (prof?.referred_by) {
    await recordCampaignEvent({
      campaignId: campaign.id,
      eventType: "referral_conversion",
      userId: params.userId,
      source: "register",
    })
  }
}

export async function getCampaignAnalytics(
  admin: SupabaseClient,
  campaignId: string,
): Promise<CampaignAnalytics> {
  const counts: CampaignAnalytics = {
    views: 0,
    clicks: 0,
    registrations: 0,
    firstDeposits: 0,
    referralConversions: 0,
    conversionRatePct: 0,
  }

  const types = ["view", "click", "registration", "first_deposit", "referral_conversion"] as const
  for (const eventType of types) {
    const { count, error } = await admin
      .from("marketing_campaign_events")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("event_type", eventType)
    if (error) continue
    const n = count ?? 0
    if (eventType === "view") counts.views = n
    if (eventType === "click") counts.clicks = n
    if (eventType === "registration") counts.registrations = n
    if (eventType === "first_deposit") counts.firstDeposits = n
    if (eventType === "referral_conversion") counts.referralConversions = n
  }

  const denom = counts.clicks > 0 ? counts.clicks : counts.views
  counts.conversionRatePct =
    denom > 0 ? Math.round((counts.registrations / denom) * 1000) / 10 : 0

  return counts
}

export function campaignShareBundle(
  campaign: MarketingCampaignRow,
  requestUrl?: string,
) {
  const siteOrigin = getPublicSiteOrigin(requestUrl)
  const input = { campaign, siteOrigin }
  return {
    campaignUrl: buildCampaignPublicUrl(siteOrigin, campaign.slug),
    registerUrl: `${siteOrigin.replace(/\/$/, "")}/auth/register?campaign=${encodeURIComponent(campaign.slug)}`,
    whatsappPost: buildWhatsAppSharePost(input),
    facebookPost: buildFacebookSharePost(input),
  }
}

export type CreateCampaignInput = {
  campaign_type: CampaignType
  title: string
  description: string
  image_url?: string | null
  banner_url?: string | null
  start_at: string
  end_at: string
  country_codes?: string[]
  language: CampaignLanguage
  created_by: string
}

export async function createMarketingCampaign(
  admin: SupabaseClient,
  input: CreateCampaignInput,
): Promise<MarketingCampaignRow> {
  let slug = generateCampaignSlug()
  for (let attempt = 0; attempt < 8; attempt++) {
    const status = computeCampaignStatus(input.start_at, input.end_at)
    const { data, error } = await admin
      .from("marketing_campaigns")
      .insert({
        slug: attempt === 0 ? slug : generateCampaignSlug(),
        campaign_type: input.campaign_type,
        title: input.title.trim(),
        description: input.description.trim(),
        image_url: input.image_url?.trim() || null,
        banner_url: input.banner_url?.trim() || null,
        start_at: input.start_at,
        end_at: input.end_at,
        country_codes: input.country_codes ?? [],
        language: input.language,
        status,
        created_by: input.created_by,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single()
    if (!error && data) return data as MarketingCampaignRow
    const msg = (error?.message ?? "").toLowerCase()
    if (!msg.includes("unique") && !msg.includes("duplicate")) {
      throw new Error(error?.message ?? "Could not create campaign")
    }
    slug = generateCampaignSlug()
  }
  throw new Error("Could not allocate unique campaign slug")
}
