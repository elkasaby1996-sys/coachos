-- Pass 1: low-risk advisor cleanup
-- - Rewrite generic legacy RLS policies to use initplan-safe auth lookups
-- - Drop a duplicate pt_profiles index
-- - Set explicit search_path on the remaining advisor-flagged functions
-- - Tighten common RLS helper functions to read auth.uid() once

do $$
declare
  r record;
  has_trainer_id boolean;
  has_client_id boolean;
  has_user_id boolean;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname in ('trainer_isolation', 'client_read_own')
    order by tablename, policyname
  loop
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = r.tablename
        and column_name = 'trainer_id'
    )
    into has_trainer_id;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = r.tablename
        and column_name = 'client_id'
    )
    into has_client_id;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = r.tablename
        and column_name = 'user_id'
    )
    into has_user_id;

    execute format(
      'drop policy if exists %I on public.%I',
      r.policyname,
      r.tablename
    );

    if r.policyname = 'trainer_isolation' then
      if has_trainer_id then
        execute format(
          'create policy %I on public.%I for all to public using (trainer_id = (select auth.uid())) with check (trainer_id = (select auth.uid()))',
          r.policyname,
          r.tablename
        );
      elsif has_user_id then
        execute format(
          'create policy %I on public.%I for all to public using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
          r.policyname,
          r.tablename
        );
      else
        execute format(
          'create policy %I on public.%I for all to public using (false) with check (false)',
          r.policyname,
          r.tablename
        );
      end if;
    elsif r.policyname = 'client_read_own' then
      if has_client_id then
        execute format(
          'create policy %I on public.%I for select to public using (client_id = (select auth.uid()))',
          r.policyname,
          r.tablename
        );
      elsif has_user_id then
        execute format(
          'create policy %I on public.%I for select to public using (user_id = (select auth.uid()))',
          r.policyname,
          r.tablename
        );
      else
        execute format(
          'create policy %I on public.%I for select to public using (false)',
          r.policyname,
          r.tablename
        );
      end if;
    end if;
  end loop;
end
$$;

drop index if exists public.pt_profiles_user_workspace_uidx;

create or replace function public.is_client_owner(p_client_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_owner_col text;
  v_user_id uuid := (select auth.uid());
  v_is_owner boolean := false;
begin
  if p_client_id is null or v_user_id is null or to_regclass('public.clients') is null then
    return false;
  end if;

  select c.column_name
  into v_owner_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'clients'
    and c.column_name in ('user_id', 'auth_user_id', 'owner_user_id')
  order by case c.column_name
    when 'user_id' then 1
    when 'auth_user_id' then 2
    when 'owner_user_id' then 3
    else 99
  end
  limit 1;

  if v_owner_col is null then
    return false;
  end if;

  execute format(
    'select exists (
       select 1
       from public.clients c
       where c.id = $1
         and c.%I = $2
     )',
    v_owner_col
  )
  into v_is_owner
  using p_client_id, v_user_id;

  return coalesce(v_is_owner, false);
end;
$$;

create or replace function public.is_pt_workspace_member(p_workspace_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if p_workspace_id is null or v_user_id is null or to_regclass('public.workspace_members') is null then
    return false;
  end if;

  return exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
      and wm.role::text like 'pt_%'
  );
end;
$$;

create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = ws_id
      and wm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_pt(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = ws_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('pt_owner', 'pt_coach')
  );
$$;

create or replace function public.enforce_assigned_nutrition_item_client_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  v_is_owner_client boolean;
  v_is_pt boolean;
begin
  select exists (
    select 1
    from public.assigned_nutrition_days andy
    where andy.id = old.assigned_nutrition_day_id
      and public.is_client_owner(andy.client_id)
  ) into v_is_owner_client;

  v_is_pt := public.is_pt_workspace_member(old.workspace_id);

  if v_is_pt then
    return new;
  end if;

  if v_is_owner_client then
    if new.id is distinct from old.id
      or new.workspace_id is distinct from old.workspace_id
      or new.assigned_nutrition_day_id is distinct from old.assigned_nutrition_day_id
      or new.assigned_nutrition_meal_id is distinct from old.assigned_nutrition_meal_id
      or new.template_meal_item_id is distinct from old.template_meal_item_id
      or new.name is distinct from old.name
      or new.serving_label is distinct from old.serving_label
      or new.quantity is distinct from old.quantity
      or new.planned_calories is distinct from old.planned_calories
      or new.planned_protein_g is distinct from old.planned_protein_g
      or new.planned_carbs_g is distinct from old.planned_carbs_g
      or new.planned_fat_g is distinct from old.planned_fat_g
      or new.sort_order is distinct from old.sort_order
      or new.notes is distinct from old.notes
      or new.created_at is distinct from old.created_at then
      raise exception 'Clients can only update actual macro fields and is_completed';
    end if;

    return new;
  end if;

  raise exception 'Not authorized to update assigned nutrition item';
end;
$$;

create or replace function public.enforce_nutrition_day_log_client_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  v_is_owner_client boolean;
  v_is_pt boolean;
begin
  v_is_owner_client := public.is_client_owner(old.client_id);
  v_is_pt := public.is_pt_workspace_member(old.workspace_id);

  if v_is_pt then
    return new;
  end if;

  if v_is_owner_client then
    if new.id is distinct from old.id
      or new.workspace_id is distinct from old.workspace_id
      or new.client_id is distinct from old.client_id
      or new.assigned_nutrition_day_id is distinct from old.assigned_nutrition_day_id
      or new.log_date is distinct from old.log_date
      or new.coach_notes is distinct from old.coach_notes
      or new.created_at is distinct from old.created_at then
      raise exception 'Clients can only update nutrition_day_logs.client_notes';
    end if;

    return new;
  end if;

  raise exception 'Not authorized to update nutrition day log';
end;
$$;

create or replace function public.set_message_workspace_id()
returns trigger
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
begin
  if new.workspace_id is null then
    select workspace_id
    into new.workspace_id
    from public.conversations
    where id = new.conversation_id;
  end if;

  return new;
end;
$$;

create or replace function public.slugify_text(input_text text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select nullif(
    trim(
      both '-'
      from regexp_replace(
        lower(coalesce(input_text, '')),
        '[^a-z0-9]+',
        '-',
        'g'
      )
    ),
    ''
  );
$$;

create or replace function public.touch_conversation_last_message()
returns trigger
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
begin
  update public.conversations
  set last_message_id = new.id,
      last_message_at = new.created_at,
      last_message_preview = coalesce(new.preview, left(new.body, 140)),
      last_message_sender_name = new.sender_name,
      last_message_sender_role = new.sender_role,
      updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;
