-- Stop mirroring L5/admin ledger rows (container_balance_events.category=admin) into customer bell.
-- Customers already receive friendly copy via l5_funding_settled / funding_status notifications.

create or replace function public.mirror_container_balance_event_to_user_account_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.event_type, '') = 'admin_retail_pool_debited' then
    return new;
  end if;

  if coalesce(new.category, '') = 'admin' then
    return new;
  end if;

  if coalesce(new.event_type, '') like 'funding_request_admin_%' then
    return new;
  end if;

  insert into public.user_account_notifications (
    user_id,
    source_kind,
    source_id,
    notification_type,
    title,
    body,
    nav,
    metadata
  ) values (
    new.user_id,
    'container_balance_event',
    new.id::text,
    'financial',
    'Account transaction',
    coalesce(
      nullif(trim(new.summary), ''),
      new.event_type || ' · gross $' || trim(to_char(new.gross_amount, 'FM999999990.00'))
    ),
    jsonb_build_object('kind', 'wallet'),
    jsonb_build_object(
      'event_type', new.event_type,
      'category', new.category,
      'status', new.status,
      'transaction_ref', new.transaction_ref,
      'amount_usd', new.gross_amount,
      'settled_amount_usd', new.gross_amount
    )
  )
  on conflict (user_id, source_kind, source_id) do nothing;

  return new;
end;
$$;

comment on function public.mirror_container_balance_event_to_user_account_notification() is
  'Mirror container_balance_events to user_account_notifications except admin/L5 ledger-only rows.';

-- Backfill: replace internal ops copy already mirrored to customer bell.
update public.user_account_notifications
set
  title = 'Deposit credited',
  body = 'Your deposit has been successfully credited.',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'friendly_detail', 'Credited to your balance.',
    'sanitized_from_ops_mirror', true
  )
where source_kind = 'container_balance_event'
  and (
    body ~* '(L5\s+approved|MAIN_TREASURY|admin_airtel|admin_crypto|admin[\s_-]*direct|normalized settlement|retail balance debited|nexus main credited|treasury[\s_-]*pool|funding_request_admin)'
    or title ~* '(L5\s+approved|MAIN_TREASURY|admin_airtel|admin_crypto|admin[\s_-]*direct)'
  );
