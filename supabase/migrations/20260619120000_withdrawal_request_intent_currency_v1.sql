-- User-entered local cashout intent (ledger remains USD-normalized on amount / payout columns).
alter table public.withdrawal_requests
  add column if not exists amount_input_local numeric(24, 4),
  add column if not exists input_currency text;

comment on column public.withdrawal_requests.amount_input_local is
  'Exact local fiat units the user typed at submit time (audit / approval intent).';
comment on column public.withdrawal_requests.input_currency is
  'ISO-like fiat code for amount_input_local (e.g. UGX).';
