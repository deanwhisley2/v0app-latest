import type { Metadata } from "next"
import { NexusTradeSignalCard } from "@/components/marketing/nexus-trade-signal-card"
import { normalizeTradeCode } from "@/lib/nexus-bot/trade-code"
import { buildTradeSignalShareUrl } from "@/lib/nexus-bot/trade-signal-share"
import { resolvePublicTradeSignal } from "@/lib/server/trade-signal-public"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { SITE_BRAND } from "@/lib/site-branding"

type PageProps = {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code: raw } = await params
  const code = normalizeTradeCode(raw)
  try {
    const admin = createAdminClient()
    const signal = await resolvePublicTradeSignal(admin, code)
    const title =
      signal.state === "active"
        ? `${signal.sessionLabel ?? "Trade Signal"} · ${code}`
        : signal.headline
    return {
      title,
      description: signal.detail,
      openGraph: {
        title: `${title} | ${SITE_BRAND.name}`,
        description: signal.detail,
        url: buildTradeSignalShareUrl(code),
        siteName: SITE_BRAND.name,
        type: "website",
      },
    }
  } catch {
    return {
      title: "Trade Signal",
      description: "Nexus Pro trade signal portal",
    }
  }
}

export default async function TradeSignalSharePage({ params }: PageProps) {
  const { code: raw } = await params
  const admin = createAdminClient()
  const signal = await resolvePublicTradeSignal(admin, raw)

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070d] text-foreground">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(15,118,105,0.12),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10 sm:px-6">
        <NexusTradeSignalCard signal={signal} />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {SITE_BRAND.name} · Institutional trade signal distribution
        </p>
      </div>
    </div>
  )
}
