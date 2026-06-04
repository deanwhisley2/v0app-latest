export const CAMPAIGN_TYPES = [
  "welcome",
  "startup_capital",
  "referral",
  "trading_session",
  "weekend",
  "performance",
  "custom",
] as const

export type CampaignType = (typeof CAMPAIGN_TYPES)[number]

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  welcome: "Welcome Campaign",
  startup_capital: "Startup Capital Campaign",
  referral: "Referral Campaign",
  trading_session: "Trading Session Campaign",
  weekend: "Weekend Campaign",
  performance: "Performance Campaign",
  custom: "Custom Campaign",
}

export const CAMPAIGN_LANGUAGES = ["en", "fr"] as const
export type CampaignLanguage = (typeof CAMPAIGN_LANGUAGES)[number]

export type MarketingCampaignRow = {
  id: string
  slug: string
  campaign_type: CampaignType
  title: string
  description: string
  image_url: string | null
  banner_url: string | null
  start_at: string
  end_at: string
  country_codes: string[]
  language: CampaignLanguage
  status: "draft" | "scheduled" | "active" | "ended"
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CampaignAnalytics = {
  views: number
  clicks: number
  registrations: number
  firstDeposits: number
  referralConversions: number
  conversionRatePct: number
}
