create or replace function public.pt_update_client_checkin_settings(
  p_client_id uuid,
  p_checkin_template_id uuid default null,
  p_checkin_frequency text default 'weekly',
  p_checkin_start_date date default null
)
returns public.clients
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_client public.clients;
  v_template_workspace_id uuid;
  v_frequency text := coalesce(nullif(trim(p_checkin_frequency), ''), 'weekly');
  v_onboarding_due_date date;
begin
  select c.*
  into v_client
  from public.clients c
  where c.id = p_client_id;

  if v_client.id is null then
    raise exception 'Client not found';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_client.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('pt_owner', 'pt_admin', 'pt_coach')
  ) then
    raise exception 'Not authorized';
  end if;

  if v_frequency not in ('weekly', 'biweekly', 'monthly') then
    raise exception 'Invalid check-in frequency';
  end if;

  if p_checkin_template_id is not null then
    select ct.workspace_id
    into v_template_workspace_id
    from public.checkin_templates ct
    where ct.id = p_checkin_template_id;

    if v_template_workspace_id is null then
      raise exception 'Check-in template not found';
    end if;

    if v_template_workspace_id <> v_client.workspace_id then
      raise exception 'Check-in template not in client workspace';
    end if;
  end if;

  update public.clients
  set
    checkin_template_id = p_checkin_template_id,
    checkin_frequency = v_frequency,
    checkin_start_date = p_checkin_start_date
  where id = p_client_id
  returning *
  into v_client;

  if p_checkin_template_id is not null and p_checkin_start_date is not null then
    v_onboarding_due_date := public.normalize_checkin_due_date(
      p_checkin_start_date
    );
  else
    v_onboarding_due_date := null;
  end if;

  update public.workspace_client_onboardings
  set
    first_checkin_template_id = p_checkin_template_id,
    first_checkin_date = v_onboarding_due_date,
    first_checkin_scheduled_at = case
      when v_onboarding_due_date is not null then now()
      else null
    end
  where workspace_id = v_client.workspace_id
    and client_id = v_client.id
    and completed_at is null;

  return v_client;
end;
$$;

revoke all on function public.pt_update_client_checkin_settings(uuid, uuid, text, date) from public;
grant execute on function public.pt_update_client_checkin_settings(uuid, uuid, text, date) to authenticated;
grant execute on function public.pt_update_client_checkin_settings(uuid, uuid, text, date) to service_role;
