-- Level-5 admin direct payment rails: global USDT TRC20 + Uganda Airtel merchant.
-- Requests route to L5 ops (escalated_to_admin); no retailer desk liability until settled.

alter table public.retailer_fund_requests
  add column if not exists payment_proof_path text null;

comment on column public.retailer_fund_requests.payment_proof_path is
  'Supabase storage object path (bucket funding-proofs) for user-uploaded payment screenshot.';

alter table public.retailer_fund_requests
  drop constraint if exists retailer_fund_requests_fund_channel_check;

alter table public.retailer_fund_requests
  add constraint retailer_fund_requests_fund_channel_check
  check (fund_channel in ('local_mobile', 'legacy_admin', 'admin_crypto', 'admin_airtel_ug'));

alter table public.retailer_fund_requests
  drop constraint if exists retailer_fund_requests_desk_or_official_chk;

alter table public.retailer_fund_requests
  add constraint retailer_fund_requests_desk_or_official_chk check (
    fund_channel in ('admin_crypto', 'admin_airtel_ug', 'legacy_admin')
    or fund_channel <> 'local_mobile'
    or retailer_id is not null
    or official_corridor_route_id is not null
  );

comment on column public.retailer_fund_requests.fund_channel is
  'local_mobile = retailer/corridor MM; legacy_admin = basin; admin_crypto/admin_airtel_ug = L5 direct receive (no retailer).';

create index if not exists retailer_fund_requests_admin_direct_pending_idx
  on public.retailer_fund_requests (created_at desc)
  where fund_channel in ('admin_crypto', 'admin_airtel_ug')
    and status in ('pending', 'under_review', 'appealed');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'funding-proofs',
  'funding-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
