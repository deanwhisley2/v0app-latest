import type { Metadata } from "next"
import { CampaignPromoLanding } from "@/components/marketing/campaign-promo-landing"
import { buildCampaignPublicUrl } from "@/lib/marketing/campaign-slug"
import { getCampaignBySlug } from "@/lib/server/marketing-campaigns"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { SITE_BRAND } from "@/lib/site-branding"
import { getPublicSiteOrigin } from "@/lib/site-public-url"

type PageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: raw } = await params
  try {
    const admin = createAdminClient()
    const campaign = await getCampaignBySlug(admin, raw)
    if (!campaign) return { title: "Campaign" }
    const url = buildCampaignPublicUrl(getPublicSiteOrigin(), campaign.slug)
    return {
      title: campaign.title,
      description: campaign.description,
      openGraph: {
        title: `${campaign.title} | ${SITE_BRAND.name}`,
        description: campaign.description,
        url,
        siteName: SITE_BRAND.name,
        type: "website",
        images: campaign.banner_url ?? campaign.image_url ? [{ url: campaign.banner_url ?? campaign.image_url! }] : undefined,
      },
    }
  } catch {
    return { title: "Nexus Pro Campaign" }
  }
}

export default async function PromoCampaignPage({ params }: PageProps) {
  const { slug } = await params
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070d] text-foreground">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(15,118,105,0.14),transparent_55%)]"
        aria-hidden
      />
      <div className="relative">
        <CampaignPromoLanding slug={slug} />
      </div>
    </div>
  )
}
