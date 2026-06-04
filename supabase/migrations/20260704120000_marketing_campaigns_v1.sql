-- Admin marketing campaigns: share links, tracking, registration attribution.

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  campaign_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text,
  banner_url text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  country_codes text[] NOT NULL DEFAULT '{}',
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'fr')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'active', 'ended')),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_campaigns_slug_key UNIQUE (slug),
  CONSTRAINT marketing_campaigns_dates_chk CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS marketing_campaigns_status_idx ON public.marketing_campaigns (status, start_at DESC);
CREATE INDEX IF NOT EXISTS marketing_campaigns_type_idx ON public.marketing_campaigns (campaign_type);

CREATE TABLE IF NOT EXISTS public.marketing_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns (id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN ('view', 'click', 'registration', 'first_deposit', 'referral_conversion')
  ),
  visitor_id text,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'promo',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_campaign_events_campaign_type_idx
  ON public.marketing_campaign_events (campaign_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS marketing_campaign_events_visitor_idx
  ON public.marketing_campaign_events (campaign_id, visitor_id)
  WHERE visitor_id IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS registration_campaign_id uuid REFERENCES public.marketing_campaigns (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS registration_campaign_slug text,
  ADD COLUMN IF NOT EXISTS registration_campaign_source text;

CREATE INDEX IF NOT EXISTS profiles_registration_campaign_id_idx
  ON public.profiles (registration_campaign_id)
  WHERE registration_campaign_id IS NOT NULL;

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaign_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.marketing_campaigns IS 'Admin promotion campaigns with public /promo/{slug} landing pages.';
COMMENT ON TABLE public.marketing_campaign_events IS 'Campaign funnel events (views, clicks, registrations, etc.).';
