-- User-chosen archive for notification center (bell / saved for later).
alter table public.user_account_notifications
  add column if not exists user_archived_at timestamptz;

comment on column public.user_account_notifications.user_archived_at is
  'When set, row appears in Archived folder only (inbox excludes archived).';

drop index if exists public.user_account_notifications_user_active_idx;

create index if not exists user_account_notifications_user_active_idx
  on public.user_account_notifications (user_id, created_at desc)
  where user_deleted_at is null and user_archived_at is null;

create index if not exists user_account_notifications_user_archived_idx
  on public.user_account_notifications (user_id, user_archived_at desc)
  where user_deleted_at is null and user_archived_at is not null;
