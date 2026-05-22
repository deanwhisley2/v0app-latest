-- Per-country retailer receive rails (ESK general desk). A corridor is active only when payment_numbers are registered.
-- Shared retailer_profiles row holds liquidity; corridor rows gate customer-visible country/network matching.

CREATE TABLE IF NOT EXISTS public.retailer_corridor_desks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_profile_id uuid NOT NULL REFERENCES public.retailer_profiles (id) ON DELETE CASCADE,
  country_code text NOT NULL,
  payment_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
  registered_payee_names text NULL,
  liquidity_status text NOT NULL DEFAULT 'active',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retailer_corridor_desks_country_code_check CHECK (char_length(trim(country_code)) = 2),
  CONSTRAINT retailer_corridor_desks_liquidity_status_check CHECK (
    liquidity_status IN ('active', 'busy', 'offline', 'low_liquidity')
  ),
  CONSTRAINT retailer_corridor_desks_payment_numbers_nonempty CHECK (jsonb_array_length(payment_numbers) > 0)
);

COMMENT ON TABLE public.retailer_corridor_desks IS
  'In-country mobile-money receive lines per retailer desk. Customer funding matches on country_code + network labels in payment_numbers.';

CREATE UNIQUE INDEX IF NOT EXISTS retailer_corridor_desks_profile_country_uidx
  ON public.retailer_corridor_desks (retailer_profile_id, country_code);

CREATE INDEX IF NOT EXISTS retailer_corridor_desks_country_active_idx
  ON public.retailer_corridor_desks (upper(trim(country_code)), active);

ALTER TABLE public.retailer_corridor_desks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retailer_corridor_desks_select_authenticated" ON public.retailer_corridor_desks;
CREATE POLICY "retailer_corridor_desks_select_authenticated"
  ON public.retailer_corridor_desks FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON TABLE public.retailer_corridor_desks TO authenticated;

-- esknexuspro: Uganda corridor (canonical MTN + Airtel) and Kenya M-Pesa (two Safaricom receive lines).
INSERT INTO public.retailer_corridor_desks (
  retailer_profile_id,
  country_code,
  payment_numbers,
  registered_payee_names,
  liquidity_status,
  active
)
SELECT
  rp.id,
  v.country_code,
  v.payment_numbers::jsonb,
  v.registered_payee_names,
  'active',
  true
FROM public.retailer_profiles rp
JOIN public.profiles p ON p.id = rp.user_id
CROSS JOIN (
  VALUES
    (
      'UG',
      '[
        {"label":"MTN Mobile Money Uganda","value":"+256794152339","payment_type":"mtn_mobile_ug","ussd_prefix":"*165*1#"},
        {"label":"Airtel Money Uganda","value":"7095290","payment_type":"airtel_merchant_ug","merchant_id":"7095290","merchant_name":"Nexus Pro2"}
      ]',
      'AZIZZA NANKWANGA'
    ),
    (
      'KE',
      '[
        {"label":"M-Pesa Kenya","value":"0117071995","payment_type":"mpesa_mobile_ke","payee_name":"Fanuel Juma Weta"},
        {"label":"M-Pesa Kenya","value":"0115831794","payment_type":"mpesa_mobile_ke","payee_name":"Oscar Maloba Odhiambo"}
      ]',
      'Fanuel Juma Weta · Oscar Maloba Odhiambo'
    )
) AS v(country_code, payment_numbers, registered_payee_names)
WHERE lower(split_part(trim(coalesce(p.email::text, '')), '@', 1)) = 'esknexuspro'
ON CONFLICT (retailer_profile_id, country_code)
DO UPDATE SET
  payment_numbers = EXCLUDED.payment_numbers,
  registered_payee_names = EXCLUDED.registered_payee_names,
  liquidity_status = 'active',
  active = true,
  updated_at = now();

UPDATE public.retailer_profiles rp
SET
  is_country_retailer = true,
  liquidity_status = 'active',
  under_review = false,
  updated_at = now()
FROM public.profiles p
WHERE rp.user_id = p.id
  AND lower(split_part(trim(coalesce(p.email::text, '')), '@', 1)) = 'esknexuspro';
