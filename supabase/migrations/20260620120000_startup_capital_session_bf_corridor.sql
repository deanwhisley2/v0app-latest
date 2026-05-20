-- Startup Capital Session: referral milestone slots + one-time grant flag.
-- Burkina Faso (BF) operating corridor (XOF) — same pipeline as other countries.

alter table public.profiles
  add column if not exists referral_milestone_slot smallint null,
  add column if not exists startup_capital_granted_at timestamptz null;

comment on column public.profiles.referral_milestone_slot is
  'When set (1–10), this referee counted toward referrer startup-capital unlock only — no flat referral commission on first deposit.';

comment on column public.profiles.startup_capital_granted_at is
  'When set, user received the one-time Startup Capital Session credit (~$6 USD equiv). Excludes first-deposit launch bonus.';

create index if not exists profiles_referred_by_created_idx
  on public.profiles (referred_by, created_at)
  where referred_by is not null;

create or replace function public.process_referral_startup_milestone(
  p_referrer_id uuid,
  p_referee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_slot smallint;
  v_granted timestamptz;
begin
  if p_referrer_id is null
     or p_referee_id is null
     or p_referrer_id = p_referee_id then
    return jsonb_build_object('slot', null, 'count', 0, 'grant', false);
  end if;

  perform 1 from public.profiles where id = p_referrer_id for update;

  select count(*)::int into v_count
  from public.profiles
  where referred_by = p_referrer_id;

  if v_count > 10 then
    return jsonb_build_object('slot', null, 'count', v_count, 'grant', false);
  end if;

  v_slot := v_count::smallint;

  update public.profiles
  set referral_milestone_slot = v_slot,
      updated_at = now()
  where id = p_referee_id
    and referral_milestone_slot is null;

  select startup_capital_granted_at into v_granted
  from public.profiles
  where id = p_referrer_id;

  return jsonb_build_object(
    'slot', v_slot,
    'count', v_count,
    'grant', v_count = 10 and v_granted is null
  );
end;
$$;

revoke all on function public.process_referral_startup_milestone(uuid, uuid) from public;
grant execute on function public.process_referral_startup_milestone(uuid, uuid) to service_role;

update public.platform_launch_windows
set
  programs = programs
    || jsonb_build_object(
      'startup_capital',
      jsonb_build_object(
        'enabled', true,
        'usd_reward', 6,
        'registrations_required', 10,
        'promo_modal', true
      )
    ),
  updated_at = now()
where slug = 'global-referral-2026'
  and status in ('scheduled', 'active');
