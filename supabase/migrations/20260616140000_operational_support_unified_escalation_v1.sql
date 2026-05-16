-- Unified operational escalation taxonomy (funding appeals, crypto, assistant, etc.)

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
      'operational_complaint'
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
      'crypto_deposit_request'
    )
  );

create unique index if not exists operational_support_threads_linked_entity_uidx
  on public.operational_support_threads (linked_kind, linked_id)
  where linked_kind is not null and linked_id is not null;

comment on index public.operational_support_threads_linked_entity_uidx is
  'One operational thread per linked funding/withdrawal/crypto entity.';
