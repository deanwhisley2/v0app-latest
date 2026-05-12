-- Official company MoMo receive lines when no solvent retailer qualifies (L5-managed).
-- Optional FK from retailer_fund_requests when customer pays company corridor directly.

create table if not exists public.official_corridor_payment_routes (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (char_length(trim(country_code)) = 2),
  network_token text not null,
  payee_display_name text not null,
  payment_numbers jsonb not null default '[]'::jsonb,
  whatsapp_number text,
  contact_phone text,
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.official_corridor_payment_routes is
  'Level-5 configured official receive lines when Add Funds (local MM) finds no qualifying retailer desk.';

create index if not exists official_corridor_payment_routes_lookup_idx
  on public.official_corridor_payment_routes (upper(trim(country_code)), upper(trim(network_token)), active);

alter table public.retailer_fund_requests
  add column if not exists official_corridor_route_id uuid references public.official_corridor_payment_routes(id);

comment on column public.retailer_fund_requests.official_corridor_route_id is
  'Customer paid official company corridor line; retailer_id may be null. Settlement is L5-operational only.';

alter table public.retailer_fund_requests alter column retailer_id drop not null;

alter table public.retailer_fund_requests
  drop constraint if exists retailer_fund_requests_desk_or_official_chk;

alter table public.retailer_fund_requests
  add constraint retailer_fund_requests_desk_or_official_chk check (
    fund_channel <> 'local_mobile'
    or retailer_id is not null
    or official_corridor_route_id is not null
  );

alter table public.official_corridor_payment_routes enable row level security;

drop policy if exists "official_corridor_select_authenticated" on public.official_corridor_payment_routes;
create policy "official_corridor_select_authenticated"
  on public.official_corridor_payment_routes for select
  to authenticated
  using (active = true);

grant select on table public.official_corridor_payment_routes to authenticated;
