-- Level 5 Nexus Main admin by referral_code (NX1TB8NK95).

UPDATE public.profiles
SET
  trading_user_level = 5,
  updated_at = NOW()
WHERE upper(trim(referral_code)) = 'NX1TB8NK95';
