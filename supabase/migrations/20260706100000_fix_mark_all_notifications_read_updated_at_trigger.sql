create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update public.notification_deliveries
     set read_at = now(),
         seen_at = coalesce(seen_at, now())
   where recipient_user_id = auth.uid()
     and channel = 'in_app'
     and read_at is null
     and archived_at is null
     and status <> 'suppressed_preference';

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function public.mark_all_notifications_read()
  to authenticated;
