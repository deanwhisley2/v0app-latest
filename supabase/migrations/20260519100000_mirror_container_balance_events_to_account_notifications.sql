-- Guarantees user_account_notifications stays aligned with container_balance_events (idempotent on conflict).

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
      'transaction_ref', new.transaction_ref
    )
  )
  on conflict (user_id, source_kind, source_id) do nothing;

  return new;
end;
$$;

comment on function public.mirror_container_balance_event_to_user_account_notification() is
  'After each container_balance_events row, mirror to user_account_notifications (deduped).';

drop trigger if exists mirror_cbe_to_user_account_notifications on public.container_balance_events;

create trigger mirror_cbe_to_user_account_notifications
  after insert on public.container_balance_events
  for each row
  execute procedure public.mirror_container_balance_event_to_user_account_notification();

revoke all on function public.mirror_container_balance_event_to_user_account_notification() from public;
