create or replace function public.pt_update_client_admin_fields(
  p_client_id uuid,
  p_training_type text,
  p_tags text
)
returns public.clients
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_workspace_id uuid;
  v_tags text[];
begin
  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if v_workspace_id is null then
    raise exception 'client not found';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
  ) then
    raise exception 'not allowed';
  end if;

  if p_training_type is not null
     and p_training_type not in ('online', 'hybrid', 'in_person') then
    raise exception 'invalid training_type %', p_training_type;
  end if;

  v_tags := case
    when p_tags is null or btrim(p_tags) = '' then null
    else regexp_split_to_array(p_tags, '\s*,\s*')
  end;

  update public.clients
  set
    training_type = coalesce(p_training_type, training_type),
    tags = coalesce(v_tags, tags)
  where id = p_client_id;

  return (
    select c
    from public.clients c
    where c.id = p_client_id
  );
end;
$$;
