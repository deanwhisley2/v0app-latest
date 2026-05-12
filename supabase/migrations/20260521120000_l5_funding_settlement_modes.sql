-- Level-5 add-funds settlement audit: company treasury vs retailer retail_balance (explicit rails).

alter table public.retailer_fund_requests
  add column if not exists l5_settlement_mode text;

alter table public.retailer_fund_requests
  drop constraint if exists retailer_fund_requests_l5_settlement_mode_chk;

alter table public.retailer_fund_requests
  add constraint retailer_fund_requests_l5_settlement_mode_chk
  check (l5_settlement_mode is null or l5_settlement_mode in ('treasury_pool', 'retailer_retail_balance'));

comment on column public.retailer_fund_requests.l5_settlement_mode is
  'When L5 approved local-mobile add-funds: treasury MAIN_TREASURY debit vs retailer user_balances.retail_balance debit.';

alter table public.retailer_fund_requests
  add column if not exists l5_override_note text;

comment on column public.retailer_fund_requests.l5_override_note is
  'Optional ops note for L5 settlement (override or treasury-funded).';

alter table public.retailer_fund_requests
  add column if not exists approved_by_admin_for_retailer boolean not null default false;

comment on column public.retailer_fund_requests.approved_by_admin_for_retailer is
  'True when L5 approved on behalf of the retailer desk (retailer retail_balance was debited).';
