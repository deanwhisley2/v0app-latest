-- Remove unverified Kenya M-Pesa receive line (0117071995); keep single verified line for esknexuspro KE corridor.

UPDATE public.retailer_corridor_desks rcd
SET
  payment_numbers = '[
    {"label":"M-Pesa Kenya","value":"0115831794","payment_type":"mpesa_mobile_ke","payee_name":"Oscar Maloba Odhiambo"}
  ]'::jsonb,
  registered_payee_names = 'Oscar Maloba Odhiambo',
  updated_at = now()
FROM public.retailer_profiles rp
JOIN public.profiles p ON p.id = rp.user_id
WHERE rcd.retailer_profile_id = rp.id
  AND upper(trim(rcd.country_code)) = 'KE'
  AND lower(split_part(trim(coalesce(p.email::text, '')), '@', 1)) = 'esknexuspro';
