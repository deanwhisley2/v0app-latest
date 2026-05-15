-- Prevent duplicate treasury debits / parallel settlement workers on the same crypto deposit.

alter table public.crypto_deposit_requests
  drop constraint if exists crypto_deposit_requests_status_check;

alter table public.crypto_deposit_requests
  add constraint crypto_deposit_requests_status_check check (
    status in (
      'pending',
      'verifying',
      'awaiting_confirmations',
      'verified',
      'crediting',
      'credited',
      'failed',
      'rejected',
      'manual_review'
    )
  );

-- Remove duplicate settlement rows from parallel workers (keep earliest per reference_id).
delete from public.unified_ledger ul
where ul.ctid in (
  select dup.ctid
  from (
    select ctid,
      row_number() over (partition by reference_id order by created_at asc) as rn
    from public.unified_ledger
    where reference_id like 'crypto_deposit:%'
  ) dup
  where dup.rn > 1
);

create unique index if not exists unified_ledger_reference_id_unique
  on public.unified_ledger (reference_id);

comment on index public.unified_ledger_reference_id_unique is
  'Idempotent settlement keys (e.g. crypto_deposit:principal:<uuid>).';
