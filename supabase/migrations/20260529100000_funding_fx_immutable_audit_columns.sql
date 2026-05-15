-- Immutable FX snapshot metadata + trigger (settlement fields remain updatable on approval).

alter table public.funding_fx_normalization
  add column if not exists rate_captured_at timestamptz;

alter table public.funding_fx_normalization
  add column if not exists middleware_version text;

update public.funding_fx_normalization
set rate_captured_at = coalesce(created_at, timezone('utc', now()))
where rate_captured_at is null;

update public.funding_fx_normalization
set middleware_version = 'funding_fx_v1'
where middleware_version is null or trim(middleware_version) = '';

alter table public.funding_fx_normalization
  alter column rate_captured_at set not null,
  alter column rate_captured_at set default timezone('utc', now()),
  alter column middleware_version set not null,
  alter column middleware_version set default 'funding_fx_v1';

comment on column public.funding_fx_normalization.rate_captured_at is
  'When the FX inputs were captured at submission (immutable alongside the rate snapshot).';

comment on column public.funding_fx_normalization.middleware_version is
  'Middleware release tag for cross-system audit (immutable alongside the rate snapshot).';

create or replace function public.funding_fx_normalization_immutable_guard()
returns trigger
language plpgsql
as $$
begin
  if (old.fund_request_id is distinct from new.fund_request_id)
     or (old.user_id is distinct from new.user_id)
     or (old.routing_lane is distinct from new.routing_lane)
     or (old.amount_input_local is distinct from new.amount_input_local)
     or (old.input_currency is distinct from new.input_currency)
     or (old.local_per_usd is distinct from new.local_per_usd)
     or (old.rate_date is distinct from new.rate_date)
     or (old.rate_source is distinct from new.rate_source)
     or (old.amount_usd_normalized is distinct from new.amount_usd_normalized)
     or (old.created_at is distinct from new.created_at)
     or (old.rate_captured_at is distinct from new.rate_captured_at)
     or (old.middleware_version is distinct from new.middleware_version)
  then
    raise exception 'funding_fx_normalization: FX snapshot fields are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists funding_fx_normalization_immutable_guard on public.funding_fx_normalization;

create trigger funding_fx_normalization_immutable_guard
  before update on public.funding_fx_normalization
  for each row
  execute function public.funding_fx_normalization_immutable_guard();
