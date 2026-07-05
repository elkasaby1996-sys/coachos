-- PR-05.3E: Generic same-workspace reinvites can arrive without a client id
-- on the invite. If the archived relationship belongs to the same email but
-- an old auth user id, claim and reactivate that row before creating/reusing
-- any other client profile.

create or replace function public.accept_invite(p_token text)
returns table(workspace_id uuid, client_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_variable
declare
  v_user_id uuid;
  v_user_email text;
  v_invite public.invites%rowtype;
  v_client_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_user_email := nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), '');
  if v_user_email is null then
    select nullif(lower(btrim(u.email)), '')
    into v_user_email
    from auth.users u
    where u.id = v_user_id;
  end if;

  select i.*
  into v_invite
  from public.invites i
  where i.token = p_token
     or i.code = p_token
  order by i.created_at desc
  limit 1
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found';
  end if;

  if v_invite.role is distinct from 'client' then
    raise exception 'Invite role not supported';
  end if;

  if v_invite.used_at is not null then
    raise exception 'Invite already used';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'Invite expired';
  end if;

  if v_invite.max_uses is not null and coalesce(v_invite.uses, 0) >= v_invite.max_uses then
    raise exception 'Invite max uses reached';
  end if;

  select c.id
  into v_client_id
  from public.clients c
  where c.workspace_id = v_invite.workspace_id
    and c.user_id = v_user_id
  limit 1
  for update;

  if v_client_id is not null then
    perform public.reactivate_removed_client_relationship(v_client_id);
  end if;

  if v_client_id is null and v_user_email is not null then
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id = v_invite.workspace_id
      and nullif(lower(btrim(coalesce(c.email, ''))), '') = v_user_email
      and coalesce(c.relationship_status, 'active') in ('removed', 'transferred_out')
    order by c.removed_at desc nulls last, c.created_at desc
    limit 1
    for update;

    if v_client_id is not null then
      perform public.reactivate_removed_client_relationship(v_client_id);

      update public.clients c
      set
        user_id = v_user_id,
        status = 'active',
        email = coalesce(nullif(lower(btrim(c.email)), ''), v_user_email),
        updated_at = now()
      where c.id = v_client_id
        and coalesce(c.relationship_status, 'active') = 'active'
      returning c.id into v_client_id;
    end if;
  end if;

  if v_client_id is null then
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id is null
      and c.user_id = v_user_id
    limit 1
    for update;
  end if;

  if v_client_id is null then
    insert into public.clients (
      workspace_id,
      user_id,
      status,
      relationship_status,
      display_name,
      email
    )
    values (v_invite.workspace_id, v_user_id, 'active', 'active', null, v_user_email)
    returning id into v_client_id;
  else
    update public.clients c
    set
      workspace_id = v_invite.workspace_id,
      status = 'active',
      user_id = v_user_id,
      relationship_status = 'active',
      removed_at = null,
      removed_by_user_id = null,
      email = coalesce(nullif(lower(btrim(c.email)), ''), v_user_email)
    where c.id = v_client_id
      and coalesce(c.relationship_status, 'active') <> 'transferred_out'
    returning id into v_client_id;
  end if;

  perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite');

  update public.invites
  set
    used_at = now(),
    uses = coalesce(uses, 0) + 1
  where id = v_invite.id;

  workspace_id := v_invite.workspace_id;
  client_id := v_client_id;
  return next;
end;
$$;

create or replace function public.accept_invite(
  p_code text,
  p_display_name text default null
)
returns table(workspace_id uuid, client_id uuid)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $$
declare
  v_inv public.invites%rowtype;
  v_client_id uuid;
  v_name text;
  v_user_email text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to accept an invite';
  end if;

  v_user_email := nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), '');
  if v_user_email is null then
    select nullif(lower(btrim(u.email)), '')
    into v_user_email
    from auth.users u
    where u.id = auth.uid();
  end if;

  select *
  into v_inv
  from public.invites
  where code = p_code
  for update;

  if not found then
    raise exception 'Invalid invite code';
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception 'Invite expired';
  end if;

  if v_inv.uses >= v_inv.max_uses then
    raise exception 'Invite already used';
  end if;

  select c.id
  into v_client_id
  from public.clients c
  where c.workspace_id = v_inv.workspace_id
    and c.user_id = auth.uid()
  limit 1
  for update;

  if v_client_id is not null then
    perform public.reactivate_removed_client_relationship(v_client_id);
  end if;

  if v_client_id is null and v_user_email is not null then
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id = v_inv.workspace_id
      and nullif(lower(btrim(coalesce(c.email, ''))), '') = v_user_email
      and coalesce(c.relationship_status, 'active') in ('removed', 'transferred_out')
    order by c.removed_at desc nulls last, c.created_at desc
    limit 1
    for update;

    if v_client_id is not null then
      perform public.reactivate_removed_client_relationship(v_client_id);

      update public.clients c
      set
        user_id = auth.uid(),
        status = 'active',
        email = coalesce(nullif(lower(btrim(c.email)), ''), v_user_email),
        updated_at = now()
      where c.id = v_client_id
        and coalesce(c.relationship_status, 'active') = 'active'
      returning c.id into v_client_id;
    end if;
  end if;

  if v_client_id is null then
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id is null
      and c.user_id = auth.uid()
    limit 1
    for update;
  end if;

  if v_client_id is null then
    v_name := coalesce(
      nullif(trim(p_display_name), ''),
      split_part(coalesce(v_user_email, auth.jwt() ->> 'email'), '@', 1),
      'Client'
    );

    insert into public.clients (
      workspace_id,
      user_id,
      display_name,
      full_name,
      status,
      relationship_status,
      email
    )
    values (v_inv.workspace_id, auth.uid(), v_name, v_name, 'active', 'active', v_user_email)
    returning id into v_client_id;
  else
    update public.clients
    set
      workspace_id = v_inv.workspace_id,
      status = 'active',
      relationship_status = 'active',
      removed_at = null,
      removed_by_user_id = null,
      email = coalesce(nullif(lower(btrim(email)), ''), v_user_email),
      display_name = coalesce(display_name, nullif(trim(p_display_name), '')),
      full_name = coalesce(full_name, nullif(trim(p_display_name), ''))
    where id = v_client_id
      and coalesce(relationship_status, 'active') <> 'transferred_out';
  end if;

  perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite');

  update public.invites
  set uses = uses + 1
  where id = v_inv.id;

  return query select v_inv.workspace_id, v_client_id;
end;
$$;

grant execute on function public.accept_invite(text) to anon, authenticated, service_role;
grant execute on function public.accept_invite(text, text) to anon, authenticated, service_role;
