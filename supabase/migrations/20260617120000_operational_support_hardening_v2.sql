-- Operational communications hardening: audit fields, taxonomy, institutional statuses.

alter table public.operational_support_threads
  add column if not exists escalation_source text,
  add column if not exists priority text not null default 'normal',
  add column if not exists resolution_note text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by_admin_id uuid references auth.users(id),
  add column if not exists locked_at timestamptz,
  add column if not exists audit_meta jsonb not null default '{}'::jsonb,
  add column if not exists search_key text;

alter table public.operational_support_threads
  drop constraint if exists operational_support_threads_priority_check;

alter table public.operational_support_threads
  add constraint operational_support_threads_priority_check
  check (priority in ('normal', 'high', 'urgent'));

alter table public.operational_support_threads
  drop constraint if exists operational_support_threads_category_check;

alter table public.operational_support_threads
  add constraint operational_support_threads_category_check
  check (
    category in (
      'general',
      'funding_dispute',
      'withdrawal_dispute',
      'appeal',
      'security',
      'retailer',
      'crypto_dispute',
      'assistant_escalation',
      'transaction_review',
      'operational_complaint',
      'payout_dispute',
      'stuck_trade',
      'settlement_failure',
      'locked_balance',
      'verification_complaint'
    )
  );

alter table public.operational_support_threads
  drop constraint if exists operational_support_threads_linked_kind_check;

alter table public.operational_support_threads
  add constraint operational_support_threads_linked_kind_check
  check (
    linked_kind is null
    or linked_kind in (
      'retailer_fund_request',
      'withdrawal_request',
      'crypto_deposit_request',
      'trade_session',
      'copy_trade_session'
    )
  );

alter table public.operational_support_threads
  drop constraint if exists operational_support_threads_status_check;

alter table public.operational_support_threads
  add constraint operational_support_threads_status_check
  check (
    status in (
      'open',
      'pending_admin',
      'awaiting_response',
      'processing',
      'answered',
      'resolved',
      'closed'
    )
  );

create index if not exists operational_support_threads_search_key_idx
  on public.operational_support_threads (search_key)
  where search_key is not null;

create index if not exists operational_support_threads_unresolved_idx
  on public.operational_support_threads (last_message_at desc)
  where status not in ('resolved', 'closed');

comment on column public.operational_support_threads.escalation_source is
  'Canonical source: funding_appeal, withdrawal_dispute, crypto_verify, assistant, user_desk, system, etc.';
comment on column public.operational_support_threads.audit_meta is
  'Append-only style metadata: reopen history, risk flags, linked refs (machine English).';
