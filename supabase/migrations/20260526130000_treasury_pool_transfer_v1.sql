-- Level 5: two company pools — MAIN_TREASURY (auto-approval float) and OPERATIONAL (reserve).

insert into public.treasury_balances (wallet_type, amount)
values ('OPERATIONAL', 0)
on conflict (wallet_type) do nothing;

create or replace function public.transfer_treasury_usd(
  p_from_wallet text,
  p_to_wallet text,
  p_usd_amount numeric(20, 2),
  p_transaction_id uuid,
  p_reference_id text,
  p_reason text,
  p_initiated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_before numeric(20, 2);
  v_from_after numeric(20, 2);
  v_to_before numeric(20, 2);
  v_to_after numeric(20, 2);
  v_first text;
  v_second text;
begin
  if p_usd_amount is null or p_usd_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Invalid USD amount');
  end if;

  if p_from_wallet not in ('MAIN_TREASURY', 'OPERATIONAL', 'RESERVE')
     or p_to_wallet not in ('MAIN_TREASURY', 'OPERATIONAL', 'RESERVE') then
    return jsonb_build_object('success', false, 'error', 'Invalid wallet type');
  end if;

  if p_from_wallet = p_to_wallet then
    return jsonb_build_object('success', false, 'error', 'Source and destination must differ');
  end if;

  insert into public.treasury_balances (wallet_type, amount)
  values (p_from_wallet, 0), (p_to_wallet, 0)
  on conflict (wallet_type) do nothing;

  if p_from_wallet < p_to_wallet then
    v_first := p_from_wallet;
    v_second := p_to_wallet;
  else
    v_first := p_to_wallet;
    v_second := p_from_wallet;
  end if;

  perform 1 from public.treasury_balances where wallet_type = v_first for update;
  perform 1 from public.treasury_balances where wallet_type = v_second for update;

  select amount into v_from_before from public.treasury_balances where wallet_type = p_from_wallet;
  select amount into v_to_before from public.treasury_balances where wallet_type = p_to_wallet;

  if v_from_before < p_usd_amount then
    return jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance in source pool',
      'current', v_from_before,
      'wallet', p_from_wallet
    );
  end if;

  v_from_after := v_from_before - p_usd_amount;
  v_to_after := v_to_before + p_usd_amount;

  update public.treasury_balances
  set amount = v_from_after, updated_at = now(), version = version + 1
  where wallet_type = p_from_wallet;

  update public.treasury_balances
  set amount = v_to_after, updated_at = now(), version = version + 1
  where wallet_type = p_to_wallet;

  insert into public.unified_ledger (
    transaction_id, entity_type, entity_id, wallet_type,
    original_amount, original_currency, usd_amount, usd_rate,
    operation, reference_id, reason, initiated_by,
    balance_before_usd, balance_after_usd
  ) values (
    p_transaction_id, 'TREASURY', 'treasury_pool', p_from_wallet,
    p_usd_amount, 'USD', p_usd_amount, 1,
    'DEBIT', p_reference_id, p_reason || ' (outbound)', p_initiated_by,
    v_from_before, v_from_after
  );

  insert into public.unified_ledger (
    transaction_id, entity_type, entity_id, wallet_type,
    original_amount, original_currency, usd_amount, usd_rate,
    operation, reference_id, reason, initiated_by,
    balance_before_usd, balance_after_usd
  ) values (
    p_transaction_id, 'TREASURY', 'treasury_pool', p_to_wallet,
    p_usd_amount, 'USD', p_usd_amount, 1,
    'CREDIT', p_reference_id, p_reason || ' (inbound)', p_initiated_by,
    v_to_before, v_to_after
  );

  return jsonb_build_object(
    'success', true,
    'from_balance', v_from_after,
    'to_balance', v_to_after,
    'from_wallet', p_from_wallet,
    'to_wallet', p_to_wallet
  );
end;
$$;

comment on function public.transfer_treasury_usd(text, text, numeric, uuid, text, text, uuid) is
  'Atomic move between treasury_balances pools (L5 reserve ↔ auto-approval float).';

revoke all on function public.transfer_treasury_usd(text, text, numeric, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.transfer_treasury_usd(text, text, numeric, uuid, text, text, uuid) to service_role;
