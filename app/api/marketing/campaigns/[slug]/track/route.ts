import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getCampaignBySlug, recordCampaignEvent } from "@/lib/server/marketing-campaigns"

type RouteCtx = { params: Promise<{ slug: string }> }

export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const { slug: raw } = await ctx.params
    const body = (await request.json().catch(() => ({}))) as {
      event?: string
      visitor_id?: string
    }
    const eventType = body.event === "click" ? "click" : "view"
    const visitorId =
      typeof body.visitor_id === "string" && body.visitor_id.trim()
        ? body.visitor_id.trim().slice(0, 64)
        : null

    const admin = createAdminClient()
    const campaign = await getCampaignBySlug(admin, raw)
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    if (campaign.status === "ended") {
      return NextResponse.json({ ok: true, ignored: true })
    }

    await recordCampaignEvent({
      campaignId: campaign.id,
      eventType,
      visitorId,
      source: "promo",
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
