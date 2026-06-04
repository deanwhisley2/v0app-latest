import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { CAMPAIGN_TYPES, type CampaignLanguage, type CampaignType } from "@/lib/marketing/campaign-types"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  campaignShareBundle,
  createMarketingCampaign,
  getCampaignAnalytics,
  refreshCampaignStatuses,
} from "@/lib/server/marketing-campaigns"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"

export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const admin = createAdminClient()
    await refreshCampaignStatuses(admin)

    const { searchParams } = new URL(request.url)
    const filter = searchParams.get("filter") ?? "all"

    let query = admin.from("marketing_campaigns").select("*").order("created_at", { ascending: false })

    if (filter === "active") query = query.eq("status", "active")
    if (filter === "scheduled") query = query.eq("status", "scheduled")

    const { data, error } = await query.limit(100)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const withAnalytics = await Promise.all(
      (data ?? []).map(async (row) => {
        const analytics = await getCampaignAnalytics(admin, row.id as string)
        const share = campaignShareBundle(row as Parameters<typeof campaignShareBundle>[0], request.url)
        return { ...row, analytics, share }
      }),
    )

    return NextResponse.json({ ok: true, campaigns: withAnalytics })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const status = msg.includes("Forbidden") ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const campaign_type = body.campaign_type as CampaignType
    if (!CAMPAIGN_TYPES.includes(campaign_type)) {
      return NextResponse.json({ error: "Invalid campaign_type" }, { status: 400 })
    }

    const title = typeof body.title === "string" ? body.title.trim() : ""
    const description = typeof body.description === "string" ? body.description.trim() : ""
    const start_at = typeof body.start_at === "string" ? body.start_at : ""
    const end_at = typeof body.end_at === "string" ? body.end_at : ""
    const language = body.language === "fr" ? "fr" : ("en" as CampaignLanguage)

    if (!title || !start_at || !end_at) {
      return NextResponse.json({ error: "title, start_at, and end_at are required" }, { status: 400 })
    }

    const country_codes = Array.isArray(body.country_codes)
      ? body.country_codes
          .filter((c): c is string => typeof c === "string")
          .map((c) => c.trim().toUpperCase().slice(0, 2))
          .filter((c) => /^[A-Z]{2}$/.test(c))
      : []

    const admin = createAdminClient()
    const campaign = await createMarketingCampaign(admin, {
      campaign_type,
      title,
      description,
      image_url: typeof body.image_url === "string" ? body.image_url : null,
      banner_url: typeof body.banner_url === "string" ? body.banner_url : null,
      start_at,
      end_at,
      country_codes,
      language,
      created_by: actor.id,
    })

    const share = campaignShareBundle(campaign, request.url)
    const analytics = await getCampaignAnalytics(admin, campaign.id)

    return NextResponse.json({ ok: true, campaign, share, analytics })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const status = msg.includes("Forbidden") ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
