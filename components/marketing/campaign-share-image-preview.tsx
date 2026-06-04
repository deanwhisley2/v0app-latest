"use client"

import type { CampaignLanguage } from "@/lib/marketing/campaign-types"
import { SITE_BRAND } from "@/lib/site-branding"

type Variant = "story" | "facebook" | "whatsapp"

const VARIANT_CLASS: Record<Variant, string> = {
  story: "aspect-[9/16] max-w-[220px]",
  whatsapp: "aspect-[9/16] max-w-[220px]",
  facebook: "aspect-[1200/630] max-w-full",
}

export function CampaignShareImagePreview({
  title,
  description,
  variant,
  language,
  imageUrl,
}: {
  title: string
  description: string
  variant: Variant
  language: CampaignLanguage
  imageUrl?: string | null
}) {
  const cta =
    language === "fr" ? "Rejoindre Nexus Pro" : "Join Nexus Pro"

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border shadow-lg ${VARIANT_CLASS[variant]}`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(145deg, ${SITE_BRAND.themeColor} 0%, #0b1220 55%, #05070d 100%)`,
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      <div className="relative flex h-full flex-col justify-end p-4 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-teal-200/90">
          {SITE_BRAND.name}
        </p>
        <h3 className="mt-1 text-base font-bold leading-tight sm:text-lg">{title}</h3>
        <p className="mt-2 line-clamp-3 text-xs text-white/85">{description}</p>
        <p className="mt-3 inline-flex w-fit rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold">
          {cta}
        </p>
      </div>
    </div>
  )
}
