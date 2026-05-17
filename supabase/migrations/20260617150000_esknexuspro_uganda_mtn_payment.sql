-- esknexuspro (ESK retail desk): canonical Uganda MTN receive line + payee registry.
-- Removes legacy test MTN numbers (e.g. 0770001001) from this desk only.

UPDATE public.retailer_profiles rp
SET
  payment_numbers =
    '[
      {
        "label": "MTN Mobile Money Uganda",
        "value": "+256794152339",
        "payment_type": "mtn_mobile_ug",
        "ussd_prefix": "*165*1#"
      },
      {
        "label": "Airtel Money Uganda",
        "value": "7095290",
        "payment_type": "airtel_merchant_ug",
        "merchant_id": "7095290",
        "merchant_name": "Nexus Pro2"
      }
    ]'::jsonb,
  registered_payee_names = 'AZIZZA NANKWANGA',
  payment_numbers_updated_at = now(),
  updated_at = now()
FROM public.profiles p
WHERE rp.user_id = p.id
  AND lower(split_part(trim(coalesce(p.email::text, '')), '@', 1)) = 'esknexuspro';
