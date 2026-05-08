-- Force remote sign-out (invalidate refresh tokens). Access JWT may live until exp.
-- Replace email. Run in Supabase SQL Editor (privileged).

begin;

delete from auth.refresh_tokens
where user_id = (select id from auth.users where email = 'REPLACE_WITH_EMAIL' limit 1);

commit;
