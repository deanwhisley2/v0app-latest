import type { CampaignLanguage, CampaignType, MarketingCampaignRow } from "@/lib/marketing/campaign-types"
import { buildCampaignPublicUrl } from "@/lib/marketing/campaign-slug"

type ShareInput = {
  campaign: Pick<MarketingCampaignRow, "title" | "description" | "slug" | "campaign_type" | "language">
  siteOrigin: string
}

function typeHook(type: CampaignType, lang: CampaignLanguage): string {
  const en: Record<CampaignType, string> = {
    welcome: "Receive startup capital instantly after successful registration.",
    startup_capital: "Receive startup capital instantly after successful registration.",
    referral: "Invite friends and earn referral rewards on every valid signup.",
    trading_session: "Join live Nexus trade sessions with real-time market intelligence.",
    weekend: "Weekend trading window — limited-time community access.",
    performance: "Track performance and grow with the Nexus Pro community.",
    custom: "",
  }
  const fr: Record<CampaignType, string> = {
    welcome: "Recevez du capital de démarrage après une inscription réussie.",
    startup_capital: "Capital de démarrage instantané après inscription validée.",
    referral: "Parrainez vos amis et gagnez des récompenses de parrainage.",
    trading_session: "Rejoignez les sessions de trading Nexus en direct.",
    weekend: "Fenêtre de trading week-end — accès communauté limité.",
    performance: "Suivez vos performances avec la communauté Nexus Pro.",
    custom: "",
  }
  const hook = (lang === "fr" ? fr : en)[type]
  return hook
}

export function buildWhatsAppSharePost(input: ShareInput): string {
  const { campaign, siteOrigin } = input
  const url = buildCampaignPublicUrl(siteOrigin, campaign.slug)
  const lang = campaign.language
  const hook =
    campaign.description.trim() ||
    typeHook(campaign.campaign_type, lang) ||
    (lang === "fr"
      ? "Plateforme de trading crypto institutionnelle."
      : "Institutional crypto trading platform.")

  if (lang === "fr") {
    return [
      "🚀 COMMUNAUTÉ NEXUS PRO TRADING",
      "",
      campaign.title,
      "",
      hook,
      "",
      "✔ Convivial pour débutants",
      "✔ Sessions de trading en temps réel",
      "✔ Récompenses de parrainage",
      "✔ Retraits sécurisés",
      "",
      "Rejoignez ici :",
      "",
      url,
    ].join("\n")
  }

  return [
    "🚀 NEXUS PRO TRADING COMMUNITY",
    "",
    campaign.title,
    "",
    hook,
    "",
    "✔ Beginner friendly",
    "✔ Real-time trade sessions",
    "✔ Referral rewards",
    "✔ Secure withdrawals",
    "",
    "Join here:",
    "",
    url,
  ].join("\n")
}

export function buildFacebookSharePost(input: ShareInput): string {
  const { campaign, siteOrigin } = input
  const url = buildCampaignPublicUrl(siteOrigin, campaign.slug)
  const lang = campaign.language
  const hook =
    campaign.description.trim() ||
    typeHook(campaign.campaign_type, lang)

  if (lang === "fr") {
    return [
      `📢 ${campaign.title}`,
      "",
      hook,
      "",
      "Nexus Pro combine intelligence de marché en temps réel, sessions de trading guidées et une infrastructure de retrait sécurisée — conçue pour les traders qui veulent une expérience professionnelle sur mobile.",
      "",
      "✅ Inscription simple",
      "✅ Capital de démarrage pour les nouveaux membres éligibles",
      "✅ Programme de parrainage",
      "✅ Support humain",
      "",
      `👉 Rejoindre la campagne : ${url}`,
      "",
      "#NexusPro #Trading #Crypto #Communauté",
    ].join("\n")
  }

  return [
    `📢 ${campaign.title}`,
    "",
    hook,
    "",
    "Nexus Pro brings together real-time market intelligence, guided trade sessions, and secure withdrawal infrastructure — built for traders who want a professional mobile-first experience.",
    "",
    "✅ Simple onboarding",
    "✅ Startup capital for eligible new members",
    "✅ Referral program",
    "✅ Human support desk",
    "",
    `👉 Join the campaign: ${url}`,
    "",
    "#NexusPro #Trading #Crypto #Community",
  ].join("\n")
}
