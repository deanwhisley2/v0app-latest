-- Canonical in-country retail desk for referral_code NX142PW5OO (upper(trim) match).
-- Aligns with GET /api/user/qualified-retailers: is_country_retailer, liquidity_status,
-- payment_numbers labels for MTN/Airtel/M-Pesa corridor matching, spendable retail float,
-- profiles.funding_country_code for customer↔desk ISO2 pairing, Level-2 desk flags.
-- Idempotent: inserts missing user_balances / retailer_profiles shells only for this referral.

INSERT INTO public.user_balances (user_id)
SELECT p.id
FROM public.profiles p
WHERE upper(trim(COALESCE(p.referral_code, ''))) = 'NX142PW5OO'
  AND NOT EXISTS (SELECT 1 FROM public.user_balances ub WHERE ub.user_id = p.id)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.retailer_profiles (user_id)
SELECT p.id
FROM public.profiles p
WHERE upper(trim(COALESCE(p.referral_code, ''))) = 'NX142PW5OO'
  AND NOT EXISTS (SELECT 1 FROM public.retailer_profiles rp WHERE rp.user_id = p.id)
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.retailer_profiles rp
SET
  payment_numbers =
    '[
      {"label":"MTN Mobile Money","value":"0770001001"},
      {"label":"Airtel Money","value":"0750001002"},
      {"label":"M-Pesa","value":"254700000003"},
      {"label":"Orange Money","value":"0770001004"}
    ]'::jsonb,
  registered_payee_names = COALESCE(NULLIF(TRIM(rp.registered_payee_names), ''), 'Nexus Retail Desk'),
  estimated_response_minutes = COALESCE(rp.estimated_response_minutes, 30),
  liquidity_status = 'active',
  under_review = FALSE,
  is_country_retailer = TRUE,
  last_activity_at = NOW(),
  country_code = COALESCE(
    NULLIF(TRIM(UPPER(COALESCE(rp.country_code, ''))), ''),
    NULLIF(TRIM(UPPER(COALESCE(p.funding_country_code, ''))), ''),
    'UG'
  ),
  updated_at = NOW()
FROM public.profiles p
WHERE p.id = rp.user_id
  AND upper(trim(COALESCE(p.referral_code, ''))) = 'NX142PW5OO';

UPDATE public.profiles p
SET
  funding_country_code = COALESCE(
    NULLIF(TRIM(UPPER(COALESCE(p.funding_country_code, ''))), ''),
    'UG'
  ),
  trading_user_level = 2,
  retailer_credit_seller = TRUE,
  updated_at = NOW()
WHERE upper(trim(COALESCE(p.referral_code, ''))) = 'NX142PW5OO';

UPDATE public.user_balances ub
SET
  retail_balance = GREATEST(COALESCE(ub.retail_balance::double precision, 0), 500000::double precision),
  last_updated = NOW()
FROM public.profiles p
WHERE p.id = ub.user_id
  AND upper(trim(COALESCE(p.referral_code, ''))) = 'NX142PW5OO';
