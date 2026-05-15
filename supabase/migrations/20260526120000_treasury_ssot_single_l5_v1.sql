-- Single MAIN_TREASURY SSOT; retire legacy admin_treasury_pool; one Level-5 liquidity admin.

-- Merge any legacy pool balance into MAIN_TREASURY once, then zero legacy row.
insert into public.treasury_balances (wallet_type, amount)
values ('MAIN_TREASURY', 0)
on conflict (wallet_type) do nothing;

do $$
declare
  v_legacy numeric(20, 2);
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'admin_treasury_pool'
  ) then
    select coalesce(balance_usd, 0) into v_legacy
    from public.admin_treasury_pool
    where id = 1
    limit 1;

    if v_legacy > 0 then
      update public.treasury_balances
      set amount = amount + v_legacy, updated_at = now(), version = version + 1
      where wallet_type = 'MAIN_TREASURY';
    end if;

    update public.admin_treasury_pool
    set balance_usd = 0, updated_at = now()
    where id = 1;
  end if;
end $$;

comment on table public.admin_treasury_pool is
  'RETIRED: do not use. Authoritative company USD pool is treasury_balances.wallet_type = MAIN_TREASURY only.';

-- At most one Level-5 liquidity admin profile (institutional).
create unique index if not exists profiles_single_trading_user_level_5_idx
  on public.profiles (trading_user_level)
  where trading_user_level = 5;

comment on index public.profiles_single_trading_user_level_5_idx is
  'Only one Level-5 treasury operator account in the system.';
