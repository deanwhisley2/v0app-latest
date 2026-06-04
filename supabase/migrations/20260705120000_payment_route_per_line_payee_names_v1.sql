-- Per-network payee_name on payment_numbers lines (MTN vs Airtel must not share desk-level MTN name).

UPDATE public.retailer_profiles rp
SET
  payment_numbers = '[
    {
      "label": "MTN Mobile Money Uganda",
      "value": "+256794152339",
      "payment_type": "mtn_mobile_ug",
      "ussd_prefix": "*165*1#",
      "payee_name": "AZIZZA NANKWANGA"
    },
    {
      "label": "Airtel Money Uganda",
      "value": "7095290",
      "payment_type": "airtel_merchant_ug",
      "merchant_id": "7095290",
      "merchant_name": "Nexus Pro2",
      "payee_name": "Nexus Pro2",
      "ussd_prefix": "*185*9#"
    }
  ]'::jsonb,
  registered_payee_names = 'AZIZZA NANKWANGA',
  payment_numbers_updated_at = now(),
  updated_at = now()
FROM public.profiles p
WHERE rp.user_id = p.id
  AND lower(split_part(trim(coalesce(p.email::text, '')), '@', 1)) = 'esknexuspro';

UPDATE public.retailer_corridor_desks rcd
SET
  payment_numbers = '[
    {
      "label": "MTN Mobile Money Uganda",
      "value": "+256794152339",
      "payment_type": "mtn_mobile_ug",
      "ussd_prefix": "*165*1#",
      "payee_name": "AZIZZA NANKWANGA"
    },
    {
      "label": "Airtel Money Uganda",
      "value": "7095290",
      "payment_type": "airtel_merchant_ug",
      "merchant_id": "7095290",
      "merchant_name": "Nexus Pro2",
      "payee_name": "Nexus Pro2",
      "ussd_prefix": "*185*9#"
    }
  ]'::jsonb,
  registered_payee_names = 'AZIZZA NANKWANGA',
  updated_at = now()
FROM public.retailer_profiles rp
JOIN public.profiles p ON p.id = rp.user_id
WHERE rcd.retailer_profile_id = rp.id
  AND rcd.country_code = 'UG'
  AND lower(split_part(trim(coalesce(p.email::text, '')), '@', 1)) = 'esknexuspro';

COMMENT ON COLUMN public.retailer_profiles.registered_payee_names IS
  'Legacy desk-level MTN payee hint; per-route payee_name on each payment_numbers row is authoritative for display.';
