"use client"

import { useCallback, useEffect, useState } from "react"
import { Copy, Loader2, Megaphone, RefreshCw } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import {
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_TYPES,
  type CampaignType,
} from "@/lib/marketing/campaign-types"
import { CampaignShareImagePreview } from "@/components/marketing/campaign-share-image-preview"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type CampaignAnalytics = {
  views: number
  clicks: number
  registrations: number
  firstDeposits: number
  referralConversions: number
  conversionRatePct: number
}

type CampaignRow = {
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
  language: "en" | "fr"
  status: string
  analytics?: CampaignAnalytics
  share?: {
    campaignUrl: string
    registerUrl: string
    whatsappPost: string
    facebookPost: string
  }
}

async function adminHeaders(): Promise<HeadersInit | null> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(v: string): string {
  if (!v) return new Date().toISOString()
  return new Date(v).toISOString()
}

export function AdminPromotionsPanel() {
  const [section, setSection] = useState<"generate" | "active" | "scheduled" | "analytics">("generate")
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [created, setCreated] = useState<CampaignRow | null>(null)

  const [campaignType, setCampaignType] = useState<CampaignType>("startup_capital")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [bannerUrl, setBannerUrl] = useState("")
  const [startAt, setStartAt] = useState(toLocalInput(new Date().toISOString()))
  const [endAt, setEndAt] = useState(
    toLocalInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()),
  )
  const [countries, setCountries] = useState("")
  const [language, setLanguage] = useState<"en" | "fr">("en")
  const [submitting, setSubmitting] = useState(false)

  const loadCampaigns = useCallback(async (filter: string) => {
    setLoading(true)
    setMsg(null)
    try {
      const headers = await adminHeaders()
      if (!headers) {
        setMsg("Sign in required")
        return
      }
      const res = await fetch(`/api/admin/marketing-campaigns?filter=${filter}`, { headers })
      const json = (await res.json().catch(() => ({}))) as {
        campaigns?: CampaignRow[]
        error?: string
      }
      if (!res.ok) {
        setMsg(json.error ?? "Could not load campaigns")
        return
      }
      setCampaigns(json.campaigns ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (section === "generate") return
    const filter = section === "active" ? "active" : section === "scheduled" ? "scheduled" : "all"
    void loadCampaigns(filter)
  }, [section, loadCampaigns])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setMsg(null)
    setCreated(null)
    try {
      const headers = await adminHeaders()
      if (!headers) {
        setMsg("Sign in required")
        return
      }
      const country_codes = countries
        .split(/[,\s]+/)
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c))

      const res = await fetch("/api/admin/marketing-campaigns", {
        method: "POST",
        headers,
        body: JSON.stringify({
          campaign_type: campaignType,
          title,
          description,
          image_url: imageUrl.trim() || null,
          banner_url: bannerUrl.trim() || null,
          start_at: fromLocalInput(startAt),
          end_at: fromLocalInput(endAt),
          country_codes,
          language,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        campaign?: CampaignRow
        share?: CampaignRow["share"]
        error?: string
      }
      if (!res.ok || !json.campaign) {
        setMsg(json.error ?? "Could not create campaign")
        return
      }
      const row = { ...json.campaign, share: json.share }
      setCreated(row)
      setMsg(`Campaign created: ${row.slug}`)
      setSection("analytics")
      void loadCampaigns("all")
    } finally {
      setSubmitting(false)
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setMsg(`${label} copied`)
    } catch {
      setMsg("Copy failed")
    }
  }

  const previewCampaign = created ?? campaigns[0] ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Megaphone className="h-5 w-5 text-primary" />
        Promotions
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["generate", "Generate Campaign"],
            ["active", "Active Campaigns"],
            ["scheduled", "Scheduled Campaigns"],
            ["analytics", "Campaign Analytics"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              section === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
        {section !== "generate" ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadCampaigns(section === "scheduled" ? "scheduled" : section === "active" ? "active" : "all")}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {msg ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">{msg}</p>
      ) : null}

      {section === "generate" ? (
        <Card className="border-border bg-card p-4 sm:p-6">
          <form className="space-y-4" onSubmit={(e) => void handleCreate(e)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Campaign type</Label>
                <select
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={campaignType}
                  onChange={(e) => setCampaignType(e.target.value as CampaignType)}
                >
                  {CAMPAIGN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CAMPAIGN_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Campaign title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Banner image URL (optional)</Label>
                <Input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://…" />
              </div>
              <div className="space-y-2">
                <Label>Extra image URL (optional)</Label>
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
              </div>
              <div className="space-y-2">
                <Label>Start</Label>
                <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Country targeting (ISO2, comma-separated, empty = all)</Label>
                <Input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="KE, UG" />
              </div>
              <div className="space-y-2">
                <Label>Language</Label>
                <select
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "en" | "fr")}
                >
                  <option value="en">English</option>
                  <option value="fr">French</option>
                </select>
              </div>
            </div>
            <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create campaign & generate share assets"
              )}
            </Button>
          </form>
        </Card>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : null}

      {(section === "active" || section === "scheduled") && !loading ? (
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No campaigns in this list.</p>
          ) : (
            campaigns.map((c) => (
              <Card key={c.id} className="border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.slug} · {c.status} · {CAMPAIGN_TYPE_LABELS[c.campaign_type]}
                    </p>
                  </div>
                  {c.share?.campaignUrl ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => void copyText(c.share!.campaignUrl, "Link")}>
                      <Copy className="me-1 h-3 w-3" />
                      Copy link
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))
          )}
        </div>
      ) : null}

      {(section === "analytics" || created) && previewCampaign ? (
        <div className="space-y-4">
          {created ? (
            <Card className="border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="font-semibold text-foreground">Campaign ready in under 30 seconds</p>
              <p className="mt-1 break-all text-sm text-primary">{created.share?.campaignUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" onClick={() => void copyText(created.share?.whatsappPost ?? "", "WhatsApp post")}>
                  <Copy className="me-2 h-4 w-4" />
                  Copy WhatsApp post
                </Button>
                <Button type="button" variant="secondary" onClick={() => void copyText(created.share?.facebookPost ?? "", "Facebook post")}>
                  <Copy className="me-2 h-4 w-4" />
                  Copy Facebook post
                </Button>
                <Button type="button" variant="outline" onClick={() => void copyText(created.share?.campaignUrl ?? "", "Campaign URL")}>
                  Copy campaign URL
                </Button>
              </div>
            </Card>
          ) : null}

          {campaigns.map((c) => (
            <Card key={c.id} className="border-border bg-card p-4 space-y-3">
              <div>
                <p className="font-semibold">{c.title}</p>
                <p className="text-xs text-muted-foreground">{c.slug}</p>
              </div>
              {c.analytics ? (
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  <p>Views: <strong>{c.analytics.views}</strong></p>
                  <p>Clicks: <strong>{c.analytics.clicks}</strong></p>
                  <p>Registrations: <strong>{c.analytics.registrations}</strong></p>
                  <p>First deposits: <strong>{c.analytics.firstDeposits}</strong></p>
                  <p>Referral conv.: <strong>{c.analytics.referralConversions}</strong></p>
                  <p>Conversion: <strong>{c.analytics.conversionRatePct}%</strong></p>
                </div>
              ) : null}
              {c.share ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => void copyText(c.share!.whatsappPost, "WhatsApp")}>
                    Copy WhatsApp
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => void copyText(c.share!.facebookPost, "Facebook")}>
                    Copy Facebook
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}

          <Card className="border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium text-foreground">Share image previews (screenshot to post)</p>
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Story / WhatsApp status</p>
                <CampaignShareImagePreview
                  title={previewCampaign.title}
                  description={previewCampaign.description}
                  variant="story"
                  language={previewCampaign.language}
                  imageUrl={previewCampaign.banner_url ?? previewCampaign.image_url}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs text-muted-foreground">Facebook post</p>
                <CampaignShareImagePreview
                  title={previewCampaign.title}
                  description={previewCampaign.description}
                  variant="facebook"
                  language={previewCampaign.language}
                  imageUrl={previewCampaign.banner_url ?? previewCampaign.image_url}
                />
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {section === "analytics" && !loading && campaigns.length === 0 && !created ? (
        <p className="text-sm text-muted-foreground">Create a campaign to see analytics.</p>
      ) : null}
    </div>
  )
}
