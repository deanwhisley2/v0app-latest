-- Track last MoMo line edit for 7-day retailer self-service cooldown (support can reset via admin API).

ALTER TABLE public.retailer_profiles
  ADD COLUMN IF NOT EXISTS payment_numbers_updated_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.retailer_profiles.payment_numbers_updated_at IS
  'Set when payment_numbers JSON changes; retailers may edit again after 7 days unless ops resets (admin API).';

UPDATE public.retailer_profiles rp
SET payment_numbers_updated_at = rp.updated_at
WHERE rp.payment_numbers_updated_at IS NULL
  AND rp.payment_numbers IS NOT NULL
  AND jsonb_typeof(rp.payment_numbers::jsonb) = 'array'
  AND jsonb_array_length(rp.payment_numbers::jsonb) > 0;
