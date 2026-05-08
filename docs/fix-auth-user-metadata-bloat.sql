-- One-off: remove oversized selfie blobs from Auth JWT metadata (raw_user_meta_data).
-- Symptom: user cannot load app after enrolling selfie — cookies exceed header limits (431),
-- or middleware clears sessions when Cookie header size explodes.
--
-- Selfie images belong in public.profiles.avatar_url only; metadata keeps selfie_hash only.
-- Run in Supabase SQL Editor as a privileged role. Replace the email if needed.

begin;

update auth.users
set raw_user_meta_data =
  coalesce(raw_user_meta_data, '{}'::jsonb)
  - 'avatar_url'
  - 'selfie_image'
where email ilike '%deanwhisley2%';

-- Verify:
-- select id, email, length(raw_user_meta_data::text) as meta_len from auth.users where email ilike '%deanwhisley2%';

commit;
