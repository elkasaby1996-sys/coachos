-- Only metadata for plans the caller already owns or can view; no library access.
create or replace function public.client_nutrition_assignment_context(p_plan_id uuid)
returns table(name text, workspace_id uuid, owner_client_id uuid)
language sql stable security definer set search_path = public
as $$
  select t.name, t.workspace_id, t.owner_client_id
  from public.assigned_nutrition_plans p
  join public.nutrition_templates t on t.id = p.nutrition_template_id
  where p.id = p_plan_id
    and (public.is_client_owner(p.client_id) or public.can_access_client(p.client_id, 'clients.view'));
$$;
revoke all on function public.client_nutrition_assignment_context(uuid) from public, anon;
grant execute on function public.client_nutrition_assignment_context(uuid) to authenticated;

create or replace function public.notification_specific_client_target()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Preserve coach links and specific routes, only repair generic client routes.
  if new.entity_id is null then return new; end if;
  if new.action_url in ('/app/home','/app/checkin','/app/checkins','/app/workouts','/app/messages') then
    if new.entity_type = 'assigned_workout' then
      new.action_url := '/app/workouts/' || new.entity_id::text;
      -- Events store entity_id as text; notifications use uuid.
      new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('day_type', (select day_type from public.assigned_workouts where id::text = new.entity_id::text));
    elsif new.entity_type = 'checkin' then
      new.action_url := '/app/checkins?checkin=' || new.entity_id::text;
    elsif new.entity_type = 'conversation' then
      new.action_url := '/app/messages?thread=workspace%3A' || new.entity_id::text;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists specific_client_notification_target on public.notifications;
create trigger specific_client_notification_target before insert on public.notifications
for each row execute function public.notification_specific_client_target();
drop trigger if exists specific_client_notification_event_target on public.notification_events;
create trigger specific_client_notification_event_target before insert on public.notification_events
for each row execute function public.notification_specific_client_target();
