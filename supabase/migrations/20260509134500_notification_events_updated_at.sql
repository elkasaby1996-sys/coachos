alter table if exists public.notification_events
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_notification_events_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_notification_events_updated_at_trigger
  on public.notification_events;

create trigger touch_notification_events_updated_at_trigger
before update on public.notification_events
for each row
execute function public.touch_notification_events_updated_at();

grant execute on function public.touch_notification_events_updated_at()
  to service_role;
