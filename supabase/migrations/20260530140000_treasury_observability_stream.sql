-- Treasury observability: append-only operational stream + reconciliation run ledger (service-role writers).

create table if not exists public.treasury_operation_stream (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  occurred_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb,
  fund_request_id uuid references public.retailer_fund_requests (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  crypto_deposit_id uuid references public.crypto_deposit_requests (id) on delete set null,
  correlation_id text
);

alter table public.treasury_operation_stream
  add constraint treasury_operation_stream_event_type_check check (
    event_type in (
      'funding_created',
      'fx_normalized',
      'approval_requested',
      'treasury_debited',
      'customer_credited',
      'compensation_applied',
      'notification_sent',
      'risk_flag',
      'reconciliation_completed',
      'automation_safe_mode_block'
    )
  );

create index if not exists treasury_operation_stream_occurred_idx
  on public.treasury_operation_stream (occurred_at desc);

create index if not exists treasury_operation_stream_event_occurred_idx
  on public.treasury_operation_stream (event_type, occurred_at desc);

create index if not exists treasury_operation_stream_fund_req_idx
  on public.treasury_operation_stream (fund_request_id)
  where fund_request_id is not null;

create index if not exists treasury_operation_stream_user_idx
  on public.treasury_operation_stream (user_id)
  where user_id is not null;

comment on table public.treasury_operation_stream is
  'Append-only internal pipeline for treasury/funding lifecycle (analytics, reconciliation, audits). Corrections never UPDATE rows — use reversal events in ledger.';

alter table public.treasury_operation_stream enable row level security;

revoke all on table public.treasury_operation_stream from public;
grant select, insert on table public.treasury_operation_stream to service_role;

create table if not exists public.treasury_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  issue_count int not null default 0,
  findings jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb
);

comment on table public.treasury_reconciliation_runs is
  'Scheduled reconciliation outcomes (treasury ↔ funding ↔ FX ↔ ledger).';

alter table public.treasury_reconciliation_runs enable row level security;

revoke all on table public.treasury_reconciliation_runs from public;
grant select, insert, update on table public.treasury_reconciliation_runs to service_role;
