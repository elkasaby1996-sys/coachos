create or replace function public.handle_checkin_reviewed_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_user_id uuid;
begin
  if old.reviewed_at is not null or new.reviewed_at is null then
    return new;
  end if;

  if nullif(trim(coalesce(new.pt_feedback, '')), '') is null then
    return new;
  end if;

  select c.user_id
  into v_client_user_id
  from public.clients c
  where c.id = new.client_id;

  if v_client_user_id is null then
    return new;
  end if;

  perform public.notify_user(
    v_client_user_id,
    'checkin_reviewed',
    'Check-in feedback ready',
    'Your coach reviewed your check-in.',
    format('/app/checkins?checkin=%s', new.id),
    'checkin',
    new.id,
    null,
    jsonb_build_object(
      'week_ending_saturday', new.week_ending_saturday,
      'client_id', new.client_id
    ),
    'checkins',
    'normal'
  );

  return new;
end;
$$;

drop trigger if exists checkin_reviewed_notifications_update
  on public.checkins;

create trigger checkin_reviewed_notifications_update
after update on public.checkins
for each row
execute function public.handle_checkin_reviewed_notifications();

grant execute on function public.handle_checkin_reviewed_notifications()
  to authenticated, service_role;
