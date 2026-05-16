-- Standard 3% withdrawal processing fee (gross frozen at request; net payout on approval).

alter table public.withdrawal_requests
  add column if not exists processing_fee_amount numeric(15, 2) null,
  add column if not exists payout_amount numeric(15, 2) null,
  add column if not exists processing_fee_rate numeric(8, 6) null;

comment on column public.withdrawal_requests.amount is
  'Gross withdrawal requested (frozen from Nexus Main until L5 decision).';
comment on column public.withdrawal_requests.processing_fee_amount is
  'Platform processing fee (USD-normalized) withheld on approval; null on legacy rows until backfill.';
comment on column public.withdrawal_requests.payout_amount is
  'Net amount for external payout handlers after fee; equals amount on legacy rows.';
comment on column public.withdrawal_requests.processing_fee_rate is
  'Fee rate snapshot at request time (e.g. 0.03); null for legacy no-fee rows.';

-- Legacy compatibility: no fee, full gross is payout.
update public.withdrawal_requests
set
  processing_fee_amount = 0,
  payout_amount = amount,
  processing_fee_rate = null
where payout_amount is null;

alter table public.withdrawal_requests
  add constraint withdrawal_requests_payout_fee_conserved_chk
  check (
    payout_amount is null
    or processing_fee_amount is null
    or abs((payout_amount + processing_fee_amount) - amount) < 0.02
  );

create index if not exists withdrawal_requests_payout_amount_idx
  on public.withdrawal_requests (payout_amount)
  where payout_amount is not null;
