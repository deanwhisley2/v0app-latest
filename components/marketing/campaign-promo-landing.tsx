"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SITE_BRAND } from "@/lib/site-branding"

const VISITOR_KEY = "nexus_promo_vid"

function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(VISITOR_KEY, id)
    return id
  } catch {
    return "anon"
  }
}

type PublicCampaign = {
  slug: string
  title: string
  description: string
  image_url: string | null
  banner_url: string | null
  language: string
  status: string
}

export function CampaignPromoLanding({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true)
  const [campaign, setCampaign] = useState<PublicCampaign | null>(null)
  const [registerUrl, setRegisterUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  const normalizedSlug = useMemo(() => slug.trim().toUpperCase(), [slug])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/marketing/campaigns/${encodeURIComponent(normalizedSlug)}`)
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          campaign?: PublicCampaign
          share?: { registerUrl?: string }
          error?: string
        }
        if (!res.ok || !json.campaign) {
          if (!cancelled) setError(json.error ?? "Campaign not found")
          return
        }
        if (!cancelled) {
          setCampaign(json.campaign)
          setRegisterUrl(json.share?.registerUrl ?? `/auth/register?campaign=${normalizedSlug}`)
        }

        const visitorId = getVisitorId()
        await fetch(`/api/marketing/campaigns/${encodeURIComponent(normalizedSlug)}/track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "view", visitor_id: visitorId }),
        })
      } catch {
        if (!cancelled) setError("Could not load campaign")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [normalizedSlug])

  async function onJoinClick() {
    const visitorId = getVisitorId()
    void fetch(`/api/marketing/campaigns/${encodeURIComponent(normalizedSlug)}/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "click", visitor_id: visitorId }),
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  if (error || !campaign) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-destructive">{error ?? "Campaign unavailable"}</p>
        <Button asChild variant="secondary" className="mt-6">
          <Link href="/auth/register">Create account</Link>
        </Button>
      </div>
    )
  }

  const ended = campaign.status === "ended"
  const banner = campaign.banner_url ?? campaign.image_url

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8 sm:px-6">
      {banner ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={banner}
          alt=""
          className="mb-6 w-full rounded-2xl border border-border object-cover shadow-lg"
        />
      ) : (
        <div
          className="mb-6 rounded-2xl border border-teal-500/30 p-8 text-center shadow-lg"
          style={{
            background: `linear-gradient(160deg, ${SITE_BRAND.themeColor}22, #0b1220)`,
          }}
        >
          <p className="text-sm font-semibold uppercase tracking-widest text-teal-400">
            {SITE_BRAND.name}
          </p>
        </div>
      )}

      <h1 className="text-2xl font-bold tracking-tight text-foreground">{campaign.title}</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{campaign.description}</p>

      <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
        <li>✔ {campaign.language === "fr" ? "Convivial pour débutants" : "Beginner friendly"}</li>
        <li>✔ {campaign.language === "fr" ? "Sessions en temps réel" : "Real-time trade sessions"}</li>
        <li>✔ {campaign.language === "fr" ? "Récompenses de parrainage" : "Referral rewards"}</li>
        <li>✔ {campaign.language === "fr" ? "Retraits sécurisés" : "Secure withdrawals"}</li>
      </ul>

      <div className="mt-8 space-y-3">
        {ended ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            This campaign has ended. You can still register for {SITE_BRAND.name}.
          </p>
        ) : null}
        <Button asChild className="min-h-12 w-full text-base font-semibold">
          <Link href={registerUrl} onClick={() => void onJoinClick()}>
            {campaign.language === "fr" ? "Créer mon compte" : "Create my account"}
          </Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11 w-full">
          <Link href="/auth/login">{campaign.language === "fr" ? "Se connecter" : "Sign in"}</Link>
        </Button>
      </div>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        {SITE_BRAND.name} · Campaign {campaign.slug}
      </p>
    </div>
  )
}
