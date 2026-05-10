-- Mark esknexuspro@gmail.com (any domain, local part esknexuspro) as a qualified in-country retailer for local mobile funding.
-- Seeds UG if country missing; tops up retail_balance (USD-normalized ledger) for corridor testing.

UPDATE public.retailer_profiles rp
SET
  is_country_retailer = TRUE,
  country_code = COALESCE(
    NULLIF(TRIM(UPPER(COALESCE(p.funding_country_code, ''))), ''),
    'UG'
  ),
  liquidity_status = 'active',
  under_review = FALSE,
  last_activity_at = NOW(),
  updated_at = NOW()
FROM public.profiles p
WHERE p.id = rp.user_id
  AND lower(split_part(trim(COALESCE(p.email::text, '')), '@', 1)) = 'esknexuspro';

UPDATE public.profiles p
SET
  funding_country_code = COALESCE(
    NULLIF(TRIM(UPPER(COALESCE(p.funding_country_code, ''))), ''),
    'UG'
  ),
  updated_at = NOW()
WHERE lower(split_part(trim(COALESCE(p.email::text, '')), '@', 1)) = 'esknexuspro';

UPDATE public.user_balances ub
SET
  retail_balance = GREATEST(COALESCE(ub.retail_balance::double precision, 0), 500000::double precision),
  last_updated = NOW()
FROM public.profiles p
WHERE p.id = ub.user_id
  AND lower(split_part(trim(COALESCE(p.email::text, '')), '@', 1)) = 'esknexuspro';
