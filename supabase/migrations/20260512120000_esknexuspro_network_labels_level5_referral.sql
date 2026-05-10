-- 1) Test retailer visibility: Local MM filters require payment_numbers labels that match MTN / Airtel / MPesa strings.
--    Seed labeled MoMo lines for esknexuspro (email local part) so qualification passes for typical networks.
-- 2) Optional Level 5: set profiles.trading_user_level = 5 where referral_code matches (your ops referral id).

UPDATE public.retailer_profiles rp
SET
  payment_numbers =
    '[
      {"label":"MTN Mobile Money","value":"0770001001"},
      {"label":"Airtel Money","value":"0750001002"},
      {"label":"M-Pesa","value":"254700000003"},
      {"label":"Orange Money","value":"0770001004"}
    ]'::jsonb,
  registered_payee_names = COALESCE(NULLIF(TRIM(registered_payee_names), ''), 'Nexus Pro Retail Desk'),
  estimated_response_minutes = COALESCE(estimated_response_minutes, 30),
  liquidity_status = 'active',
  under_review = FALSE,
  is_country_retailer = TRUE,
  country_code = COALESCE(NULLIF(TRIM(UPPER(country_code)), ''), 'UG'),
  updated_at = NOW()
FROM public.profiles p
WHERE p.id = rp.user_id
  AND lower(split_part(trim(COALESCE(p.email::text, '')), '@', 1)) = 'esknexuspro';

UPDATE public.profiles p
SET
  funding_country_code = COALESCE(NULLIF(TRIM(UPPER(p.funding_country_code)), ''), 'UG'),
  updated_at = NOW()
WHERE lower(split_part(trim(COALESCE(p.email::text, '')), '@', 1)) = 'esknexuspro';

UPDATE public.user_balances ub
SET
  retail_balance = GREATEST(COALESCE(ub.retail_balance::double precision, 0), 500000::double precision),
  last_updated = NOW()
FROM public.profiles p
WHERE p.id = ub.user_id
  AND lower(split_part(trim(COALESCE(p.email::text, '')), '@', 1)) = 'esknexuspro';

-- Level 5 admin by referral_code (run once; verify affected rows in dashboard).
UPDATE public.profiles
SET
  trading_user_level = 5,
  updated_at = NOW()
WHERE upper(trim(referral_code)) = 'F5MTU5ZNVNCPZ5C';
