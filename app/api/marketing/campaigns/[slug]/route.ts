import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { campaignShareBundle, getCampaignBySlug, refreshCampaignStatuses } from "@/lib/server/marketing-campaigns"

type RouteCtx = { params: Promise<{ slug: string }> }

/** Public campaign payload for /promo/[slug] */
export async function GET(request: Request, ctx: RouteCtx) {
  try {
    const { slug: raw } = await ctx.params
    const slug = raw.trim().toUpperCase()
    const admin = createAdminClient()
    await refreshCampaignStatuses(admin)

    const campaign = await getCampaignBySlug(admin, slug)
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    const share = campaignShareBundle(campaign, request.url)

    return NextResponse.json({
      ok: true,
      campaign: {
        slug: campaign.slug,
        campaign_type: campaign.campaign_type,
        title: campaign.title,
        description: campaign.description,
        image_url: campaign.image_url,
        banner_url: campaign.banner_url,
        start_at: campaign.start_at,
        end_at: campaign.end_at,
        country_codes: campaign.country_codes,
        language: campaign.language,
        status: campaign.status,
      },
      share: {
        campaignUrl: share.campaignUrl,
        registerUrl: share.registerUrl,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
