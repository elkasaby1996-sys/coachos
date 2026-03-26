


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."assigned_status" AS ENUM (
    'planned',
    'completed',
    'skipped'
);


ALTER TYPE "public"."assigned_status" OWNER TO "postgres";


CREATE TYPE "public"."client_status" AS ENUM (
    'active',
    'paused',
    'completed'
);


ALTER TYPE "public"."client_status" OWNER TO "postgres";


CREATE TYPE "public"."crossfit_block_type" AS ENUM (
    'for_time',
    'amrap',
    'emom',
    'tabata',
    'custom'
);


ALTER TYPE "public"."crossfit_block_type" OWNER TO "postgres";


CREATE TYPE "public"."invite_role" AS ENUM (
    'client'
);


ALTER TYPE "public"."invite_role" OWNER TO "postgres";


CREATE TYPE "public"."question_type" AS ENUM (
    'scale',
    'text',
    'number',
    'choice'
);


ALTER TYPE "public"."question_type" OWNER TO "postgres";


CREATE TYPE "public"."workout_type" AS ENUM (
    'bodybuilding',
    'crossfit'
);


ALTER TYPE "public"."workout_type" OWNER TO "postgres";


CREATE TYPE "public"."workspace_role" AS ENUM (
    'pt_owner',
    'pt_coach'
);


ALTER TYPE "public"."workspace_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_invite"("p_token" "text") RETURNS TABLE("workspace_id" "uuid", "client_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_variable
declare
  v_user_id uuid;
  v_invite public.invites%rowtype;
  v_client_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
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

  if v_client_id is null then
    insert into public.clients (workspace_id, user_id, status, display_name)
    values (v_invite.workspace_id, v_user_id, 'active', null)
    returning id into v_client_id;
  else
    update public.clients c
    set user_id = v_user_id
    where c.id = v_client_id
    returning id into v_client_id;
  end if;

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


ALTER FUNCTION "public"."accept_invite"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_invite"("p_code" "text", "p_display_name" "text" DEFAULT NULL::"text") RETURNS TABLE("workspace_id" "uuid", "client_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
declare
  v_inv public.invites%rowtype;
  v_client_id uuid;
  v_name text;
begin
  -- Must be logged in
  if auth.uid() is null then
    raise exception 'Must be authenticated to accept an invite';
  end if;

  -- Lock invite row to prevent double use
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

  -- If user already is a client in that workspace, return existing
  select c.id into v_client_id
  from public.clients c
  where c.workspace_id = v_inv.workspace_id
    and c.user_id = auth.uid()
  limit 1;

  if v_client_id is null then
    v_name := coalesce(nullif(trim(p_display_name), ''), split_part((auth.jwt() ->> 'email'), '@', 1), 'Client');

    insert into public.clients (workspace_id, user_id, display_name, status)
    values (v_inv.workspace_id, auth.uid(), v_name, 'active')
    returning id into v_client_id;
  end if;

  -- consume invite use
  update public.invites
  set uses = uses + 1
  where id = v_inv.id;

  return query select v_inv.workspace_id, v_client_id;
end;
$$;


ALTER FUNCTION "public"."accept_invite"("p_code" "text", "p_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_program_to_client"("p_client_id" "uuid", "p_program_template_id" "uuid", "p_start_date" "date", "p_horizon_days" integer DEFAULT 14) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_client_program_id uuid;
  v_workspace_id uuid;
  v_weeks_count int;
  v_i int;
  v_target_date date;
  v_week_number int;
  v_day_of_week int;
  v_workout_template_id uuid;
  v_is_rest bool;
  v_upserted int := 0;
  v_rowcount int;
begin
  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
  ) then
    raise exception 'Not authorized';
  end if;

  select weeks_count
  into v_weeks_count
  from public.program_templates pt
  where pt.id = p_program_template_id
    and pt.workspace_id = v_workspace_id;

  if v_weeks_count is null then
    raise exception 'Program template not found in workspace';
  end if;

  update public.client_programs
  set is_active = false,
      updated_at = now()
  where client_id = p_client_id
    and is_active = true;

  insert into public.client_programs (
    client_id,
    program_template_id,
    start_date,
    is_active
  ) values (
    p_client_id,
    p_program_template_id,
    p_start_date,
    true
  )
  returning id into v_client_program_id;

  for v_i in 0..greatest(p_horizon_days, 0) - 1 loop
    v_target_date := p_start_date + v_i;
    v_week_number := ((v_i / 7) % v_weeks_count) + 1;
    v_day_of_week := (v_i % 7) + 1;

    select o.workout_template_id, o.is_rest
    into v_workout_template_id, v_is_rest
    from public.client_program_overrides o
    where o.client_program_id = v_client_program_id
      and o.override_date = v_target_date;

    if not found then
      select d.workout_template_id, d.is_rest
      into v_workout_template_id, v_is_rest
      from public.program_template_days d
      where d.program_template_id = p_program_template_id
        and d.week_number = v_week_number
        and d.day_of_week = v_day_of_week
      order by d.sort_order asc
      limit 1;
    end if;

    if not found then
      continue;
    end if;

    if v_is_rest or v_workout_template_id is null then
      update public.assigned_workouts
      set status = 'planned',
          workout_template_id = null,
          day_type = 'rest',
          program_id = p_program_template_id,
          program_day_index = v_i
      where client_id = p_client_id
        and scheduled_date = v_target_date
        and workout_template_id is null;

      get diagnostics v_rowcount = row_count;

      if v_rowcount = 0 then
        insert into public.assigned_workouts (
          client_id,
          workout_template_id,
          scheduled_date,
          status,
          day_type,
          program_id,
          program_day_index
        ) values (
          p_client_id,
          null,
          v_target_date,
          'planned',
          'rest',
          p_program_template_id,
          v_i
        );
        v_upserted := v_upserted + 1;
      else
        v_upserted := v_upserted + v_rowcount;
      end if;
    else
      insert into public.assigned_workouts (
        client_id,
        workout_template_id,
        scheduled_date,
        status,
        day_type,
        program_id,
        program_day_index
      ) values (
        p_client_id,
        v_workout_template_id,
        v_target_date,
        'planned',
        'workout',
        p_program_template_id,
        v_i
      )
      on conflict (client_id, scheduled_date, workout_template_id)
      do update set
        status = 'planned',
        day_type = 'workout',
        program_id = p_program_template_id,
        program_day_index = v_i;

      get diagnostics v_rowcount = row_count;
      v_upserted := v_upserted + v_rowcount;
    end if;
  end loop;

  return v_upserted;
end;
$$;


ALTER FUNCTION "public"."apply_program_to_client"("p_client_id" "uuid", "p_program_template_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_nutrition_template_to_client"("p_client_id" "uuid", "p_template_id" "uuid", "p_start_date" "date") RETURNS TABLE("assigned_plan_id" "uuid", "days_inserted" integer, "meals_inserted" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_workspace_id uuid;
  v_template_workspace_id uuid;
  v_duration_weeks int;
  v_end_date date;
  v_plan_id uuid;
begin
  if p_client_id is null or p_template_id is null or p_start_date is null then
    raise exception 'client, template and start_date are required';
  end if;

  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;

  if not public.is_pt_workspace_member(v_workspace_id) then
    raise exception 'Not authorized';
  end if;

  select nt.workspace_id, nt.duration_weeks
  into v_template_workspace_id, v_duration_weeks
  from public.nutrition_templates nt
  where nt.id = p_template_id;

  if v_template_workspace_id is null then
    raise exception 'Template not found';
  end if;

  if v_template_workspace_id <> v_workspace_id then
    raise exception 'Template not in client workspace';
  end if;

  v_end_date := p_start_date + ((v_duration_weeks * 7) - 1);

  insert into public.assigned_nutrition_plans (
    client_id,
    nutrition_template_id,
    start_date,
    end_date,
    status
  ) values (
    p_client_id,
    p_template_id,
    p_start_date,
    v_end_date,
    'active'
  )
  returning id into v_plan_id;

  with inserted_days as (
    insert into public.assigned_nutrition_days (
      assigned_nutrition_plan_id,
      date,
      week_index,
      day_of_week,
      notes
    )
    select
      v_plan_id,
      (p_start_date + ((td.week_index - 1) * 7) + (td.day_of_week - 1))::date as date,
      td.week_index,
      td.day_of_week,
      td.notes
    from public.nutrition_template_days td
    where td.nutrition_template_id = p_template_id
      and td.week_index <= v_duration_weeks
    order by td.week_index, td.day_of_week
    returning id, week_index, day_of_week
  ),
  inserted_meals as (
    insert into public.assigned_nutrition_meals (
      assigned_nutrition_day_id,
      template_meal_id,
      meal_order,
      meal_name,
      recipe_text,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      notes
    )
    select
      d.id,
      tm.id,
      tm.meal_order,
      tm.meal_name,
      tm.recipe_text,
      coalesce(comp.calories_sum, tm.calories),
      coalesce(comp.protein_sum, tm.protein_g),
      coalesce(comp.carbs_sum, tm.carbs_g),
      coalesce(comp.fat_sum, tm.fat_g),
      tm.notes
    from inserted_days d
    join public.nutrition_template_days td
      on td.nutrition_template_id = p_template_id
     and td.week_index = d.week_index
     and td.day_of_week = d.day_of_week
    join public.nutrition_template_meals tm
      on tm.nutrition_template_day_id = td.id
    left join (
      select
        nutrition_template_meal_id,
        sum(calories)::int as calories_sum,
        sum(protein_g) as protein_sum,
        sum(carbs_g) as carbs_sum,
        sum(fat_g) as fat_sum
      from public.nutrition_template_meal_components
      group by nutrition_template_meal_id
    ) comp on comp.nutrition_template_meal_id = tm.id
    order by d.week_index, d.day_of_week, tm.meal_order, tm.id
    returning id, template_meal_id
  ),
  inserted_components as (
    insert into public.assigned_nutrition_meal_components (
      assigned_nutrition_meal_id,
      template_component_id,
      sort_order,
      component_name,
      quantity,
      unit,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      recipe_text,
      notes
    )
    select
      am.id,
      tc.id,
      tc.sort_order,
      tc.component_name,
      tc.quantity,
      tc.unit,
      tc.calories,
      tc.protein_g,
      tc.carbs_g,
      tc.fat_g,
      tc.recipe_text,
      tc.notes
    from inserted_meals am
    join public.nutrition_template_meal_components tc
      on tc.nutrition_template_meal_id = am.template_meal_id
    order by am.id, tc.sort_order, tc.id
    returning 1
  )
  select
    v_plan_id,
    (select count(*)::int from inserted_days),
    (select count(*)::int from inserted_meals)
  into assigned_plan_id, days_inserted, meals_inserted;

  return next;
end;
$$;


ALTER FUNCTION "public"."assign_nutrition_template_to_client"("p_client_id" "uuid", "p_template_id" "uuid", "p_start_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_program_to_client"("p_client_id" "uuid", "p_program_id" "uuid", "p_start_date" "date", "p_days_ahead" integer DEFAULT 14) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_workspace_id uuid;
  v_program_workspace_id uuid;
  v_weeks_count int;
  v_i int;
  v_target_date date;
  v_week_number int;
  v_day_of_week int;
  v_workout_template_id uuid;
  v_is_rest bool;
  v_upserted int := 0;
  v_rowcount int;
begin
  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
  ) then
    raise exception 'Not authorized';
  end if;

  select pt.workspace_id, pt.weeks_count
  into v_program_workspace_id, v_weeks_count
  from public.program_templates pt
  where pt.id = p_program_id;

  if v_program_workspace_id is null then
    raise exception 'Program not found';
  end if;

  if v_program_workspace_id <> v_workspace_id then
    raise exception 'Program not found in workspace';
  end if;

  update public.client_program_assignments
  set is_active = false
  where client_id = p_client_id
    and is_active = true;

  insert into public.client_program_assignments (
    workspace_id,
    client_id,
    program_id,
    start_date,
    is_active
  ) values (
    v_workspace_id,
    p_client_id,
    p_program_id,
    p_start_date,
    true
  );

  if to_regclass('public.client_programs') is not null then
    update public.client_programs
    set is_active = false,
        updated_at = now()
    where client_id = p_client_id
      and is_active = true;

    insert into public.client_programs (
      client_id,
      program_template_id,
      start_date,
      is_active
    ) values (
      p_client_id,
      p_program_id,
      p_start_date,
      true
    );
  end if;

  for v_i in 0..greatest(p_days_ahead, 0) - 1 loop
    v_target_date := p_start_date + v_i;
    v_week_number := ((v_i / 7) % v_weeks_count) + 1;
    v_day_of_week := (v_i % 7) + 1;

    select d.workout_template_id, d.is_rest
    into v_workout_template_id, v_is_rest
    from public.program_template_days d
    where d.program_template_id = p_program_id
      and d.week_number = v_week_number
      and d.day_of_week = v_day_of_week
    order by d.sort_order asc
    limit 1;

    if not found then
      continue;
    end if;

    if v_is_rest or v_workout_template_id is null then
      update public.assigned_workouts
      set workout_template_id = null,
          day_type = 'rest',
          status = 'planned',
          program_id = p_program_id,
          program_day_index = v_i
      where client_id = p_client_id
        and scheduled_date = v_target_date;

      get diagnostics v_rowcount = row_count;

      if v_rowcount = 0 then
        insert into public.assigned_workouts (
          client_id,
          workout_template_id,
          scheduled_date,
          status,
          day_type,
          program_id,
          program_day_index
        ) values (
          p_client_id,
          null,
          v_target_date,
          'planned',
          'rest',
          p_program_id,
          v_i
        );
        v_upserted := v_upserted + 1;
      else
        v_upserted := v_upserted + v_rowcount;
      end if;
    else
      update public.assigned_workouts
      set workout_template_id = v_workout_template_id,
          day_type = 'workout',
          status = 'planned',
          program_id = p_program_id,
          program_day_index = v_i
      where client_id = p_client_id
        and scheduled_date = v_target_date;

      get diagnostics v_rowcount = row_count;

      if v_rowcount = 0 then
        insert into public.assigned_workouts (
          client_id,
          workout_template_id,
          scheduled_date,
          status,
          day_type,
          program_id,
          program_day_index
        ) values (
          p_client_id,
          v_workout_template_id,
          v_target_date,
          'planned',
          'workout',
          p_program_id,
          v_i
        );
        v_upserted := v_upserted + 1;
      else
        v_upserted := v_upserted + v_rowcount;
      end if;
    end if;
  end loop;

  return v_upserted;
end;
$$;


ALTER FUNCTION "public"."assign_program_to_client"("p_client_id" "uuid", "p_program_id" "uuid", "p_start_date" "date", "p_days_ahead" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_workout_with_template"("p_client_id" "uuid", "p_scheduled_date" "date", "p_workout_template_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid;
  v_assigned_workout_id uuid;
  v_client_workspace_id uuid;
  v_template_workspace_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_client_id IS NULL OR p_scheduled_date IS NULL OR p_workout_template_id IS NULL THEN
    RAISE EXCEPTION 'client_id, scheduled_date and workout_template_id are required';
  END IF;

  SELECT c.workspace_id
  INTO v_client_workspace_id
  FROM public.clients c
  WHERE c.id = p_client_id;

  IF v_client_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  SELECT wt.workspace_id
  INTO v_template_workspace_id
  FROM public.workout_templates wt
  WHERE wt.id = p_workout_template_id;

  IF v_template_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workout template not found';
  END IF;

  IF v_template_workspace_id <> v_client_workspace_id THEN
    RAISE EXCEPTION 'Template not in client workspace';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = v_client_workspace_id
      AND wm.user_id = v_user_id
      AND wm.role::text LIKE 'pt_%'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.assigned_workouts (client_id, workout_template_id, scheduled_date, status)
  VALUES (p_client_id, p_workout_template_id, p_scheduled_date, 'planned')
  ON CONFLICT (client_id, scheduled_date, workout_template_id)
  DO UPDATE SET status = EXCLUDED.status
  RETURNING id INTO v_assigned_workout_id;

  PERFORM public.materialize_assigned_workout_exercises(v_assigned_workout_id);

  RETURN v_assigned_workout_id;
END;
$$;


ALTER FUNCTION "public"."assign_workout_with_template"("p_client_id" "uuid", "p_scheduled_date" "date", "p_workout_template_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_materialize_assigned_exercises"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.materialize_assigned_workout_exercises(NEW.id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.workout_template_id IS DISTINCT FROM OLD.workout_template_id THEN
      PERFORM public.materialize_assigned_workout_exercises(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_materialize_assigned_exercises"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_invite"("p_code" "text") RETURNS TABLE("id" "uuid", "workspace_id" "uuid", "role" "text", "code" "text", "expires_at" timestamp with time zone, "max_uses" integer, "uses" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
BEGIN
  RETURN QUERY
  UPDATE public.invites i
  SET uses = COALESCE(i.uses, 0) + 1
  WHERE i.code = p_code
    AND (i.expires_at IS NULL OR i.expires_at > now())
    AND (i.max_uses IS NULL OR COALESCE(i.uses, 0) < i.max_uses)
  RETURNING i.id, i.workspace_id, i.role::text, i.code, i.expires_at, i.max_uses, i.uses;
END;
$$;


ALTER FUNCTION "public"."consume_invite"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_invite"("p_workspace_id" "uuid", "p_max_uses" integer DEFAULT 1, "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("code" "text", "invite_link" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
declare
  v_code text;
begin
  -- Only allow PTs in the workspace to create invites
  if not exists (
    select 1 from public.workspace_members wm
    where wm.user_id = auth.uid()
      and wm.workspace_id = p_workspace_id
  ) then
    raise exception 'Not allowed to create invites for this workspace';
  end if;

  -- Generate a simple 8-char code (retry if collision)
  loop
    v_code := upper(substr(encode(gen_random_bytes(6), 'base64'), 1, 8));
    v_code := replace(replace(v_code, '+', 'A'), '/', 'B');

    exit when not exists (select 1 from public.invites i where i.code = v_code);
  end loop;

  insert into public.invites (workspace_id, code, max_uses, uses, expires_at, created_by_user_id)
  values (p_workspace_id, v_code, greatest(p_max_uses, 1), 0, p_expires_at, auth.uid());

  return query
  select
    v_code as code,
    (current_setting('request.headers', true)::json->>'origin') || '/join/' || v_code as invite_link;
end;
$$;


ALTER FUNCTION "public"."create_invite"("p_workspace_id" "uuid", "p_max_uses" integer, "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_workspace"("p_name" "text") RETURNS TABLE("workspace_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_variable
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_name text;
  v_member_id uuid;
  v_profile_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_name := nullif(trim(p_name), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Workspace name is required';
  END IF;

  INSERT INTO public.workspaces (name, owner_user_id)
  VALUES (v_name, v_user_id)
  RETURNING id INTO v_workspace_id;

  SELECT wm.id
  INTO v_member_id
  FROM public.workspace_members wm
  WHERE wm.workspace_id = v_workspace_id
    AND wm.user_id = v_user_id
  LIMIT 1
  FOR UPDATE;

  IF v_member_id IS NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (v_workspace_id, v_user_id, 'pt_owner');
  ELSE
    UPDATE public.workspace_members wm
    SET role = 'pt_owner'
    WHERE wm.id = v_member_id;
  END IF;

  SELECT pp.id
  INTO v_profile_id
  FROM public.pt_profiles pp
  WHERE pp.user_id = v_user_id
    AND pp.workspace_id = v_workspace_id
  LIMIT 1
  FOR UPDATE;

  IF v_profile_id IS NULL THEN
    INSERT INTO public.pt_profiles (user_id, workspace_id)
    VALUES (v_user_id, v_workspace_id);
  END IF;

  workspace_id := v_workspace_id;
  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."create_workspace"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_assigned_nutrition_item_client_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_is_owner_client boolean;
  v_is_pt boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.assigned_nutrition_days andy
    WHERE andy.id = OLD.assigned_nutrition_day_id
      AND public.is_client_owner(andy.client_id)
  ) INTO v_is_owner_client;

  v_is_pt := public.is_pt_workspace_member(OLD.workspace_id);

  IF v_is_pt THEN
    RETURN NEW;
  END IF;

  IF v_is_owner_client THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
      OR NEW.assigned_nutrition_day_id IS DISTINCT FROM OLD.assigned_nutrition_day_id
      OR NEW.assigned_nutrition_meal_id IS DISTINCT FROM OLD.assigned_nutrition_meal_id
      OR NEW.template_meal_item_id IS DISTINCT FROM OLD.template_meal_item_id
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.serving_label IS DISTINCT FROM OLD.serving_label
      OR NEW.quantity IS DISTINCT FROM OLD.quantity
      OR NEW.planned_calories IS DISTINCT FROM OLD.planned_calories
      OR NEW.planned_protein_g IS DISTINCT FROM OLD.planned_protein_g
      OR NEW.planned_carbs_g IS DISTINCT FROM OLD.planned_carbs_g
      OR NEW.planned_fat_g IS DISTINCT FROM OLD.planned_fat_g
      OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
      OR NEW.notes IS DISTINCT FROM OLD.notes
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Clients can only update actual macro fields and is_completed';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not authorized to update assigned nutrition item';
END;
$$;


ALTER FUNCTION "public"."enforce_assigned_nutrition_item_client_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_nutrition_day_log_client_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_is_owner_client boolean;
  v_is_pt boolean;
BEGIN
  v_is_owner_client := public.is_client_owner(OLD.client_id);

  v_is_pt := public.is_pt_workspace_member(OLD.workspace_id);

  IF v_is_pt THEN
    RETURN NEW;
  END IF;

  IF v_is_owner_client THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
      OR NEW.client_id IS DISTINCT FROM OLD.client_id
      OR NEW.assigned_nutrition_day_id IS DISTINCT FROM OLD.assigned_nutrition_day_id
      OR NEW.log_date IS DISTINCT FROM OLD.log_date
      OR NEW.coach_notes IS DISTINCT FROM OLD.coach_notes
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Clients can only update nutrition_day_logs.client_notes';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not authorized to update nutrition day log';
END;
$$;


ALTER FUNCTION "public"."enforce_nutrition_day_log_client_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invite_by_code"("p_code" "text") RETURNS TABLE("id" "uuid", "workspace_id" "uuid", "role" "text", "code" "text", "expires_at" timestamp with time zone, "max_uses" integer, "uses" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
  SELECT i.id, i.workspace_id, i.role::text, i.code, i.expires_at, i.max_uses, i.uses
  FROM public.invites i
  WHERE i.code = p_code
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_invite_by_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_notification_count"() RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select count(*)::integer
  from public.notifications
  where recipient_user_id = auth.uid()
    and is_read = false;
$$;


ALTER FUNCTION "public"."get_unread_notification_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_assigned_workout_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_client_user_id uuid;
  v_workout_name text;
  v_date_label text;
begin
  select c.user_id
  into v_client_user_id
  from public.clients c
  where c.id = new.client_id;

  if v_client_user_id is null then
    return new;
  end if;

  v_workout_name := coalesce(nullif(trim(new.workout_name), ''), 'Workout');
  v_date_label := to_char(new.scheduled_date::timestamp, 'Mon DD');

  if tg_op = 'INSERT' then
    perform public.notify_user(
      v_client_user_id,
      'workout_assigned',
      'Workout assigned',
      format('%s is scheduled for %s.', v_workout_name, v_date_label),
      '/app/home',
      'assigned_workout',
      new.id,
      null,
      jsonb_build_object('scheduled_date', new.scheduled_date, 'client_id', new.client_id),
      'workouts',
      'normal'
    );
    return new;
  end if;

  if new.scheduled_date is not distinct from old.scheduled_date
     and new.workout_template_id is not distinct from old.workout_template_id
     and new.day_type is not distinct from old.day_type
     and coalesce(new.workout_name, '') = coalesce(old.workout_name, '')
     and coalesce(new.coach_note, '') = coalesce(old.coach_note, '') then
    return new;
  end if;

  perform public.notify_user(
    v_client_user_id,
    'workout_updated',
    'Workout updated',
    format('Your coach updated your workout for %s.', v_date_label),
    '/app/home',
    'assigned_workout',
    new.id,
    null,
    jsonb_build_object('scheduled_date', new.scheduled_date, 'client_id', new.client_id),
    'workouts',
    'normal'
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_assigned_workout_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_checkin_requested_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_client_user_id uuid;
  v_workspace_id uuid;
begin
  select c.user_id, c.workspace_id
  into v_client_user_id, v_workspace_id
  from public.clients c
  where c.id = new.client_id;

  if v_client_user_id is null or new.submitted_at is not null then
    return new;
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = auth.uid()
      and wm.role like 'pt_%'
  ) then
    return new;
  end if;

  perform public.notify_user(
    v_client_user_id,
    'checkin_requested',
    'Check-in requested',
    format('Your coach requested a check-in for the week ending %s.', to_char(new.week_ending_saturday::timestamp, 'Mon DD')),
    '/app/checkin',
    'checkin',
    new.id,
    null,
    jsonb_build_object('week_ending_saturday', new.week_ending_saturday, 'client_id', new.client_id),
    'checkins',
    'normal'
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_checkin_requested_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_checkin_submitted_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_workspace_id uuid;
  v_client_name text;
  v_recipient record;
begin
  if old.submitted_at is not null or new.submitted_at is null then
    return new;
  end if;

  select c.workspace_id,
         coalesce(nullif(trim(c.display_name), ''), 'A client')
  into v_workspace_id, v_client_name
  from public.clients c
  where c.id = new.client_id;

  if v_workspace_id is null then
    return new;
  end if;

  for v_recipient in
    select wm.user_id
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.role like 'pt_%'
  loop
    perform public.notify_user(
      v_recipient.user_id,
      'checkin_submitted',
      'Check-in submitted',
      format('%s submitted a check-in.', v_client_name),
      format('/pt/clients/%s?tab=checkins', new.client_id),
      'checkin',
      new.id,
      null,
      jsonb_build_object('week_ending_saturday', new.week_ending_saturday, 'client_id', new.client_id),
      'checkins',
      'normal'
    );
  end loop;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_checkin_submitted_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_invite_accepted_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_client record;
  v_recipient record;
  v_client_name text;
  v_target_client_id uuid;
begin
  if coalesce(new.uses, 0) <= coalesce(old.uses, 0)
     and new.used_at is not distinct from old.used_at then
    return new;
  end if;

  select c.id,
         coalesce(nullif(trim(c.display_name), ''), 'A client') as display_name
  into v_client
  from public.clients c
  where c.workspace_id = new.workspace_id
    and c.user_id = auth.uid()
  order by c.created_at desc
  limit 1;

  v_target_client_id := v_client.id;
  v_client_name := coalesce(v_client.display_name, 'A client');

  if new.created_by_user_id is not null then
    perform public.notify_user(
      new.created_by_user_id,
      'invite_accepted',
      'Invite accepted',
      format('%s accepted your invite.', v_client_name),
      coalesce(format('/pt/clients/%s', v_target_client_id), '/pt/clients'),
      'invite',
      new.id,
      null,
      jsonb_build_object('workspace_id', new.workspace_id, 'client_id', v_target_client_id),
      'system',
      'normal'
    );
    return new;
  end if;

  for v_recipient in
    select wm.user_id
    from public.workspace_members wm
    where wm.workspace_id = new.workspace_id
      and wm.role like 'pt_%'
  loop
    perform public.notify_user(
      v_recipient.user_id,
      'client_joined_workspace',
      'Client joined your workspace',
      format('%s joined your workspace.', v_client_name),
      coalesce(format('/pt/clients/%s', v_target_client_id), '/pt/clients'),
      'client',
      v_target_client_id,
      null,
      jsonb_build_object('workspace_id', new.workspace_id, 'client_id', v_target_client_id),
      'system',
      'normal'
    );
  end loop;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_invite_accepted_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_message_received_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_conversation record;
  v_recipient record;
  v_client_name text;
  v_preview text;
begin
  select conv.client_id,
         conv.workspace_id,
         c.user_id as client_user_id,
         coalesce(nullif(trim(c.display_name), ''), 'Client') as client_name
  into v_conversation
  from public.conversations conv
  join public.clients c on c.id = conv.client_id
  where conv.id = new.conversation_id;

  if v_conversation.client_id is null then
    return new;
  end if;

  v_client_name := v_conversation.client_name;
  v_preview := left(coalesce(new.preview, new.body, ''), 140);

  if new.sender_role = 'pt' then
    perform public.notify_user(
      v_conversation.client_user_id,
      'message_received',
      'New message from your coach',
      coalesce(nullif(v_preview, ''), 'Open messages to read it.'),
      '/app/messages',
      'conversation',
      new.conversation_id,
      null,
      jsonb_build_object('conversation_id', new.conversation_id, 'client_id', v_conversation.client_id),
      'messages',
      'normal'
    );
    return new;
  end if;

  if new.sender_role = 'client' then
    for v_recipient in
      select wm.user_id
      from public.workspace_members wm
      where wm.workspace_id = v_conversation.workspace_id
        and wm.role like 'pt_%'
    loop
      perform public.notify_user(
        v_recipient.user_id,
        'message_received',
        format('New message from %s', v_client_name),
        coalesce(nullif(v_preview, ''), 'Open messages to read it.'),
        format('/pt/messages?client=%s', v_conversation.client_id),
        'conversation',
        new.conversation_id,
        null,
        jsonb_build_object('conversation_id', new.conversation_id, 'client_id', v_conversation.client_id),
        'messages',
        'normal'
      );
    end loop;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_message_received_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_client_owner"("p_client_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_owner_col text;
  v_is_owner boolean := false;
begin
  if p_client_id is null or to_regclass('public.clients') is null then
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
         and c.%I = (select auth.uid())
     )',
    v_owner_col
  )
  into v_is_owner
  using p_client_id;

  return coalesce(v_is_owner, false);
end;
$_$;


ALTER FUNCTION "public"."is_client_owner"("p_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_pt_workspace_member"("p_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_is_pt boolean := false;
begin
  if p_workspace_id is null or to_regclass('public.workspace_members') is null then
    return false;
  end if;

  execute $sql$
    select exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = $1
        and wm.user_id = (select auth.uid())
        and wm.role::text like 'pt_%'
    )
  $sql$
  into v_is_pt
  using p_workspace_id;

  return coalesce(v_is_pt, false);
end;
$_$;


ALTER FUNCTION "public"."is_pt_workspace_member"("p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_workspace_member"("ws_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = ws_id
      and wm.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_workspace_member"("ws_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_workspace_pt"("ws_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = ws_id
      and wm.user_id = auth.uid()
      and wm.role in ('pt_owner', 'pt_coach')
  );
$$;


ALTER FUNCTION "public"."is_workspace_pt"("ws_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_all_notifications_read"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user_id uuid;
  v_updated integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.notifications
  set is_read = true,
      read_at = now()
  where recipient_user_id = v_user_id
    and is_read = false;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;


ALTER FUNCTION "public"."mark_all_notifications_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."materialize_assigned_workout_exercises"("p_assigned_workout_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_workout_template_id uuid;
BEGIN
  IF p_assigned_workout_id IS NULL THEN
    RETURN;
  END IF;

  SELECT aw.workout_template_id
  INTO v_workout_template_id
  FROM public.assigned_workouts aw
  WHERE aw.id = p_assigned_workout_id;

  DELETE FROM public.assigned_workout_exercises awe
  WHERE awe.assigned_workout_id = p_assigned_workout_id;

  IF v_workout_template_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.assigned_workout_exercises (
    assigned_workout_id,
    exercise_id,
    sort_order,
    sets,
    reps,
    rpe,
    tempo,
    notes,
    rest_seconds,
    superset_group,
    is_completed
  )
  SELECT
    p_assigned_workout_id,
    wte.exercise_id,
    COALESCE(wte.sort_order, 0) AS sort_order,
    wte.sets,
    wte.reps,
    wte.rpe,
    wte.tempo,
    wte.notes,
    CASE WHEN wte.superset_group IS NULL THEN wte.rest_seconds ELSE 0 END,
    wte.superset_group,
    false AS is_completed
  FROM public.workout_template_exercises wte
  WHERE wte.workout_template_id = v_workout_template_id
  ORDER BY COALESCE(wte.sort_order, 0) ASC;
END;
$$;


ALTER FUNCTION "public"."materialize_assigned_workout_exercises"("p_assigned_workout_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notification_pref_enabled"("p_user_id" "uuid", "p_type" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  prefs public.notification_preferences%rowtype;
begin
  if p_user_id is null then
    return false;
  end if;

  select *
  into prefs
  from public.notification_preferences
  where user_id = p_user_id;

  if prefs.user_id is null then
    return true;
  end if;

  if coalesce(prefs.in_app_enabled, true) = false then
    return false;
  end if;

  case p_type
    when 'workout_assigned' then return coalesce(prefs.workout_assigned, true);
    when 'workout_updated' then return coalesce(prefs.workout_updated, true);
    when 'checkin_requested' then return coalesce(prefs.checkin_requested, true);
    when 'checkin_submitted' then return coalesce(prefs.checkin_submitted, true);
    when 'message_received' then return coalesce(prefs.message_received, true);
    when 'milestone_achieved' then return coalesce(prefs.milestone_events, true);
    when 'workout_due_today' then return coalesce(prefs.reminders_enabled, true);
    when 'checkin_due_tomorrow' then return coalesce(prefs.reminders_enabled, true);
    when 'client_inactive' then return coalesce(prefs.inactivity_alerts, true);
    when 'system' then return coalesce(prefs.system_events, true);
    when 'client_joined_workspace' then return coalesce(prefs.system_events, true);
    when 'invite_accepted' then return coalesce(prefs.system_events, true);
    else
      return true;
  end case;
end;
$$;


ALTER FUNCTION "public"."notification_pref_enabled"("p_user_id" "uuid", "p_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_user"("p_recipient_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_action_url" "text" DEFAULT NULL::"text", "p_entity_type" "text" DEFAULT NULL::"text", "p_entity_id" "uuid" DEFAULT NULL::"uuid", "p_image_url" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_category" "text" DEFAULT 'general'::"text", "p_priority" "text" DEFAULT 'normal'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_notification_id uuid;
begin
  if p_recipient_user_id is null then
    return null;
  end if;

  if not public.notification_pref_enabled(p_recipient_user_id, p_type) then
    return null;
  end if;

  insert into public.notifications (
    recipient_user_id,
    type,
    category,
    priority,
    title,
    body,
    action_url,
    entity_type,
    entity_id,
    image_url,
    metadata
  )
  values (
    p_recipient_user_id,
    p_type,
    coalesce(nullif(trim(p_category), ''), 'general'),
    coalesce(nullif(trim(p_priority), ''), 'normal'),
    p_title,
    p_body,
    p_action_url,
    p_entity_type,
    p_entity_id,
    p_image_url,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;


ALTER FUNCTION "public"."notify_user"("p_recipient_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_action_url" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_image_url" "text", "p_metadata" "jsonb", "p_category" "text", "p_priority" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pt_clients_summary"("p_workspace_id" "uuid", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "user_id" "uuid", "status" "text", "display_name" "text", "tags" "text"[], "created_at" timestamp with time zone, "last_session_at" timestamp with time zone, "last_checkin_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = v_user_id
      AND wm.role::text LIKE 'pt_%'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.status::text,
    c.display_name,
    c.tags,
    c.created_at,
    ls.last_session_at,
    lc.last_checkin_at
  FROM public.clients c
  LEFT JOIN LATERAL (
    SELECT MAX(ws.started_at) AS last_session_at
    FROM public.workout_sessions ws
    LEFT JOIN public.assigned_workouts aw ON aw.id = ws.assigned_workout_id
    WHERE ws.client_id = c.id OR aw.client_id = c.id
  ) ls ON true
  LEFT JOIN LATERAL (
    SELECT MAX(COALESCE(ci.submitted_at, ci.created_at)) AS last_checkin_at
    FROM public.checkins ci
    WHERE ci.client_id = c.id
  ) lc ON true
  WHERE c.workspace_id = p_workspace_id
  ORDER BY c.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."pt_clients_summary"("p_workspace_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pt_dashboard_summary"("p_workspace_id" "uuid", "p_coach_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
DECLARE
  v_user_id uuid;
  v_today date := current_date;
  v_start_week date := v_today - 6;
  v_end_week date := v_today + 6;
  v_last_saturday date := v_today - ((EXTRACT(DOW FROM v_today)::int - 6 + 7) % 7);
  v_client_ids uuid[];
  v_clients jsonb;
  v_checkins jsonb;
  v_assigned jsonb;
  v_messages jsonb;
  v_unread int;
  v_todos jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_coach_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = v_user_id
      AND wm.role::text LIKE 'pt_%'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT array_agg(id) INTO v_client_ids
  FROM public.clients
  WHERE workspace_id = p_workspace_id;

  SELECT jsonb_agg(c) INTO v_clients
  FROM (
    SELECT id, workspace_id, user_id, status, display_name, created_at, tags, timezone
    FROM public.clients
    WHERE workspace_id = p_workspace_id
    ORDER BY created_at DESC
  ) c;

  SELECT jsonb_agg(a) INTO v_assigned
  FROM (
    SELECT id, client_id, status, scheduled_date
    FROM public.assigned_workouts
    WHERE client_id = ANY(v_client_ids)
      AND scheduled_date BETWEEN v_start_week AND v_today
  ) a;

  SELECT jsonb_agg(ci) INTO v_checkins
  FROM (
    SELECT id, client_id, week_ending_saturday, submitted_at, created_at
    FROM public.checkins
    WHERE client_id = ANY(v_client_ids)
      AND week_ending_saturday BETWEEN v_start_week AND v_end_week
  ) ci;

  SELECT jsonb_agg(m) INTO v_messages
  FROM (
    SELECT
      conv.id,
      conv.last_message_at AS created_at,
      conv.last_message_sender_name AS sender_name,
      conv.last_message_preview AS preview
    FROM public.conversations conv
    WHERE conv.workspace_id = p_workspace_id
    ORDER BY conv.last_message_at DESC NULLS LAST
    LIMIT 5
  ) m;

  SELECT count(*) INTO v_unread
  FROM public.messages m
  JOIN public.conversations conv ON conv.id = m.conversation_id
  JOIN public.clients c ON c.id = conv.client_id
  WHERE m.unread = true
    AND c.workspace_id = p_workspace_id;

  SELECT jsonb_agg(t) INTO v_todos
  FROM (
    SELECT id, title, is_done, created_at
    FROM public.coach_todos
    WHERE workspace_id = p_workspace_id
      AND coach_id = p_coach_id
    ORDER BY created_at ASC
  ) t;

  RETURN jsonb_build_object(
    'clients', COALESCE(v_clients, '[]'::jsonb),
    'assignedWorkouts', COALESCE(v_assigned, '[]'::jsonb),
    'checkins', COALESCE(v_checkins, '[]'::jsonb),
    'messages', COALESCE(v_messages, '[]'::jsonb),
    'unreadCount', COALESCE(v_unread, 0),
    'coachTodos', COALESCE(v_todos, '[]'::jsonb),
    'today', v_today::text,
    'lastSaturday', v_last_saturday::text
  );
END;
$$;


ALTER FUNCTION "public"."pt_dashboard_summary"("p_workspace_id" "uuid", "p_coach_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "public"."client_status" DEFAULT 'active'::"public"."client_status" NOT NULL,
    "display_name" "text",
    "goal" "text",
    "injuries" "text",
    "equipment" "text",
    "height_cm" integer,
    "dob" "date",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone" "text",
    "email" "text",
    "location" "text",
    "timezone" "text",
    "unit_preference" "text" DEFAULT 'metric'::"text",
    "gender" "text",
    "training_type" "text" DEFAULT 'online'::"text",
    "gym_name" "text",
    "photo_url" "text",
    "limitations" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "location_country" "text",
    "days_per_week" integer,
    "current_weight" numeric,
    "checkin_template_id" "uuid",
    "checkin_frequency" "text" DEFAULT 'weekly'::"text" NOT NULL,
    "checkin_start_date" "date",
    CONSTRAINT "clients_checkin_frequency_valid" CHECK (("checkin_frequency" = ANY (ARRAY['weekly'::"text", 'biweekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "clients_training_type_check" CHECK (("training_type" = ANY (ARRAY['online'::"text", 'hybrid'::"text", 'in_person'::"text"])))
);

ALTER TABLE ONLY "public"."clients" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pt_update_client_admin_fields"("p_client_id" "uuid", "p_training_type" "text", "p_tags" "text") RETURNS "public"."clients"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
declare
  v_workspace_id uuid;
begin
  select c.workspace_id into v_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if v_workspace_id is null then
    raise exception 'client not found';
  end if;

  -- only PT roles allowed
  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('pt_owner','pt_admin','pt_coach')
  ) then
    raise exception 'not allowed';
  end if;

  if p_training_type is not null and p_training_type not in ('online','hybrid','in_person') then
    raise exception 'invalid training_type %', p_training_type;
  end if;

  update public.clients
  set
    training_type = coalesce(p_training_type, training_type),
    tags = coalesce(p_tags, tags)
  where id = p_client_id;

  return (select c from public.clients c where c.id = p_client_id);
end;
$$;


ALTER FUNCTION "public"."pt_update_client_admin_fields"("p_client_id" "uuid", "p_training_type" "text", "p_tags" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restrict_notification_updates"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.recipient_user_id is distinct from old.recipient_user_id
     or new.type is distinct from old.type
     or new.category is distinct from old.category
     or new.priority is distinct from old.priority
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.action_url is distinct from old.action_url
     or new.entity_type is distinct from old.entity_type
     or new.entity_id is distinct from old.entity_id
     or new.image_url is distinct from old.image_url
     or new.metadata is distinct from old.metadata
     or new.delivery_in_app is distinct from old.delivery_in_app
     or new.delivery_email is distinct from old.delivery_email
     or new.delivery_push is distinct from old.delivery_push
     or new.created_at is distinct from old.created_at then
    raise exception 'Only notification read state can be updated.';
  end if;

  if new.is_read and new.read_at is null then
    new.read_at := now();
  elsif not new.is_read then
    new.read_at := null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."restrict_notification_updates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_message_workspace_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
    BEGIN
      IF NEW.workspace_id IS NULL THEN
        SELECT workspace_id INTO NEW.workspace_id
        FROM public.conversations
        WHERE id = NEW.conversation_id;
      END IF;
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION "public"."set_message_workspace_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_my_appearance_preferences"("p_theme_preference" "text" DEFAULT NULL::"text", "p_compact_density" boolean DEFAULT NULL::boolean) RETURNS TABLE("theme_preference" "text", "compact_density" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_theme_preference IS NOT NULL
     AND p_theme_preference NOT IN ('system', 'dark', 'light') THEN
    RAISE EXCEPTION 'Invalid theme preference';
  END IF;

  UPDATE public.workspace_members wm
  SET
    theme_preference = coalesce(p_theme_preference, wm.theme_preference),
    compact_density = coalesce(p_compact_density, wm.compact_density)
  WHERE wm.user_id = v_user_id
    AND wm.role::text LIKE 'pt_%';

  RETURN QUERY
  SELECT wm.theme_preference, wm.compact_density
  FROM public.workspace_members wm
  WHERE wm.user_id = v_user_id
    AND wm.role::text LIKE 'pt_%'
  ORDER BY wm.role
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."set_my_appearance_preferences"("p_theme_preference" "text", "p_compact_density" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_pt_profile_publication"("p_publish" boolean) RETURNS TABLE("is_published" boolean, "published_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile public.pt_hub_profiles%ROWTYPE;
  v_settings public.pt_hub_settings%ROWTYPE;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.pt_hub_profiles
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PT Hub profile not found';
  END IF;

  SELECT *
  INTO v_settings
  FROM public.pt_hub_settings
  WHERE user_id = v_user_id;

  IF p_publish THEN
    IF coalesce(btrim(v_profile.slug), '') = '' THEN
      v_missing := array_append(v_missing, 'Public URL slug');
    END IF;

    IF coalesce(btrim(v_profile.display_name), '') = '' THEN
      v_missing := array_append(v_missing, 'Display name');
    END IF;

    IF coalesce(btrim(v_profile.headline), '') = '' THEN
      v_missing := array_append(v_missing, 'Headline');
    END IF;

    IF coalesce(btrim(v_profile.short_bio), '') = '' THEN
      v_missing := array_append(v_missing, 'Bio');
    END IF;

    IF coalesce(array_length(v_profile.specialties, 1), 0) = 0 THEN
      v_missing := array_append(v_missing, 'Specialties');
    END IF;

    IF coalesce(array_length(v_profile.certifications, 1), 0) = 0 THEN
      v_missing := array_append(v_missing, 'Certifications');
    END IF;

    IF coalesce(btrim(v_profile.coaching_style), '') = '' THEN
      v_missing := array_append(v_missing, 'Coaching style');
    END IF;

    IF coalesce(btrim(v_profile.profile_photo_url), '') = '' THEN
      v_missing := array_append(v_missing, 'Profile photo');
    END IF;

    IF coalesce(btrim(v_profile.banner_image_url), '') = '' THEN
      v_missing := array_append(v_missing, 'Banner image');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(v_profile.social_links, '[]'::jsonb)) AS item
      WHERE coalesce(btrim(item ->> 'url'), '') <> ''
    ) THEN
      v_missing := array_append(v_missing, 'At least one social link');
    END IF;

    IF coalesce(v_settings.profile_visibility, 'draft') <> 'listed' THEN
      v_missing := array_append(v_missing, 'Profile visibility must be set to Ready to list');
    END IF;

    IF coalesce(btrim(v_settings.contact_email), '') = ''
       AND coalesce(btrim(v_settings.support_email), '') = '' THEN
      v_missing := array_append(v_missing, 'Public contact path');
    END IF;

    IF coalesce(array_length(v_missing, 1), 0) > 0 THEN
      RAISE EXCEPTION
        USING
          MESSAGE = 'Profile is not ready to publish',
          DETAIL = array_to_string(v_missing, ', ');
    END IF;

    UPDATE public.pt_hub_profiles
    SET
      is_published = true,
      published_at = COALESCE(published_at, now())
    WHERE user_id = v_user_id;
  ELSE
    UPDATE public.pt_hub_profiles
    SET
      is_published = false,
      published_at = NULL
    WHERE user_id = v_user_id;
  END IF;

  RETURN QUERY
  SELECT profile.is_published, profile.published_at
  FROM public.pt_hub_profiles profile
  WHERE profile.user_id = v_user_id;
END;
$$;


ALTER FUNCTION "public"."set_pt_profile_publication"("p_publish" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_workout_session_client_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
begin
  if new.client_id is null then
    select aw.client_id
      into new.client_id
    from public.assigned_workouts aw
    where aw.id = new.assigned_workout_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_workout_session_client_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."slugify_text"("input_text" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT NULLIF(
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


ALTER FUNCTION "public"."slugify_text"("input_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_public_pt_application"("p_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_goal_summary" "text", "p_training_experience" "text", "p_budget_interest" "text", "p_package_interest" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_profile RECORD;
  v_lead_id uuid;
BEGIN
  SELECT
    profile.user_id,
    profile.slug
  INTO v_profile
  FROM public.pt_hub_profiles profile
  JOIN public.pt_hub_settings settings
    ON settings.user_id = profile.user_id
  WHERE lower(profile.slug) = lower(btrim(p_slug))
    AND profile.is_published = true
    AND settings.profile_visibility = 'listed'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published profile not found';
  END IF;

  IF coalesce(btrim(p_full_name), '') = '' THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;

  IF coalesce(btrim(p_email), '') = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  IF coalesce(btrim(p_goal_summary), '') = '' THEN
    RAISE EXCEPTION 'Goal summary is required';
  END IF;

  INSERT INTO public.pt_hub_leads (
    user_id,
    full_name,
    email,
    phone,
    goal_summary,
    training_experience,
    budget_interest,
    package_interest,
    status,
    submitted_at,
    source,
    source_slug
  )
  VALUES (
    v_profile.user_id,
    btrim(p_full_name),
    lower(btrim(p_email)),
    NULLIF(btrim(coalesce(p_phone, '')), ''),
    btrim(p_goal_summary),
    NULLIF(btrim(coalesce(p_training_experience, '')), ''),
    NULLIF(btrim(coalesce(p_budget_interest, '')), ''),
    NULLIF(btrim(coalesce(p_package_interest, '')), ''),
    'new',
    now(),
    'public_profile',
    v_profile.slug
  )
  RETURNING id INTO v_lead_id;

  RETURN v_lead_id;
END;
$$;


ALTER FUNCTION "public"."submit_public_pt_application"("p_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_goal_summary" "text", "p_training_experience" "text", "p_budget_interest" "text", "p_package_interest" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_assigned_workout_exercises_from_template"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM public.assigned_workout_exercises
  WHERE assigned_workout_id = NEW.id;

  IF NEW.workout_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.assigned_workout_exercises (
    assigned_workout_id,
    exercise_id,
    sort_order,
    sets,
    reps,
    rpe,
    tempo,
    notes,
    rest_seconds,
    superset_group,
    is_completed
  )
  SELECT
    NEW.id,
    wte.exercise_id,
    COALESCE(wte.sort_order, 0) AS sort_order,
    wte.sets,
    wte.reps,
    wte.rpe,
    wte.tempo,
    wte.notes,
    CASE WHEN wte.superset_group IS NULL THEN wte.rest_seconds ELSE 0 END,
    wte.superset_group,
    false AS is_completed
  FROM public.workout_template_exercises wte
  WHERE wte.workout_template_id = NEW.workout_template_id
  ORDER BY COALESCE(wte.sort_order, 0) ASC;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_assigned_workout_exercises_from_template"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_notification_reminders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user_id uuid;
  v_inserted integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  with pt_workspaces as (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = v_user_id
      and wm.role::text like 'pt_%'
  ),
  birthday_candidates as (
    select
      c.id as client_id,
      coalesce(nullif(trim(c.display_name), ''), 'Client') as client_name,
      case
        when to_char(c.dob, 'MM-DD') = to_char(current_date, 'MM-DD') then 'today'
        when to_char(c.dob, 'MM-DD') = to_char(current_date + 1, 'MM-DD') then 'tomorrow'
        else null
      end as reminder_kind
    from public.clients c
    where c.workspace_id in (select workspace_id from pt_workspaces)
      and c.status = 'active'
      and c.dob is not null
      and to_char(c.dob, 'MM-DD') in (
        to_char(current_date, 'MM-DD'),
        to_char(current_date + 1, 'MM-DD')
      )
  ),
  inserted_birthdays as (
    insert into public.notifications (
      recipient_user_id, type, category, priority, title, body,
      action_url, entity_type, entity_id, metadata
    )
    select
      v_user_id,
      'birthday_reminder',
      'general',
      'normal',
      case when candidate.reminder_kind = 'today' then 'Birthday today' else 'Birthday tomorrow' end,
      case
        when candidate.reminder_kind = 'today' then format('%s has a birthday today.', candidate.client_name)
        else format('%s has a birthday tomorrow.', candidate.client_name)
      end,
      format('/pt/clients/%s?tab=overview', candidate.client_id),
      'client',
      candidate.client_id,
      jsonb_build_object(
        'reminder_kind', candidate.reminder_kind,
        'reminder_date', current_date::text
      )
    from birthday_candidates candidate
    where candidate.reminder_kind is not null
      and not exists (
        select 1
        from public.notifications n
        where n.recipient_user_id = v_user_id
          and n.type = 'birthday_reminder'
          and n.entity_type = 'client'
          and n.entity_id = candidate.client_id
          and n.metadata ->> 'reminder_kind' = candidate.reminder_kind
          and n.metadata ->> 'reminder_date' = current_date::text
      )
    returning 1
  ),
  client_activity as (
    select
      c.id as client_id,
      coalesce(
        greatest(
          coalesce((
            select max(conv.last_message_at)
            from public.conversations conv
            where conv.client_id = c.id
              and conv.last_message_sender_role = 'client'
          ), '-infinity'::timestamptz),
          coalesce((
            select max(aw.completed_at)
            from public.assigned_workouts aw
            where aw.client_id = c.id
              and aw.status = 'completed'
          ), '-infinity'::timestamptz),
          coalesce((
            select max(hl.created_at)
            from public.habit_logs hl
            where hl.client_id = c.id
          ), '-infinity'::timestamptz),
          coalesce((
            select max(ch.submitted_at)
            from public.checkins ch
            where ch.client_id = c.id
          ), '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) as last_activity_at
    from public.clients c
    where c.workspace_id in (select workspace_id from pt_workspaces)
      and c.status = 'active'
  ),
  inactive_candidates as (
    select
      c.id as client_id,
      coalesce(nullif(trim(c.display_name), ''), 'Client') as client_name,
      activity.last_activity_at
    from public.clients c
    join client_activity activity on activity.client_id = c.id
    where c.workspace_id in (select workspace_id from pt_workspaces)
      and c.status = 'active'
      and activity.last_activity_at < now() - interval '2 days'
  ),
  inserted_inactive as (
    insert into public.notifications (
      recipient_user_id, type, category, priority, title, body,
      action_url, entity_type, entity_id, metadata
    )
    select
      v_user_id,
      'client_inactive',
      'general',
      'normal',
      'Client inactive for 2+ days',
      format('%s has no recent activity.', candidate.client_name),
      format('/pt/clients/%s?tab=overview', candidate.client_id),
      'client',
      candidate.client_id,
      jsonb_build_object(
        'reminder_date', current_date::text,
        'last_activity_at', candidate.last_activity_at
      )
    from inactive_candidates candidate
    where not exists (
      select 1
      from public.notifications n
      where n.recipient_user_id = v_user_id
        and n.type = 'client_inactive'
        and n.entity_type = 'client'
        and n.entity_id = candidate.client_id
        and n.metadata ->> 'reminder_date' = current_date::text
    )
    returning 1
  )
  select
    coalesce((select count(*) from inserted_birthdays), 0) +
    coalesce((select count(*) from inserted_inactive), 0)
  into v_inserted;

  return v_inserted;
end;
$$;


ALTER FUNCTION "public"."sync_notification_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_notification_reminders_for_user"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_inserted integer := 0;
begin
  with pt_workspaces as (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = p_user_id
      and wm.role::text like 'pt_%'
  ),
  birthday_candidates as (
    select
      c.id as client_id,
      coalesce(nullif(trim(c.display_name), ''), 'Client') as client_name,
      case
        when to_char(c.dob, 'MM-DD') = to_char(current_date, 'MM-DD') then 'today'
        when to_char(c.dob, 'MM-DD') = to_char(current_date + 1, 'MM-DD') then 'tomorrow'
        else null
      end as reminder_kind
    from public.clients c
    where c.workspace_id in (select workspace_id from pt_workspaces)
      and c.status = 'active'
      and c.dob is not null
      and to_char(c.dob, 'MM-DD') in (
        to_char(current_date, 'MM-DD'),
        to_char(current_date + 1, 'MM-DD')
      )
  ),
  inserted_birthdays as (
    insert into public.notifications (
      recipient_user_id,
      type,
      category,
      priority,
      title,
      body,
      action_url,
      entity_type,
      entity_id,
      metadata
    )
    select
      p_user_id,
      'birthday_reminder',
      'general',
      'normal',
      case when candidate.reminder_kind = 'today' then 'Birthday today' else 'Birthday tomorrow' end,
      case
        when candidate.reminder_kind = 'today' then format('%s has a birthday today.', candidate.client_name)
        else format('%s has a birthday tomorrow.', candidate.client_name)
      end,
      format('/pt/clients/%s?tab=overview', candidate.client_id),
      'client',
      candidate.client_id,
      jsonb_build_object(
        'reminder_kind', candidate.reminder_kind,
        'reminder_date', current_date::text
      )
    from birthday_candidates candidate
    where candidate.reminder_kind is not null
      and not exists (
        select 1
        from public.notifications n
        where n.recipient_user_id = p_user_id
          and n.type = 'birthday_reminder'
          and n.entity_type = 'client'
          and n.entity_id = candidate.client_id
          and n.metadata ->> 'reminder_kind' = candidate.reminder_kind
          and n.metadata ->> 'reminder_date' = current_date::text
      )
    returning 1
  )
  select coalesce((select count(*) from inserted_birthdays), 0)
  into v_inserted;

  return v_inserted;
end;
$$;


ALTER FUNCTION "public"."sync_notification_reminders_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_pt_hub_display_name_to_pt_profiles"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  UPDATE public.pt_profiles
  SET
    display_name = NEW.display_name,
    updated_at = now()
  WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_pt_hub_display_name_to_pt_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_conversation_last_message"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_id = NEW.id,
      last_message_at = NEW.created_at,
      last_message_preview = COALESCE(NEW.preview, LEFT(NEW.body, 140)),
      last_message_sender_name = NEW.sender_name,
      last_message_sender_role = NEW.sender_role,
      updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_conversation_last_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_invite"("p_token" "text") RETURNS TABLE("is_valid" boolean, "reason" "text", "invite_id" "uuid", "workspace_id" "uuid", "workspace_name" "text", "workspace_logo_url" "text", "role" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_invite record;
begin
  if p_token is null or trim(p_token) = '' then
    return query
    select false, 'missing_token', null::uuid, null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select
    i.id,
    i.workspace_id,
    i.role::text as role,
    i.expires_at,
    i.used_at,
    i.max_uses,
    coalesce(i.uses, 0) as uses
  into v_invite
  from public.invites i
  where i.token = p_token or i.code = p_token
  order by i.created_at desc
  limit 1;

  if v_invite.id is null then
    return query
    select false, 'not_found', null::uuid, null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_invite.role <> 'client' then
    return query
    select false, 'invalid_role', v_invite.id, v_invite.workspace_id, null::text, null::text, v_invite.role, v_invite.expires_at;
    return;
  end if;

  if v_invite.used_at is not null then
    return query
    select false, 'already_used', v_invite.id, v_invite.workspace_id, null::text, null::text, v_invite.role, v_invite.expires_at;
    return;
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    return query
    select false, 'expired', v_invite.id, v_invite.workspace_id, null::text, null::text, v_invite.role, v_invite.expires_at;
    return;
  end if;

  if v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    return query
    select false, 'max_uses_reached', v_invite.id, v_invite.workspace_id, null::text, null::text, v_invite.role, v_invite.expires_at;
    return;
  end if;

  return query
  select
    true,
    null::text,
    v_invite.id,
    v_invite.workspace_id,
    w.name,
    coalesce(w.logo_url, null)::text,
    v_invite.role,
    v_invite.expires_at
  from public.workspaces w
  where w.id = v_invite.workspace_id;
end;
$$;


ALTER FUNCTION "public"."verify_invite"("p_token" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_archive_workout_log_items" (
    "id" "uuid",
    "workout_log_id" "uuid",
    "exercise_name" "text",
    "set_index" integer,
    "reps" integer,
    "weight_kg" numeric,
    "duration_sec" integer,
    "rpe" numeric,
    "notes" "text",
    "created_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."_archive_workout_log_items" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."_archive_workout_log_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_archive_workout_template_items" (
    "id" "uuid",
    "workout_template_id" "uuid",
    "exercise_id" "uuid",
    "sort_order" integer,
    "sets" integer,
    "reps" "text",
    "rest_sec" integer,
    "rpe_target" numeric,
    "tempo" "text",
    "notes" "text"
);

ALTER TABLE ONLY "public"."_archive_workout_template_items" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."_archive_workout_template_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assigned_nutrition_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assigned_nutrition_plan_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "week_index" integer NOT NULL,
    "day_of_week" integer NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assigned_nutrition_days_day_of_week_check" CHECK ((("day_of_week" >= 1) AND ("day_of_week" <= 7))),
    CONSTRAINT "assigned_nutrition_days_week_index_check" CHECK ((("week_index" >= 1) AND ("week_index" <= 4)))
);

ALTER TABLE ONLY "public"."assigned_nutrition_days" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."assigned_nutrition_days" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assigned_nutrition_meal_components" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assigned_nutrition_meal_id" "uuid" NOT NULL,
    "template_component_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "component_name" "text" NOT NULL,
    "quantity" numeric,
    "unit" "text",
    "calories" integer,
    "protein_g" numeric,
    "carbs_g" numeric,
    "fat_g" numeric,
    "recipe_text" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."assigned_nutrition_meal_components" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."assigned_nutrition_meal_components" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assigned_nutrition_meals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assigned_nutrition_day_id" "uuid" NOT NULL,
    "meal_order" integer DEFAULT 0 NOT NULL,
    "meal_name" "text" NOT NULL,
    "recipe_text" "text",
    "calories" integer,
    "protein_g" numeric,
    "carbs_g" numeric,
    "fat_g" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_meal_id" "uuid"
);

ALTER TABLE ONLY "public"."assigned_nutrition_meals" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."assigned_nutrition_meals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assigned_nutrition_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "nutrition_template_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assigned_nutrition_plans_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."assigned_nutrition_plans" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."assigned_nutrition_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assigned_workout_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assigned_workout_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "sets" integer,
    "reps" "text",
    "rpe" numeric,
    "tempo" "text",
    "notes" "text",
    "weight_kg" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "weight_value" numeric,
    "weight_unit" "text" DEFAULT 'kg'::"text",
    "actual_weight_value" numeric,
    "actual_weight_unit" "text" DEFAULT 'kg'::"text",
    "is_completed" boolean DEFAULT false NOT NULL,
    "load_notes" "text",
    "rest_seconds" integer,
    "video_url" "text",
    "set_order" integer,
    "set_number" integer,
    "default_weight_unit" "text" DEFAULT 'kg'::"text",
    "default_weight_value" numeric,
    "superset_group" "text"
);

ALTER TABLE ONLY "public"."assigned_workout_exercises" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."assigned_workout_exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assigned_workouts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "workout_template_id" "uuid",
    "scheduled_date" "date" NOT NULL,
    "status" "public"."assigned_status" DEFAULT 'planned'::"public"."assigned_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "day_type" "text" DEFAULT 'workout'::"text" NOT NULL,
    "program_id" "uuid",
    "program_day_index" integer,
    "coach_note" "text",
    CONSTRAINT "assigned_workouts_day_type_check" CHECK (("day_type" = ANY (ARRAY['workout'::"text", 'rest'::"text"])))
);

ALTER TABLE ONLY "public"."assigned_workouts" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."assigned_workouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."baseline_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "client_notes" "text",
    "coach_notes" "text",
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."baseline_entries" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."baseline_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."baseline_marker_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text",
    "value_type" "text" DEFAULT 'number'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_user_id" "uuid" NOT NULL,
    "unit_label" "text",
    "help_text" "text",
    CONSTRAINT "baseline_marker_templates_value_type_check" CHECK (("value_type" = ANY (ARRAY['number'::"text", 'text'::"text"])))
);

ALTER TABLE ONLY "public"."baseline_marker_templates" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."baseline_marker_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."baseline_marker_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "baseline_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "value_number" numeric,
    "value_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."baseline_marker_values" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."baseline_marker_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."baseline_metrics" (
    "baseline_id" "uuid" NOT NULL,
    "weight_kg" numeric,
    "height_cm" numeric,
    "body_fat_pct" numeric,
    "lean_mass_kg" numeric,
    "waist_cm" numeric,
    "chest_cm" numeric,
    "hips_cm" numeric,
    "thigh_cm" numeric,
    "arm_cm" numeric,
    "resting_hr" numeric,
    "vo2max" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."baseline_metrics" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."baseline_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."baseline_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "baseline_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "photo_type" "text" NOT NULL,
    "url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "storage_path" "text"
);

ALTER TABLE ONLY "public"."baseline_photos" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."baseline_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkin_answers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "checkin_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "value_text" "text",
    "value_number" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."checkin_answers" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkin_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkin_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "checkin_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "photo_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."checkin_photos" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkin_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkin_questions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "type" "public"."question_type" DEFAULT 'text'::"public"."question_type" NOT NULL,
    "prompt" "text" DEFAULT ''::"text" NOT NULL,
    "options" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "question_text" "text",
    "is_required" boolean DEFAULT false NOT NULL,
    "position" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."checkin_questions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkin_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkin_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."checkin_templates" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkin_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkins" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "week_ending_saturday" "date" NOT NULL,
    "submitted_at" timestamp with time zone,
    "pt_feedback" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."checkins" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_macro_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "calories_target" numeric,
    "protein_target_g" numeric,
    "carbs_target_g" numeric,
    "fat_target_g" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."client_macro_targets" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_macro_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_program_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."client_program_assignments" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_program_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_program_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_program_id" "uuid" NOT NULL,
    "override_date" "date" NOT NULL,
    "workout_template_id" "uuid",
    "is_rest" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_program_overrides_workout_or_rest_check" CHECK ((("workout_template_id" IS NOT NULL) OR ("is_rest" = true)))
);

ALTER TABLE ONLY "public"."client_program_overrides" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_program_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "program_template_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."client_programs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "calories" integer,
    "protein_g" integer,
    "steps" integer,
    "coach_notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."client_targets" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "actor_user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."coach_activity_log" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."coach_calendar_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_calendar_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_todos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "is_done" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."coach_todos" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_todos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "last_message_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_id" "uuid",
    "last_message_preview" "text",
    "last_message_sender_name" "text",
    "last_message_sender_role" "text"
);

ALTER TABLE ONLY "public"."conversations" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dismissed_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "dismissed_for_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."dismissed_reminders" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."dismissed_reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercises" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "muscle_group" "text",
    "equipment" "text",
    "instructions" "text",
    "video_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "cues" "text",
    "primary_muscle" "text",
    "secondary_muscles" "text"[],
    "is_unilateral" boolean DEFAULT false NOT NULL,
    "tags" "text"[],
    "category" "text"
);

ALTER TABLE ONLY "public"."exercises" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."habit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "log_date" "date" NOT NULL,
    "calories" integer,
    "protein_g" integer,
    "carbs_g" integer,
    "fats_g" integer,
    "weight_value" numeric,
    "weight_unit" "text" DEFAULT 'kg'::"text" NOT NULL,
    "sleep_hours" numeric,
    "steps" integer,
    "energy" smallint,
    "hunger" smallint,
    "stress" smallint,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "habit_logs_energy_chk" CHECK ((("energy" IS NULL) OR (("energy" >= 1) AND ("energy" <= 10)))),
    CONSTRAINT "habit_logs_hunger_chk" CHECK ((("hunger" IS NULL) OR (("hunger" >= 1) AND ("hunger" <= 10)))),
    CONSTRAINT "habit_logs_stress_chk" CHECK ((("stress" IS NULL) OR (("stress" >= 1) AND ("stress" <= 10)))),
    CONSTRAINT "habit_logs_weight_unit_chk" CHECK (("weight_unit" = ANY (ARRAY['kg'::"text", 'lb'::"text"])))
);

ALTER TABLE ONLY "public"."habit_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."habit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invites" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "role" "public"."invite_role" DEFAULT 'client'::"public"."invite_role" NOT NULL,
    "code" "text" NOT NULL,
    "expires_at" timestamp with time zone,
    "max_uses" integer DEFAULT 1 NOT NULL,
    "uses" integer DEFAULT 0 NOT NULL,
    "created_by_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "token" "text",
    "used_at" timestamp with time zone,
    CONSTRAINT "invites_role_check" CHECK ((("role")::"text" = ANY (ARRAY['client'::"text", 'pt_coach'::"text", 'pt_owner'::"text", 'coach'::"text", 'pt'::"text"])))
);

ALTER TABLE ONLY "public"."invites" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_typing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "is_typing" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."message_typing" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_typing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_user_id" "uuid" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sender_role" "text" DEFAULT 'client'::"text" NOT NULL,
    "sender_name" "text",
    "preview" "text",
    "unread" boolean DEFAULT false NOT NULL,
    "workspace_id" "uuid" NOT NULL
);

ALTER TABLE ONLY "public"."messages" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "in_app_enabled" boolean DEFAULT true NOT NULL,
    "email_enabled" boolean DEFAULT false NOT NULL,
    "push_enabled" boolean DEFAULT false NOT NULL,
    "workout_assigned" boolean DEFAULT true NOT NULL,
    "workout_updated" boolean DEFAULT true NOT NULL,
    "checkin_requested" boolean DEFAULT true NOT NULL,
    "checkin_submitted" boolean DEFAULT true NOT NULL,
    "message_received" boolean DEFAULT true NOT NULL,
    "reminders_enabled" boolean DEFAULT true NOT NULL,
    "milestone_events" boolean DEFAULT true NOT NULL,
    "inactivity_alerts" boolean DEFAULT true NOT NULL,
    "system_events" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "action_url" "text",
    "entity_type" "text",
    "entity_id" "uuid",
    "image_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "read_at" timestamp with time zone,
    "delivery_in_app" boolean DEFAULT true NOT NULL,
    "delivery_email" boolean DEFAULT false NOT NULL,
    "delivery_push" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_day_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "assigned_nutrition_day_id" "uuid",
    "log_date" "date" NOT NULL,
    "client_notes" "text",
    "coach_notes" "text",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."nutrition_day_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutrition_day_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_meal_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assigned_nutrition_meal_id" "uuid" NOT NULL,
    "consumed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_completed" boolean DEFAULT true NOT NULL,
    "actual_calories" integer,
    "actual_protein_g" numeric,
    "actual_carbs_g" numeric,
    "actual_fat_g" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."nutrition_meal_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutrition_meal_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_template_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutrition_template_id" "uuid" NOT NULL,
    "week_index" integer NOT NULL,
    "day_of_week" integer NOT NULL,
    "title" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nutrition_template_days_day_of_week_check" CHECK ((("day_of_week" >= 1) AND ("day_of_week" <= 7))),
    CONSTRAINT "nutrition_template_days_week_index_check" CHECK ((("week_index" >= 1) AND ("week_index" <= 4)))
);

ALTER TABLE ONLY "public"."nutrition_template_days" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutrition_template_days" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_template_meal_components" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutrition_template_meal_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "component_name" "text" NOT NULL,
    "quantity" numeric,
    "unit" "text",
    "calories" integer,
    "protein_g" numeric,
    "carbs_g" numeric,
    "fat_g" numeric,
    "recipe_text" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."nutrition_template_meal_components" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutrition_template_meal_components" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_template_meal_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "nutrition_template_meal_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "serving_label" "text",
    "quantity" numeric,
    "planned_calories" numeric,
    "planned_protein_g" numeric,
    "planned_carbs_g" numeric,
    "planned_fat_g" numeric,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."nutrition_template_meal_items" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutrition_template_meal_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_template_meals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutrition_template_day_id" "uuid" NOT NULL,
    "meal_order" integer DEFAULT 0 NOT NULL,
    "meal_name" "text" NOT NULL,
    "recipe_text" "text",
    "calories" integer,
    "protein_g" numeric,
    "carbs_g" numeric,
    "fat_g" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."nutrition_template_meals" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutrition_template_meals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "duration_weeks" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nutrition_templates_duration_weeks_check" CHECK ((("duration_weeks" >= 1) AND ("duration_weeks" <= 4)))
);

ALTER TABLE ONLY "public"."nutrition_templates" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutrition_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_template_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_template_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "day_of_week" integer NOT NULL,
    "workout_template_id" "uuid",
    "is_rest" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "program_template_days_day_of_week_check" CHECK ((("day_of_week" >= 1) AND ("day_of_week" <= 7))),
    CONSTRAINT "program_template_days_week_number_check" CHECK (("week_number" > 0)),
    CONSTRAINT "program_template_days_workout_or_rest_check" CHECK ((("workout_template_id" IS NOT NULL) OR ("is_rest" = true)))
);

ALTER TABLE ONLY "public"."program_template_days" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_template_days" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "weeks_count" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "program_templates_weeks_count_check" CHECK (("weeks_count" > 0))
);

ALTER TABLE ONLY "public"."program_templates" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pt_hub_lead_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pt_hub_lead_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pt_hub_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "goal_summary" "text" NOT NULL,
    "training_experience" "text",
    "budget_interest" "text",
    "package_interest" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "converted_at" timestamp with time zone,
    "converted_workspace_id" "uuid",
    "converted_client_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_slug" "text",
    CONSTRAINT "pt_hub_leads_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'public_profile'::"text", 'marketplace'::"text"]))),
    CONSTRAINT "pt_hub_leads_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'reviewed'::"text", 'contacted'::"text", 'consultation_booked'::"text", 'accepted'::"text", 'rejected'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."pt_hub_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pt_hub_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text",
    "display_name" "text",
    "headline" "text",
    "short_bio" "text",
    "specialties" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "certifications" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "coaching_style" "text",
    "profile_photo_url" "text",
    "banner_image_url" "text",
    "social_links" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text",
    "searchable_headline" "text",
    "coaching_modes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "availability_modes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "location_label" "text",
    "marketplace_visible" boolean DEFAULT false NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "published_at" timestamp with time zone,
    "testimonials" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "transformations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "pt_hub_profiles_availability_modes_check" CHECK (("availability_modes" <@ ARRAY['online'::"text", 'in_person'::"text"])),
    CONSTRAINT "pt_hub_profiles_coaching_modes_check" CHECK (("coaching_modes" <@ ARRAY['one_on_one'::"text", 'programming'::"text", 'nutrition'::"text", 'accountability'::"text"])),
    CONSTRAINT "pt_hub_profiles_slug_format_check" CHECK ((("slug" IS NULL) OR ("btrim"("slug") = ''::"text") OR ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")))
);


ALTER TABLE "public"."pt_hub_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pt_hub_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "contact_email" "text",
    "support_email" "text",
    "phone" "text",
    "timezone" "text",
    "city" "text",
    "client_alerts" boolean DEFAULT true NOT NULL,
    "weekly_digest" boolean DEFAULT true NOT NULL,
    "product_updates" boolean DEFAULT false NOT NULL,
    "profile_visibility" "text" DEFAULT 'draft'::"text" NOT NULL,
    "subscription_plan" "text",
    "subscription_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pt_hub_settings_profile_visibility_check" CHECK (("profile_visibility" = ANY (ARRAY['draft'::"text", 'private'::"text", 'listed'::"text"])))
);


ALTER TABLE "public"."pt_hub_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pt_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "workspace_id" "uuid",
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."pt_profiles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."pt_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."workspace_role" DEFAULT 'pt_coach'::"public"."workspace_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "theme_preference" "text" DEFAULT 'system'::"text" NOT NULL,
    "compact_density" boolean DEFAULT false NOT NULL,
    CONSTRAINT "workspace_members_theme_preference_check" CHECK (("theme_preference" = ANY (ARRAY['system'::"text", 'dark'::"text", 'light'::"text"])))
);

ALTER TABLE ONLY "public"."workspace_members" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_members" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_workspace_pt_members" WITH ("security_invoker"='true') AS
 SELECT "workspace_id",
    "user_id",
    "role"
   FROM "public"."workspace_members" "wm";


ALTER VIEW "public"."v_workspace_pt_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "assigned_workout_id" "uuid",
    "workout_template_id" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."workout_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "assigned_workout_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "client_notes" "text",
    "pt_feedback" "text",
    "client_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."workout_sessions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_set_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workout_session_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "set_number" integer NOT NULL,
    "reps" integer,
    "weight" numeric,
    "rpe" numeric,
    "is_completed" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."workout_set_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_set_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_template_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workout_template_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 10 NOT NULL,
    "sets" integer,
    "reps" "text",
    "rest_seconds" integer,
    "tempo" "text",
    "rpe" numeric,
    "video_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "superset_group" "text"
);

ALTER TABLE ONLY "public"."workout_template_exercises" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_template_exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "workout_type" "public"."workout_type" DEFAULT 'bodybuilding'::"public"."workout_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workout_type_tag" "text"
);

ALTER TABLE ONLY "public"."workout_templates" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_checkin_template_id" "uuid",
    "logo_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."workspaces" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


ALTER TABLE ONLY "public"."assigned_nutrition_days"
    ADD CONSTRAINT "assigned_nutrition_days_assigned_nutrition_plan_id_date_key" UNIQUE ("assigned_nutrition_plan_id", "date");



ALTER TABLE ONLY "public"."assigned_nutrition_days"
    ADD CONSTRAINT "assigned_nutrition_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assigned_nutrition_meal_components"
    ADD CONSTRAINT "assigned_nutrition_meal_components_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assigned_nutrition_meals"
    ADD CONSTRAINT "assigned_nutrition_meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assigned_nutrition_plans"
    ADD CONSTRAINT "assigned_nutrition_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assigned_workout_exercises"
    ADD CONSTRAINT "assigned_workout_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assigned_workouts"
    ADD CONSTRAINT "assigned_workouts_client_id_scheduled_date_workout_template_key" UNIQUE ("client_id", "scheduled_date", "workout_template_id");



ALTER TABLE ONLY "public"."assigned_workouts"
    ADD CONSTRAINT "assigned_workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."baseline_entries"
    ADD CONSTRAINT "baseline_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."baseline_marker_templates"
    ADD CONSTRAINT "baseline_marker_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."baseline_marker_values"
    ADD CONSTRAINT "baseline_marker_values_baseline_id_template_id_key" UNIQUE ("baseline_id", "template_id");



ALTER TABLE ONLY "public"."baseline_marker_values"
    ADD CONSTRAINT "baseline_marker_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."baseline_metrics"
    ADD CONSTRAINT "baseline_metrics_pkey" PRIMARY KEY ("baseline_id");



ALTER TABLE ONLY "public"."baseline_photos"
    ADD CONSTRAINT "baseline_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_answers"
    ADD CONSTRAINT "checkin_answers_checkin_id_question_id_key" UNIQUE ("checkin_id", "question_id");



ALTER TABLE ONLY "public"."checkin_answers"
    ADD CONSTRAINT "checkin_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_photos"
    ADD CONSTRAINT "checkin_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_questions"
    ADD CONSTRAINT "checkin_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_templates"
    ADD CONSTRAINT "checkin_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkins"
    ADD CONSTRAINT "checkins_client_id_week_ending_saturday_key" UNIQUE ("client_id", "week_ending_saturday");



ALTER TABLE ONLY "public"."checkins"
    ADD CONSTRAINT "checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_macro_targets"
    ADD CONSTRAINT "client_macro_targets_client_id_key" UNIQUE ("client_id");



ALTER TABLE ONLY "public"."client_macro_targets"
    ADD CONSTRAINT "client_macro_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_program_assignments"
    ADD CONSTRAINT "client_program_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_program_overrides"
    ADD CONSTRAINT "client_program_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_programs"
    ADD CONSTRAINT "client_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_targets"
    ADD CONSTRAINT "client_targets_client_id_key" UNIQUE ("client_id");



ALTER TABLE ONLY "public"."client_targets"
    ADD CONSTRAINT "client_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_workspace_id_user_id_key" UNIQUE ("workspace_id", "user_id");



ALTER TABLE ONLY "public"."coach_activity_log"
    ADD CONSTRAINT "coach_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_calendar_events"
    ADD CONSTRAINT "coach_calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_todos"
    ADD CONSTRAINT "coach_todos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_client_id_key" UNIQUE ("client_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_workspace_client_key" UNIQUE ("workspace_id", "client_id");



ALTER TABLE ONLY "public"."dismissed_reminders"
    ADD CONSTRAINT "dismissed_reminders_client_id_key_dismissed_for_date_key" UNIQUE ("client_id", "key", "dismissed_for_date");



ALTER TABLE ONLY "public"."dismissed_reminders"
    ADD CONSTRAINT "dismissed_reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."habit_logs"
    ADD CONSTRAINT "habit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_typing"
    ADD CONSTRAINT "message_typing_conversation_user_key" UNIQUE ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."message_typing"
    ADD CONSTRAINT "message_typing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_day_logs"
    ADD CONSTRAINT "nutrition_day_logs_client_id_log_date_key" UNIQUE ("client_id", "log_date");



ALTER TABLE ONLY "public"."nutrition_day_logs"
    ADD CONSTRAINT "nutrition_day_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_meal_logs"
    ADD CONSTRAINT "nutrition_meal_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_template_days"
    ADD CONSTRAINT "nutrition_template_days_nutrition_template_id_week_index_da_key" UNIQUE ("nutrition_template_id", "week_index", "day_of_week");



ALTER TABLE ONLY "public"."nutrition_template_days"
    ADD CONSTRAINT "nutrition_template_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_template_meal_components"
    ADD CONSTRAINT "nutrition_template_meal_components_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_template_meal_items"
    ADD CONSTRAINT "nutrition_template_meal_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_template_meals"
    ADD CONSTRAINT "nutrition_template_meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_templates"
    ADD CONSTRAINT "nutrition_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_template_days"
    ADD CONSTRAINT "program_template_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_templates"
    ADD CONSTRAINT "program_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pt_hub_lead_notes"
    ADD CONSTRAINT "pt_hub_lead_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pt_hub_leads"
    ADD CONSTRAINT "pt_hub_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pt_hub_profiles"
    ADD CONSTRAINT "pt_hub_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pt_hub_settings"
    ADD CONSTRAINT "pt_hub_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pt_profiles"
    ADD CONSTRAINT "pt_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pt_profiles"
    ADD CONSTRAINT "pt_profiles_user_id_workspace_id_key" UNIQUE ("user_id", "workspace_id");



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_set_logs"
    ADD CONSTRAINT "workout_set_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_set_logs"
    ADD CONSTRAINT "workout_set_logs_session_exercise_set_unique" UNIQUE ("workout_session_id", "exercise_id", "set_number");



ALTER TABLE ONLY "public"."workout_template_exercises"
    ADD CONSTRAINT "workout_template_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_templates"
    ADD CONSTRAINT "workout_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_user_id_key" UNIQUE ("workspace_id", "user_id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



CREATE INDEX "assigned_nutrition_days_date_idx" ON "public"."assigned_nutrition_days" USING "btree" ("date");



CREATE INDEX "assigned_nutrition_days_plan_date_idx" ON "public"."assigned_nutrition_days" USING "btree" ("assigned_nutrition_plan_id", "date");



CREATE INDEX "assigned_nutrition_meal_components_meal_order_idx" ON "public"."assigned_nutrition_meal_components" USING "btree" ("assigned_nutrition_meal_id", "sort_order");



CREATE INDEX "assigned_nutrition_meals_day_order_idx" ON "public"."assigned_nutrition_meals" USING "btree" ("assigned_nutrition_day_id", "meal_order");



CREATE INDEX "assigned_nutrition_plans_client_date_idx" ON "public"."assigned_nutrition_plans" USING "btree" ("client_id", "start_date", "end_date");



CREATE INDEX "assigned_nutrition_plans_client_id_idx" ON "public"."assigned_nutrition_plans" USING "btree" ("client_id");



CREATE INDEX "assigned_nutrition_plans_start_date_idx" ON "public"."assigned_nutrition_plans" USING "btree" ("start_date");



CREATE INDEX "assigned_nutrition_plans_template_id_idx" ON "public"."assigned_nutrition_plans" USING "btree" ("nutrition_template_id");



CREATE INDEX "assigned_workout_exercises_assigned_workout_id_idx" ON "public"."assigned_workout_exercises" USING "btree" ("assigned_workout_id");



CREATE INDEX "assigned_workout_exercises_assigned_workout_id_sort_order_idx" ON "public"."assigned_workout_exercises" USING "btree" ("assigned_workout_id", "sort_order");



CREATE INDEX "assigned_workout_exercises_aw_ex_idx" ON "public"."assigned_workout_exercises" USING "btree" ("assigned_workout_id", "exercise_id");



CREATE INDEX "assigned_workouts_client_date_idx" ON "public"."assigned_workouts" USING "btree" ("client_id", "scheduled_date");



CREATE INDEX "assigned_workouts_client_id_idx" ON "public"."assigned_workouts" USING "btree" ("client_id");



CREATE INDEX "assigned_workouts_program_id_idx" ON "public"."assigned_workouts" USING "btree" ("program_id");



CREATE INDEX "assigned_workouts_workout_template_id_idx" ON "public"."assigned_workouts" USING "btree" ("workout_template_id");



CREATE INDEX "baseline_entries_workspace_id_idx" ON "public"."baseline_entries" USING "btree" ("workspace_id");



CREATE INDEX "baseline_marker_templates_workspace_id_idx" ON "public"."baseline_marker_templates" USING "btree" ("workspace_id");



CREATE INDEX "baseline_marker_values_template_id_idx" ON "public"."baseline_marker_values" USING "btree" ("template_id");



CREATE UNIQUE INDEX "baseline_one_draft_per_client" ON "public"."baseline_entries" USING "btree" ("client_id") WHERE ("status" = 'draft'::"text");



CREATE INDEX "baseline_photos_client_id_idx" ON "public"."baseline_photos" USING "btree" ("client_id");



CREATE UNIQUE INDEX "baseline_photos_one_per_type" ON "public"."baseline_photos" USING "btree" ("baseline_id", "photo_type");



CREATE INDEX "checkin_answers_checkin_idx" ON "public"."checkin_answers" USING "btree" ("checkin_id");



CREATE INDEX "checkin_answers_question_id_idx" ON "public"."checkin_answers" USING "btree" ("question_id");



CREATE INDEX "checkin_photos_checkin_id_idx" ON "public"."checkin_photos" USING "btree" ("checkin_id");



CREATE UNIQUE INDEX "checkin_photos_checkin_id_type_idx" ON "public"."checkin_photos" USING "btree" ("checkin_id", "photo_type");



CREATE INDEX "checkin_photos_client_id_idx" ON "public"."checkin_photos" USING "btree" ("client_id");



CREATE INDEX "checkin_questions_template_idx" ON "public"."checkin_questions" USING "btree" ("template_id");



CREATE INDEX "checkin_templates_created_at_idx" ON "public"."checkin_templates" USING "btree" ("created_at" DESC);



CREATE INDEX "checkin_templates_workspace_created_at_idx" ON "public"."checkin_templates" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "checkin_templates_workspace_id_idx" ON "public"."checkin_templates" USING "btree" ("workspace_id");



CREATE INDEX "checkins_client_week_idx" ON "public"."checkins" USING "btree" ("client_id", "week_ending_saturday");



CREATE INDEX "checkins_template_id_idx" ON "public"."checkins" USING "btree" ("template_id");



CREATE INDEX "client_macro_targets_client_id_idx" ON "public"."client_macro_targets" USING "btree" ("client_id");



CREATE INDEX "client_macro_targets_workspace_id_idx" ON "public"."client_macro_targets" USING "btree" ("workspace_id");



CREATE UNIQUE INDEX "client_program_assignments_one_active_idx" ON "public"."client_program_assignments" USING "btree" ("client_id") WHERE "is_active";



CREATE INDEX "client_program_assignments_program_id_idx" ON "public"."client_program_assignments" USING "btree" ("program_id");



CREATE INDEX "client_program_assignments_workspace_id_idx" ON "public"."client_program_assignments" USING "btree" ("workspace_id");



CREATE INDEX "client_program_overrides_program_idx" ON "public"."client_program_overrides" USING "btree" ("client_program_id");



CREATE UNIQUE INDEX "client_program_overrides_unique_idx" ON "public"."client_program_overrides" USING "btree" ("client_program_id", "override_date");



CREATE INDEX "client_program_overrides_workout_template_id_idx" ON "public"."client_program_overrides" USING "btree" ("workout_template_id");



CREATE INDEX "client_programs_client_id_idx" ON "public"."client_programs" USING "btree" ("client_id");



CREATE UNIQUE INDEX "client_programs_one_active_idx" ON "public"."client_programs" USING "btree" ("client_id") WHERE "is_active";



CREATE INDEX "client_programs_program_template_id_idx" ON "public"."client_programs" USING "btree" ("program_template_id");



CREATE INDEX "clients_user_id_idx" ON "public"."clients" USING "btree" ("user_id");



CREATE INDEX "clients_workspace_created_at_idx" ON "public"."clients" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "clients_workspace_id_idx" ON "public"."clients" USING "btree" ("workspace_id");



CREATE UNIQUE INDEX "clients_workspace_user_uidx" ON "public"."clients" USING "btree" ("workspace_id", "user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "coach_activity_log_client_id_idx" ON "public"."coach_activity_log" USING "btree" ("client_id");



CREATE INDEX "coach_activity_log_workspace_id_idx" ON "public"."coach_activity_log" USING "btree" ("workspace_id");



CREATE INDEX "coach_calendar_events_starts_at_idx" ON "public"."coach_calendar_events" USING "btree" ("starts_at");



CREATE INDEX "coach_calendar_events_workspace_id_idx" ON "public"."coach_calendar_events" USING "btree" ("workspace_id");



CREATE INDEX "coach_calendar_events_workspace_starts_at_idx" ON "public"."coach_calendar_events" USING "btree" ("workspace_id", "starts_at" DESC);



CREATE INDEX "coach_todos_coach_id_idx" ON "public"."coach_todos" USING "btree" ("coach_id");



CREATE INDEX "coach_todos_is_done_idx" ON "public"."coach_todos" USING "btree" ("is_done");



CREATE INDEX "coach_todos_workspace_created_at_idx" ON "public"."coach_todos" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "coach_todos_workspace_id_idx" ON "public"."coach_todos" USING "btree" ("workspace_id");



CREATE INDEX "conversations_client_id_idx" ON "public"."conversations" USING "btree" ("client_id");



CREATE INDEX "conversations_workspace_id_idx" ON "public"."conversations" USING "btree" ("workspace_id");



CREATE INDEX "conversations_workspace_last_message_idx" ON "public"."conversations" USING "btree" ("workspace_id", "last_message_at" DESC);



CREATE INDEX "exercises_workspace_created_at_idx" ON "public"."exercises" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "exercises_workspace_id_idx" ON "public"."exercises" USING "btree" ("workspace_id");



CREATE INDEX "habit_logs_client_date_idx" ON "public"."habit_logs" USING "btree" ("client_id", "log_date" DESC);



CREATE UNIQUE INDEX "habit_logs_client_date_uq" ON "public"."habit_logs" USING "btree" ("client_id", "log_date");



CREATE INDEX "idx_assigned_workout_exercises_awid_order" ON "public"."assigned_workout_exercises" USING "btree" ("assigned_workout_id", "set_order");



CREATE INDEX "idx_awex_exercise_id" ON "public"."assigned_workout_exercises" USING "btree" ("exercise_id");



CREATE INDEX "idx_clients_checkin_template_id" ON "public"."clients" USING "btree" ("checkin_template_id");



CREATE INDEX "idx_exercises_primary_muscle" ON "public"."exercises" USING "btree" ("primary_muscle");



CREATE INDEX "idx_habit_logs_client_date" ON "public"."habit_logs" USING "btree" ("client_id", "log_date");



CREATE INDEX "idx_workout_sessions_assigned_workout_id" ON "public"."workout_sessions" USING "btree" ("assigned_workout_id");



CREATE INDEX "idx_workout_set_logs_session_exercise" ON "public"."workout_set_logs" USING "btree" ("workout_session_id", "exercise_id");



CREATE INDEX "idx_workspace_members_user_workspace" ON "public"."workspace_members" USING "btree" ("user_id", "workspace_id");



CREATE INDEX "idx_workspaces_default_checkin_template_id" ON "public"."workspaces" USING "btree" ("default_checkin_template_id");



CREATE INDEX "idx_wte_template" ON "public"."workout_template_exercises" USING "btree" ("workout_template_id", "sort_order");



CREATE INDEX "invites_created_by_user_id_idx" ON "public"."invites" USING "btree" ("created_by_user_id");



CREATE UNIQUE INDEX "invites_token_uidx" ON "public"."invites" USING "btree" ("token") WHERE ("token" IS NOT NULL);



CREATE INDEX "invites_workspace_id_idx" ON "public"."invites" USING "btree" ("workspace_id");



CREATE INDEX "message_typing_conversation_id_idx" ON "public"."message_typing" USING "btree" ("conversation_id");



CREATE INDEX "messages_conversation_created_at_idx" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "messages_conversation_id_idx" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "messages_created_at_idx" ON "public"."messages" USING "btree" ("created_at");



CREATE INDEX "messages_sender_user_id_idx" ON "public"."messages" USING "btree" ("sender_user_id");



CREATE INDEX "notifications_recipient_created_at_idx" ON "public"."notifications" USING "btree" ("recipient_user_id", "created_at" DESC);



CREATE INDEX "notifications_recipient_read_created_at_idx" ON "public"."notifications" USING "btree" ("recipient_user_id", "is_read", "created_at" DESC);



CREATE INDEX "nutrition_day_logs_client_id_idx" ON "public"."nutrition_day_logs" USING "btree" ("client_id");



CREATE INDEX "nutrition_day_logs_client_id_log_date_idx" ON "public"."nutrition_day_logs" USING "btree" ("client_id", "log_date");



CREATE INDEX "nutrition_day_logs_workspace_id_idx" ON "public"."nutrition_day_logs" USING "btree" ("workspace_id");



CREATE INDEX "nutrition_meal_logs_assigned_meal_idx" ON "public"."nutrition_meal_logs" USING "btree" ("assigned_nutrition_meal_id", "consumed_at" DESC);



CREATE INDEX "nutrition_template_days_template_week_day_idx" ON "public"."nutrition_template_days" USING "btree" ("nutrition_template_id", "week_index", "day_of_week");



CREATE INDEX "nutrition_template_meal_components_meal_order_idx" ON "public"."nutrition_template_meal_components" USING "btree" ("nutrition_template_meal_id", "sort_order");



CREATE INDEX "nutrition_template_meal_items_meal_id_sort_idx" ON "public"."nutrition_template_meal_items" USING "btree" ("nutrition_template_meal_id", "sort_order");



CREATE INDEX "nutrition_template_meal_items_workspace_id_idx" ON "public"."nutrition_template_meal_items" USING "btree" ("workspace_id");



CREATE INDEX "nutrition_template_meals_day_order_idx" ON "public"."nutrition_template_meals" USING "btree" ("nutrition_template_day_id", "meal_order");



CREATE INDEX "nutrition_templates_workspace_id_idx" ON "public"."nutrition_templates" USING "btree" ("workspace_id");



CREATE INDEX "program_template_days_template_idx" ON "public"."program_template_days" USING "btree" ("program_template_id");



CREATE UNIQUE INDEX "program_template_days_unique_idx" ON "public"."program_template_days" USING "btree" ("program_template_id", "week_number", "day_of_week");



CREATE INDEX "program_template_days_workout_template_id_idx" ON "public"."program_template_days" USING "btree" ("workout_template_id");



CREATE INDEX "program_templates_workspace_created_at_idx" ON "public"."program_templates" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "program_templates_workspace_id_idx" ON "public"."program_templates" USING "btree" ("workspace_id");



CREATE INDEX "pt_hub_lead_notes_lead_id_idx" ON "public"."pt_hub_lead_notes" USING "btree" ("lead_id", "created_at" DESC);



CREATE INDEX "pt_hub_leads_source_idx" ON "public"."pt_hub_leads" USING "btree" ("user_id", "source", "submitted_at" DESC);



CREATE INDEX "pt_hub_leads_status_idx" ON "public"."pt_hub_leads" USING "btree" ("user_id", "status");



CREATE INDEX "pt_hub_leads_submitted_at_idx" ON "public"."pt_hub_leads" USING "btree" ("user_id", "submitted_at" DESC);



CREATE INDEX "pt_hub_leads_user_id_idx" ON "public"."pt_hub_leads" USING "btree" ("user_id");



CREATE INDEX "pt_hub_profiles_coaching_modes_gin_idx" ON "public"."pt_hub_profiles" USING "gin" ("coaching_modes");



CREATE INDEX "pt_hub_profiles_marketplace_idx" ON "public"."pt_hub_profiles" USING "btree" ("is_published", "marketplace_visible", "published_at" DESC);



CREATE UNIQUE INDEX "pt_hub_profiles_slug_uidx" ON "public"."pt_hub_profiles" USING "btree" ("lower"("slug")) WHERE (("slug" IS NOT NULL) AND ("btrim"("slug") <> ''::"text"));



CREATE INDEX "pt_hub_profiles_specialties_gin_idx" ON "public"."pt_hub_profiles" USING "gin" ("specialties");



CREATE UNIQUE INDEX "pt_hub_profiles_user_id_uidx" ON "public"."pt_hub_profiles" USING "btree" ("user_id");



CREATE UNIQUE INDEX "pt_hub_settings_user_id_uidx" ON "public"."pt_hub_settings" USING "btree" ("user_id");



CREATE INDEX "pt_profiles_user_id_idx" ON "public"."pt_profiles" USING "btree" ("user_id");



CREATE UNIQUE INDEX "pt_profiles_user_workspace_uidx" ON "public"."pt_profiles" USING "btree" ("user_id", "workspace_id");



CREATE INDEX "workout_logs_assigned_workout_id_idx" ON "public"."workout_logs" USING "btree" ("assigned_workout_id");



CREATE INDEX "workout_logs_client_id_idx" ON "public"."workout_logs" USING "btree" ("client_id");



CREATE INDEX "workout_logs_workout_template_id_idx" ON "public"."workout_logs" USING "btree" ("workout_template_id");



CREATE UNIQUE INDEX "workout_sessions_assigned_workout_id_key" ON "public"."workout_sessions" USING "btree" ("assigned_workout_id");



CREATE INDEX "workout_sessions_client_completed_idx" ON "public"."workout_sessions" USING "btree" ("client_id", "completed_at" DESC);



CREATE INDEX "workout_sessions_client_created_idx" ON "public"."workout_sessions" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "workout_sessions_client_idx" ON "public"."workout_sessions" USING "btree" ("client_id");



CREATE INDEX "workout_set_logs_exercise_id_idx" ON "public"."workout_set_logs" USING "btree" ("exercise_id");



CREATE INDEX "workout_set_logs_session_idx" ON "public"."workout_set_logs" USING "btree" ("workout_session_id");



CREATE INDEX "workout_set_logs_workout_session_id_created_at_idx" ON "public"."workout_set_logs" USING "btree" ("workout_session_id", "created_at" DESC);



CREATE INDEX "workout_template_exercises_exercise_id_idx" ON "public"."workout_template_exercises" USING "btree" ("exercise_id");



CREATE INDEX "workout_templates_workout_type_tag_idx" ON "public"."workout_templates" USING "btree" ("workout_type_tag");



CREATE INDEX "workout_templates_workspace_created_at_idx" ON "public"."workout_templates" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "workout_templates_workspace_id_idx" ON "public"."workout_templates" USING "btree" ("workspace_id");



CREATE INDEX "workspace_members_user_id_idx" ON "public"."workspace_members" USING "btree" ("user_id");



CREATE INDEX "workspaces_owner_user_id_idx" ON "public"."workspaces" USING "btree" ("owner_user_id");



CREATE OR REPLACE TRIGGER "assigned_workout_notifications_insert" AFTER INSERT ON "public"."assigned_workouts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_assigned_workout_notifications"();



CREATE OR REPLACE TRIGGER "assigned_workout_notifications_update" AFTER UPDATE ON "public"."assigned_workouts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_assigned_workout_notifications"();



CREATE OR REPLACE TRIGGER "checkin_requested_notifications_insert" AFTER INSERT ON "public"."checkins" FOR EACH ROW EXECUTE FUNCTION "public"."handle_checkin_requested_notifications"();



CREATE OR REPLACE TRIGGER "checkin_submitted_notifications_update" AFTER UPDATE ON "public"."checkins" FOR EACH ROW EXECUTE FUNCTION "public"."handle_checkin_submitted_notifications"();



CREATE OR REPLACE TRIGGER "enforce_nutrition_day_log_client_update" BEFORE UPDATE ON "public"."nutrition_day_logs" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_nutrition_day_log_client_update"();



CREATE OR REPLACE TRIGGER "invite_accepted_notifications_update" AFTER UPDATE ON "public"."invites" FOR EACH ROW EXECUTE FUNCTION "public"."handle_invite_accepted_notifications"();



CREATE OR REPLACE TRIGGER "message_received_notifications_insert" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."handle_message_received_notifications"();



CREATE OR REPLACE TRIGGER "restrict_notification_updates_trigger" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."restrict_notification_updates"();



CREATE OR REPLACE TRIGGER "set_assigned_nutrition_days_updated_at" BEFORE UPDATE ON "public"."assigned_nutrition_days" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_assigned_nutrition_meal_components_updated_at" BEFORE UPDATE ON "public"."assigned_nutrition_meal_components" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_assigned_nutrition_meals_updated_at" BEFORE UPDATE ON "public"."assigned_nutrition_meals" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_assigned_nutrition_plans_updated_at" BEFORE UPDATE ON "public"."assigned_nutrition_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_assigned_workout_exercises_updated_at" BEFORE UPDATE ON "public"."assigned_workout_exercises" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_baseline_entries_updated_at" BEFORE UPDATE ON "public"."baseline_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_baseline_marker_values_updated_at" BEFORE UPDATE ON "public"."baseline_marker_values" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_baseline_metrics_updated_at" BEFORE UPDATE ON "public"."baseline_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_checkin_answers_updated_at" BEFORE UPDATE ON "public"."checkin_answers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_checkin_questions_updated_at" BEFORE UPDATE ON "public"."checkin_questions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_checkin_templates_updated_at" BEFORE UPDATE ON "public"."checkin_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_client_macro_targets_updated_at" BEFORE UPDATE ON "public"."client_macro_targets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_client_programs_updated_at" BEFORE UPDATE ON "public"."client_programs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_coach_calendar_events_updated_at" BEFORE UPDATE ON "public"."coach_calendar_events" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_coach_todos_updated_at" BEFORE UPDATE ON "public"."coach_todos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_conversation_last_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."touch_conversation_last_message"();



CREATE OR REPLACE TRIGGER "set_conversations_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_habit_logs_updated_at" BEFORE UPDATE ON "public"."habit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_message_typing_updated_at" BEFORE UPDATE ON "public"."message_typing" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_message_workspace_id_trigger" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_message_workspace_id"();



CREATE OR REPLACE TRIGGER "set_notification_preferences_updated_at" BEFORE UPDATE ON "public"."notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_nutrition_day_logs_updated_at" BEFORE UPDATE ON "public"."nutrition_day_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_nutrition_meal_logs_updated_at" BEFORE UPDATE ON "public"."nutrition_meal_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_nutrition_template_days_updated_at" BEFORE UPDATE ON "public"."nutrition_template_days" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_nutrition_template_meal_components_updated_at" BEFORE UPDATE ON "public"."nutrition_template_meal_components" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_nutrition_template_meal_items_updated_at" BEFORE UPDATE ON "public"."nutrition_template_meal_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_nutrition_template_meals_updated_at" BEFORE UPDATE ON "public"."nutrition_template_meals" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_nutrition_templates_updated_at" BEFORE UPDATE ON "public"."nutrition_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_pt_hub_leads_updated_at" BEFORE UPDATE ON "public"."pt_hub_leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_pt_hub_profiles_updated_at" BEFORE UPDATE ON "public"."pt_hub_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_pt_hub_settings_updated_at" BEFORE UPDATE ON "public"."pt_hub_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_pt_profiles_updated_at" BEFORE UPDATE ON "public"."pt_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_workout_sessions_updated_at" BEFORE UPDATE ON "public"."workout_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_workspace_members_updated_at" BEFORE UPDATE ON "public"."workspace_members" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_workspaces_updated_at" BEFORE UPDATE ON "public"."workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "sync_pt_hub_display_name_to_pt_profiles" AFTER INSERT OR UPDATE OF "display_name" ON "public"."pt_hub_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_pt_hub_display_name_to_pt_profiles"();



CREATE OR REPLACE TRIGGER "trg_assigned_workout_exercises_updated_at" BEFORE UPDATE ON "public"."assigned_workout_exercises" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_assigned_workouts_sync_exercises" AFTER INSERT OR UPDATE OF "workout_template_id" ON "public"."assigned_workouts" FOR EACH ROW EXECUTE FUNCTION "public"."sync_assigned_workout_exercises_from_template"();



CREATE OR REPLACE TRIGGER "trg_auto_materialize_assigned_exercises" AFTER INSERT ON "public"."assigned_workouts" FOR EACH ROW EXECUTE FUNCTION "public"."auto_materialize_assigned_exercises"();



CREATE OR REPLACE TRIGGER "trg_baseline_entries_updated_at" BEFORE UPDATE ON "public"."baseline_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_baseline_marker_values_updated_at" BEFORE UPDATE ON "public"."baseline_marker_values" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_baseline_metrics_updated_at" BEFORE UPDATE ON "public"."baseline_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_workout_session_client_id" BEFORE INSERT OR UPDATE OF "assigned_workout_id" ON "public"."workout_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_workout_session_client_id"();



ALTER TABLE ONLY "public"."assigned_nutrition_days"
    ADD CONSTRAINT "assigned_nutrition_days_assigned_nutrition_plan_id_fkey" FOREIGN KEY ("assigned_nutrition_plan_id") REFERENCES "public"."assigned_nutrition_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assigned_nutrition_meal_components"
    ADD CONSTRAINT "assigned_nutrition_meal_compone_assigned_nutrition_meal_id_fkey" FOREIGN KEY ("assigned_nutrition_meal_id") REFERENCES "public"."assigned_nutrition_meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assigned_nutrition_meals"
    ADD CONSTRAINT "assigned_nutrition_meals_assigned_nutrition_day_id_fkey" FOREIGN KEY ("assigned_nutrition_day_id") REFERENCES "public"."assigned_nutrition_days"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assigned_nutrition_plans"
    ADD CONSTRAINT "assigned_nutrition_plans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assigned_nutrition_plans"
    ADD CONSTRAINT "assigned_nutrition_plans_nutrition_template_id_fkey" FOREIGN KEY ("nutrition_template_id") REFERENCES "public"."nutrition_templates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."assigned_workout_exercises"
    ADD CONSTRAINT "assigned_workout_exercises_assigned_workout_id_fkey" FOREIGN KEY ("assigned_workout_id") REFERENCES "public"."assigned_workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assigned_workout_exercises"
    ADD CONSTRAINT "assigned_workout_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."assigned_workouts"
    ADD CONSTRAINT "assigned_workouts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assigned_workouts"
    ADD CONSTRAINT "assigned_workouts_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."program_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assigned_workouts"
    ADD CONSTRAINT "assigned_workouts_workout_template_id_fkey" FOREIGN KEY ("workout_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."baseline_entries"
    ADD CONSTRAINT "baseline_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."baseline_entries"
    ADD CONSTRAINT "baseline_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."baseline_marker_templates"
    ADD CONSTRAINT "baseline_marker_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."baseline_marker_values"
    ADD CONSTRAINT "baseline_marker_values_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "public"."baseline_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."baseline_marker_values"
    ADD CONSTRAINT "baseline_marker_values_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."baseline_marker_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."baseline_metrics"
    ADD CONSTRAINT "baseline_metrics_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "public"."baseline_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."baseline_photos"
    ADD CONSTRAINT "baseline_photos_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "public"."baseline_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."baseline_photos"
    ADD CONSTRAINT "baseline_photos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkin_answers"
    ADD CONSTRAINT "checkin_answers_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkin_answers"
    ADD CONSTRAINT "checkin_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."checkin_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkin_photos"
    ADD CONSTRAINT "checkin_photos_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkin_photos"
    ADD CONSTRAINT "checkin_photos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkin_questions"
    ADD CONSTRAINT "checkin_questions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."checkin_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkin_templates"
    ADD CONSTRAINT "checkin_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkins"
    ADD CONSTRAINT "checkins_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkins"
    ADD CONSTRAINT "checkins_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."checkin_templates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."client_macro_targets"
    ADD CONSTRAINT "client_macro_targets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_macro_targets"
    ADD CONSTRAINT "client_macro_targets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_program_assignments"
    ADD CONSTRAINT "client_program_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_program_assignments"
    ADD CONSTRAINT "client_program_assignments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."program_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_program_assignments"
    ADD CONSTRAINT "client_program_assignments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_program_overrides"
    ADD CONSTRAINT "client_program_overrides_client_program_id_fkey" FOREIGN KEY ("client_program_id") REFERENCES "public"."client_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_program_overrides"
    ADD CONSTRAINT "client_program_overrides_workout_template_id_fkey" FOREIGN KEY ("workout_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_programs"
    ADD CONSTRAINT "client_programs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_programs"
    ADD CONSTRAINT "client_programs_program_template_id_fkey" FOREIGN KEY ("program_template_id") REFERENCES "public"."program_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_targets"
    ADD CONSTRAINT "client_targets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_checkin_template_fkey" FOREIGN KEY ("checkin_template_id") REFERENCES "public"."checkin_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_activity_log"
    ADD CONSTRAINT "coach_activity_log_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_activity_log"
    ADD CONSTRAINT "coach_activity_log_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_todos"
    ADD CONSTRAINT "coach_todos_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_todos"
    ADD CONSTRAINT "coach_todos_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dismissed_reminders"
    ADD CONSTRAINT "dismissed_reminders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."habit_logs"
    ADD CONSTRAINT "habit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_day_logs"
    ADD CONSTRAINT "nutrition_day_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_day_logs"
    ADD CONSTRAINT "nutrition_day_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_meal_logs"
    ADD CONSTRAINT "nutrition_meal_logs_assigned_nutrition_meal_id_fkey" FOREIGN KEY ("assigned_nutrition_meal_id") REFERENCES "public"."assigned_nutrition_meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_template_days"
    ADD CONSTRAINT "nutrition_template_days_nutrition_template_id_fkey" FOREIGN KEY ("nutrition_template_id") REFERENCES "public"."nutrition_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_template_meal_components"
    ADD CONSTRAINT "nutrition_template_meal_compone_nutrition_template_meal_id_fkey" FOREIGN KEY ("nutrition_template_meal_id") REFERENCES "public"."nutrition_template_meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_template_meal_items"
    ADD CONSTRAINT "nutrition_template_meal_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_template_meals"
    ADD CONSTRAINT "nutrition_template_meals_nutrition_template_day_id_fkey" FOREIGN KEY ("nutrition_template_day_id") REFERENCES "public"."nutrition_template_days"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_templates"
    ADD CONSTRAINT "nutrition_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_template_days"
    ADD CONSTRAINT "program_template_days_program_template_id_fkey" FOREIGN KEY ("program_template_id") REFERENCES "public"."program_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_template_days"
    ADD CONSTRAINT "program_template_days_workout_template_id_fkey" FOREIGN KEY ("workout_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_templates"
    ADD CONSTRAINT "program_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pt_hub_lead_notes"
    ADD CONSTRAINT "pt_hub_lead_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."pt_hub_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pt_hub_leads"
    ADD CONSTRAINT "pt_hub_leads_converted_client_id_fkey" FOREIGN KEY ("converted_client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pt_hub_leads"
    ADD CONSTRAINT "pt_hub_leads_converted_workspace_id_fkey" FOREIGN KEY ("converted_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pt_profiles"
    ADD CONSTRAINT "pt_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_assigned_workout_id_fkey" FOREIGN KEY ("assigned_workout_id") REFERENCES "public"."assigned_workouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_workout_template_id_fkey" FOREIGN KEY ("workout_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_assigned_workout_id_fkey" FOREIGN KEY ("assigned_workout_id") REFERENCES "public"."assigned_workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_set_logs"
    ADD CONSTRAINT "workout_set_logs_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."workout_set_logs"
    ADD CONSTRAINT "workout_set_logs_workout_session_id_fkey" FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_template_exercises"
    ADD CONSTRAINT "workout_template_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."workout_template_exercises"
    ADD CONSTRAINT "workout_template_exercises_workout_template_id_fkey" FOREIGN KEY ("workout_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_templates"
    ADD CONSTRAINT "workout_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_default_checkin_template_fkey" FOREIGN KEY ("default_checkin_template_id") REFERENCES "public"."checkin_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."_archive_workout_log_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."_archive_workout_template_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assigned_nutrition_days" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assigned_nutrition_days_select_access" ON "public"."assigned_nutrition_days" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."assigned_nutrition_plans" "ap"
  WHERE (("ap"."id" = "assigned_nutrition_days"."assigned_nutrition_plan_id") AND "public"."is_client_owner"("ap"."client_id")))) OR (EXISTS ( SELECT 1
   FROM ("public"."assigned_nutrition_plans" "ap"
     JOIN "public"."clients" "c" ON (("c"."id" = "ap"."client_id")))
  WHERE (("ap"."id" = "assigned_nutrition_days"."assigned_nutrition_plan_id") AND "public"."is_pt_workspace_member"("c"."workspace_id"))))));



ALTER TABLE "public"."assigned_nutrition_meal_components" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assigned_nutrition_meal_components_select_access" ON "public"."assigned_nutrition_meal_components" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM (("public"."assigned_nutrition_meals" "am"
     JOIN "public"."assigned_nutrition_days" "ad" ON (("ad"."id" = "am"."assigned_nutrition_day_id")))
     JOIN "public"."assigned_nutrition_plans" "ap" ON (("ap"."id" = "ad"."assigned_nutrition_plan_id")))
  WHERE (("am"."id" = "assigned_nutrition_meal_components"."assigned_nutrition_meal_id") AND "public"."is_client_owner"("ap"."client_id")))) OR (EXISTS ( SELECT 1
   FROM ((("public"."assigned_nutrition_meals" "am"
     JOIN "public"."assigned_nutrition_days" "ad" ON (("ad"."id" = "am"."assigned_nutrition_day_id")))
     JOIN "public"."assigned_nutrition_plans" "ap" ON (("ap"."id" = "ad"."assigned_nutrition_plan_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "ap"."client_id")))
  WHERE (("am"."id" = "assigned_nutrition_meal_components"."assigned_nutrition_meal_id") AND "public"."is_pt_workspace_member"("c"."workspace_id"))))));



ALTER TABLE "public"."assigned_nutrition_meals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assigned_nutrition_meals_select_access" ON "public"."assigned_nutrition_meals" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."assigned_nutrition_days" "ad"
     JOIN "public"."assigned_nutrition_plans" "ap" ON (("ap"."id" = "ad"."assigned_nutrition_plan_id")))
  WHERE (("ad"."id" = "assigned_nutrition_meals"."assigned_nutrition_day_id") AND "public"."is_client_owner"("ap"."client_id")))) OR (EXISTS ( SELECT 1
   FROM (("public"."assigned_nutrition_days" "ad"
     JOIN "public"."assigned_nutrition_plans" "ap" ON (("ap"."id" = "ad"."assigned_nutrition_plan_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "ap"."client_id")))
  WHERE (("ad"."id" = "assigned_nutrition_meals"."assigned_nutrition_day_id") AND "public"."is_pt_workspace_member"("c"."workspace_id"))))));



ALTER TABLE "public"."assigned_nutrition_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assigned_nutrition_plans_select_access" ON "public"."assigned_nutrition_plans" FOR SELECT TO "authenticated" USING (("public"."is_client_owner"("client_id") OR (EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "assigned_nutrition_plans"."client_id") AND "public"."is_pt_workspace_member"("c"."workspace_id"))))));



ALTER TABLE "public"."assigned_workout_exercises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assigned_workouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assigned_workouts_delete_pt" ON "public"."assigned_workouts" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "assigned_workouts"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "assigned_workouts_insert_pt" ON "public"."assigned_workouts" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "assigned_workouts"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "assigned_workouts_select" ON "public"."assigned_workouts" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "assigned_workouts"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "assigned_workouts"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "assigned_workouts_update" ON "public"."assigned_workouts" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "assigned_workouts"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "assigned_workouts"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "assigned_workouts"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "assigned_workouts"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "awe_delete_pt" ON "public"."assigned_workout_exercises" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("aw"."id" = "assigned_workout_exercises"."assigned_workout_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "awe_insert_pt" ON "public"."assigned_workout_exercises" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("aw"."id" = "assigned_workout_exercises"."assigned_workout_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "awe_select_access" ON "public"."assigned_workout_exercises" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
  WHERE (("aw"."id" = "assigned_workout_exercises"."assigned_workout_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM (("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("aw"."id" = "assigned_workout_exercises"."assigned_workout_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



CREATE POLICY "awe_update_access" ON "public"."assigned_workout_exercises" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
  WHERE (("aw"."id" = "assigned_workout_exercises"."assigned_workout_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM (("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("aw"."id" = "assigned_workout_exercises"."assigned_workout_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
  WHERE (("aw"."id" = "assigned_workout_exercises"."assigned_workout_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM (("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("aw"."id" = "assigned_workout_exercises"."assigned_workout_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



ALTER TABLE "public"."baseline_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "baseline_entries_insert" ON "public"."baseline_entries" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "baseline_entries"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "baseline_entries"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



CREATE POLICY "baseline_entries_select" ON "public"."baseline_entries" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "baseline_entries"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "baseline_entries"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



CREATE POLICY "baseline_entries_update" ON "public"."baseline_entries" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "baseline_entries"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "baseline_entries"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "baseline_entries"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "baseline_entries"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



ALTER TABLE "public"."baseline_marker_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "baseline_marker_templates_delete_pt" ON "public"."baseline_marker_templates" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "baseline_marker_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "baseline_marker_templates_insert_pt" ON "public"."baseline_marker_templates" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "baseline_marker_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "baseline_marker_templates_select_access" ON "public"."baseline_marker_templates" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."workspace_id" = "baseline_marker_templates"."workspace_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "baseline_marker_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



CREATE POLICY "baseline_marker_templates_update_pt" ON "public"."baseline_marker_templates" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "baseline_marker_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "baseline_marker_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



ALTER TABLE "public"."baseline_marker_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "baseline_marker_values_rw" ON "public"."baseline_marker_values" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."baseline_entries" "be"
     JOIN "public"."clients" "c" ON (("c"."id" = "be"."client_id")))
  WHERE (("be"."id" = "baseline_marker_values"."baseline_id") AND (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members" "wm"
          WHERE (("wm"."workspace_id" = "be"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."baseline_entries" "be"
     JOIN "public"."clients" "c" ON (("c"."id" = "be"."client_id")))
  WHERE (("be"."id" = "baseline_marker_values"."baseline_id") AND (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members" "wm"
          WHERE (("wm"."workspace_id" = "be"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))))))));



ALTER TABLE "public"."baseline_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "baseline_metrics_delete_access" ON "public"."baseline_metrics" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."baseline_entries" "be"
     JOIN "public"."clients" "c" ON (("c"."id" = "be"."client_id")))
  WHERE (("be"."id" = "baseline_metrics"."baseline_id") AND (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members" "wm"
          WHERE (("wm"."workspace_id" = "be"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))))))));



CREATE POLICY "baseline_metrics_insert_access" ON "public"."baseline_metrics" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."baseline_entries" "be"
     JOIN "public"."clients" "c" ON (("c"."id" = "be"."client_id")))
  WHERE (("be"."id" = "baseline_metrics"."baseline_id") AND (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members" "wm"
          WHERE (("wm"."workspace_id" = "be"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))))))));



CREATE POLICY "baseline_metrics_select_access" ON "public"."baseline_metrics" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."baseline_entries" "be"
     JOIN "public"."clients" "c" ON (("c"."id" = "be"."client_id")))
  WHERE (("be"."id" = "baseline_metrics"."baseline_id") AND (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members" "wm"
          WHERE (("wm"."workspace_id" = "be"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))))))));



CREATE POLICY "baseline_metrics_update_access" ON "public"."baseline_metrics" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."baseline_entries" "be"
     JOIN "public"."clients" "c" ON (("c"."id" = "be"."client_id")))
  WHERE (("be"."id" = "baseline_metrics"."baseline_id") AND (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members" "wm"
          WHERE (("wm"."workspace_id" = "be"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."baseline_entries" "be"
     JOIN "public"."clients" "c" ON (("c"."id" = "be"."client_id")))
  WHERE (("be"."id" = "baseline_metrics"."baseline_id") AND (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members" "wm"
          WHERE (("wm"."workspace_id" = "be"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))))))));



ALTER TABLE "public"."baseline_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "baseline_photos_rw" ON "public"."baseline_photos" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."baseline_entries" "be"
     JOIN "public"."clients" "c" ON (("c"."id" = "be"."client_id")))
  WHERE (("be"."id" = "baseline_photos"."baseline_id") AND (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members" "wm"
          WHERE (("wm"."workspace_id" = "be"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."baseline_entries" "be"
     JOIN "public"."clients" "c" ON (("c"."id" = "be"."client_id")))
  WHERE (("be"."id" = "baseline_photos"."baseline_id") AND (("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members" "wm"
          WHERE (("wm"."workspace_id" = "be"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))))))));



ALTER TABLE "public"."checkin_answers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checkin_answers_access" ON "public"."checkin_answers" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."checkins" "ci"
     JOIN "public"."clients" "c" ON (("c"."id" = "ci"."client_id")))
  WHERE (("ci"."id" = "checkin_answers"."checkin_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM (("public"."checkins" "ci"
     JOIN "public"."clients" "c" ON (("c"."id" = "ci"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("ci"."id" = "checkin_answers"."checkin_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."checkins" "ci"
     JOIN "public"."clients" "c" ON (("c"."id" = "ci"."client_id")))
  WHERE (("ci"."id" = "checkin_answers"."checkin_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM (("public"."checkins" "ci"
     JOIN "public"."clients" "c" ON (("c"."id" = "ci"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("ci"."id" = "checkin_answers"."checkin_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"])))))));



ALTER TABLE "public"."checkin_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checkin_photos_access" ON "public"."checkin_photos" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "checkin_photos"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "checkin_photos"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "checkin_photos"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "checkin_photos"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."checkin_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checkin_questions_delete_pt" ON "public"."checkin_questions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."checkin_templates" "ct"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "ct"."workspace_id")))
  WHERE (("ct"."id" = "checkin_questions"."template_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))));



CREATE POLICY "checkin_questions_insert_pt" ON "public"."checkin_questions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."checkin_templates" "ct"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "ct"."workspace_id")))
  WHERE (("ct"."id" = "checkin_questions"."template_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))));



CREATE POLICY "checkin_questions_select_access" ON "public"."checkin_questions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."checkin_templates" "ct"
     JOIN "public"."clients" "c" ON (("c"."workspace_id" = "ct"."workspace_id")))
  WHERE (("ct"."id" = "checkin_questions"."template_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."checkin_templates" "ct"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "ct"."workspace_id")))
  WHERE (("ct"."id" = "checkin_questions"."template_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"])))))));



CREATE POLICY "checkin_questions_update_pt" ON "public"."checkin_questions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."checkin_templates" "ct"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "ct"."workspace_id")))
  WHERE (("ct"."id" = "checkin_questions"."template_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."checkin_templates" "ct"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "ct"."workspace_id")))
  WHERE (("ct"."id" = "checkin_questions"."template_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))));



ALTER TABLE "public"."checkin_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checkin_templates_delete_pt" ON "public"."checkin_templates" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "checkin_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))));



CREATE POLICY "checkin_templates_insert_pt" ON "public"."checkin_templates" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "checkin_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))));



CREATE POLICY "checkin_templates_select_access" ON "public"."checkin_templates" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."workspace_id" = "checkin_templates"."workspace_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "checkin_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"])))))));



CREATE POLICY "checkin_templates_update_pt" ON "public"."checkin_templates" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "checkin_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "checkin_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))));



ALTER TABLE "public"."checkins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checkins_access" ON "public"."checkins" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "checkins"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "checkins"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "checkins"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "checkins"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."client_macro_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_macro_targets_delete_pt" ON "public"."client_macro_targets" FOR DELETE TO "authenticated" USING ("public"."is_pt_workspace_member"("workspace_id"));



CREATE POLICY "client_macro_targets_insert_pt" ON "public"."client_macro_targets" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_pt_workspace_member"("workspace_id"));



CREATE POLICY "client_macro_targets_select_access" ON "public"."client_macro_targets" FOR SELECT TO "authenticated" USING (("public"."is_pt_workspace_member"("workspace_id") OR "public"."is_client_owner"("client_id")));



CREATE POLICY "client_macro_targets_update_pt" ON "public"."client_macro_targets" FOR UPDATE TO "authenticated" USING ("public"."is_pt_workspace_member"("workspace_id")) WITH CHECK ("public"."is_pt_workspace_member"("workspace_id"));



ALTER TABLE "public"."client_program_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_program_assignments_delete_pt" ON "public"."client_program_assignments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "client_program_assignments"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "client_program_assignments_insert_pt" ON "public"."client_program_assignments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "client_program_assignments"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "client_program_assignments_select_access" ON "public"."client_program_assignments" FOR SELECT TO "authenticated" USING (((("is_active" = true) AND (EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "client_program_assignments"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "client_program_assignments"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



CREATE POLICY "client_program_assignments_update_pt" ON "public"."client_program_assignments" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "client_program_assignments"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "client_program_assignments"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



ALTER TABLE "public"."client_program_overrides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_program_overrides_delete_pt" ON "public"."client_program_overrides" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."client_programs" "cp"
     JOIN "public"."clients" "c" ON (("c"."id" = "cp"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("cp"."id" = "client_program_overrides"."client_program_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "client_program_overrides_insert_pt" ON "public"."client_program_overrides" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."client_programs" "cp"
     JOIN "public"."clients" "c" ON (("c"."id" = "cp"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("cp"."id" = "client_program_overrides"."client_program_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "client_program_overrides_select_access" ON "public"."client_program_overrides" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."client_programs" "cp"
     JOIN "public"."clients" "c" ON (("c"."id" = "cp"."client_id")))
  WHERE (("cp"."id" = "client_program_overrides"."client_program_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM (("public"."client_programs" "cp"
     JOIN "public"."clients" "c" ON (("c"."id" = "cp"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("cp"."id" = "client_program_overrides"."client_program_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



CREATE POLICY "client_program_overrides_update_pt" ON "public"."client_program_overrides" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."client_programs" "cp"
     JOIN "public"."clients" "c" ON (("c"."id" = "cp"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("cp"."id" = "client_program_overrides"."client_program_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."client_programs" "cp"
     JOIN "public"."clients" "c" ON (("c"."id" = "cp"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("cp"."id" = "client_program_overrides"."client_program_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



ALTER TABLE "public"."client_programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_programs_delete_pt" ON "public"."client_programs" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "client_programs"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "client_programs_insert_pt" ON "public"."client_programs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "client_programs"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "client_programs_select_access" ON "public"."client_programs" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "client_programs"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "client_programs"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



CREATE POLICY "client_programs_update_pt" ON "public"."client_programs" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "client_programs"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "client_programs"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "client_read_own" ON "public"."_archive_workout_log_items" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."_archive_workout_template_items" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."assigned_nutrition_days" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."assigned_nutrition_meal_components" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."assigned_nutrition_meals" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."assigned_nutrition_plans" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."assigned_workout_exercises" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."assigned_workouts" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."baseline_entries" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."baseline_marker_templates" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."baseline_marker_values" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."baseline_metrics" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."baseline_photos" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."checkin_answers" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."checkin_photos" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."checkin_questions" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."checkin_templates" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."checkins" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."client_macro_targets" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."client_program_assignments" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."client_program_overrides" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."client_programs" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."client_targets" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."clients" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."coach_activity_log" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."coach_calendar_events" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."coach_todos" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."conversations" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."dismissed_reminders" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."exercises" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."habit_logs" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."invites" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."message_typing" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."messages" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."nutrition_day_logs" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."nutrition_meal_logs" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."nutrition_template_days" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."nutrition_template_meal_components" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."nutrition_template_meal_items" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."nutrition_template_meals" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."nutrition_templates" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."program_template_days" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."program_templates" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."pt_profiles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."workout_logs" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."workout_sessions" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."workout_set_logs" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."workout_template_exercises" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."workout_templates" FOR SELECT USING (false);



CREATE POLICY "client_read_own" ON "public"."workspace_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "client_read_own" ON "public"."workspaces" FOR SELECT USING (false);



ALTER TABLE "public"."client_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_targets_select_own" ON "public"."client_targets" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "client_targets"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "client_targets_update_own" ON "public"."client_targets" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "client_targets"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "client_targets"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_insert_self" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "clients_select_access" ON "public"."clients" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "clients"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR "public"."is_workspace_member"("workspace_id")));



CREATE POLICY "clients_update_access" ON "public"."clients" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "clients"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "clients"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



ALTER TABLE "public"."coach_activity_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_activity_log_pt_write" ON "public"."coach_activity_log" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "coach_activity_log"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "coach_activity_log_select_access" ON "public"."coach_activity_log" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "coach_activity_log"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "coach_activity_log"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



ALTER TABLE "public"."coach_calendar_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_calendar_events_pt_manage" ON "public"."coach_calendar_events" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "coach_calendar_events"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "coach_calendar_events"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))));



ALTER TABLE "public"."coach_todos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_todos_access" ON "public"."coach_todos" TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "coach_todos"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))))) WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "coach_todos"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"])))))));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_access" ON "public"."conversations" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "conversations"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "conversations"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "conversations"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "conversations"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."dismissed_reminders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dismissed_reminders_insert_own" ON "public"."dismissed_reminders" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "dismissed_reminders"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "dismissed_reminders_select_own" ON "public"."dismissed_reminders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "dismissed_reminders"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercises_delete_pt" ON "public"."exercises" FOR DELETE TO "authenticated" USING ((("workspace_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "exercises"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



CREATE POLICY "exercises_insert_pt" ON "public"."exercises" FOR INSERT TO "authenticated" WITH CHECK ((("workspace_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "exercises"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



CREATE POLICY "exercises_select_access" ON "public"."exercises" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM (("public"."assigned_workout_exercises" "awe"
     JOIN "public"."assigned_workouts" "aw" ON (("aw"."id" = "awe"."assigned_workout_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
  WHERE (("awe"."exercise_id" = "exercises"."id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "exercises"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



CREATE POLICY "exercises_update_pt" ON "public"."exercises" FOR UPDATE TO "authenticated" USING ((("workspace_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "exercises"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))))) WITH CHECK ((("workspace_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "exercises"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



ALTER TABLE "public"."habit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "habit_logs_client_insert" ON "public"."habit_logs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "habit_logs"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "habit_logs_client_update" ON "public"."habit_logs" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "habit_logs"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "habit_logs"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "habit_logs_select_access" ON "public"."habit_logs" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "habit_logs"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "habit_logs"."client_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



ALTER TABLE "public"."invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invites_access" ON "public"."invites" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "invites"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "invites"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



ALTER TABLE "public"."message_typing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_typing_access" ON "public"."message_typing" USING (((EXISTS ( SELECT 1
   FROM (("public"."conversations" "conv"
     JOIN "public"."clients" "c" ON (("c"."id" = "conv"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("conv"."id" = "message_typing"."conversation_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."conversations" "conv"
     JOIN "public"."clients" "c" ON (("c"."id" = "conv"."client_id")))
  WHERE (("conv"."id" = "message_typing"."conversation_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (("public"."conversations" "conv"
     JOIN "public"."clients" "c" ON (("c"."id" = "conv"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("conv"."id" = "message_typing"."conversation_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."conversations" "conv"
     JOIN "public"."clients" "c" ON (("c"."id" = "conv"."client_id")))
  WHERE (("conv"."id" = "message_typing"."conversation_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_access" ON "public"."messages" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM (("public"."conversations" "conv"
     JOIN "public"."clients" "c" ON (("c"."id" = "conv"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("conv"."id" = "messages"."conversation_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM ("public"."conversations" "conv"
     JOIN "public"."clients" "c" ON (("c"."id" = "conv"."client_id")))
  WHERE (("conv"."id" = "messages"."conversation_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (("public"."conversations" "conv"
     JOIN "public"."clients" "c" ON (("c"."id" = "conv"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("conv"."id" = "messages"."conversation_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM ("public"."conversations" "conv"
     JOIN "public"."clients" "c" ON (("c"."id" = "conv"."client_id")))
  WHERE (("conv"."id" = "messages"."conversation_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_preferences_insert_own" ON "public"."notification_preferences" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notification_preferences_select_own" ON "public"."notification_preferences" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notification_preferences_update_own" ON "public"."notification_preferences" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("recipient_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("recipient_user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("recipient_user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."nutrition_day_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutrition_day_logs_delete_pt" ON "public"."nutrition_day_logs" FOR DELETE TO "authenticated" USING ("public"."is_pt_workspace_member"("workspace_id"));



CREATE POLICY "nutrition_day_logs_insert_pt" ON "public"."nutrition_day_logs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_pt_workspace_member"("workspace_id"));



CREATE POLICY "nutrition_day_logs_select_access" ON "public"."nutrition_day_logs" FOR SELECT TO "authenticated" USING (("public"."is_pt_workspace_member"("workspace_id") OR "public"."is_client_owner"("client_id")));



CREATE POLICY "nutrition_day_logs_update_access" ON "public"."nutrition_day_logs" FOR UPDATE TO "authenticated" USING (("public"."is_pt_workspace_member"("workspace_id") OR "public"."is_client_owner"("client_id"))) WITH CHECK (("public"."is_pt_workspace_member"("workspace_id") OR "public"."is_client_owner"("client_id")));



ALTER TABLE "public"."nutrition_meal_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutrition_meal_logs_client_insert_own" ON "public"."nutrition_meal_logs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."assigned_nutrition_meals" "am"
     JOIN "public"."assigned_nutrition_days" "ad" ON (("ad"."id" = "am"."assigned_nutrition_day_id")))
     JOIN "public"."assigned_nutrition_plans" "ap" ON (("ap"."id" = "ad"."assigned_nutrition_plan_id")))
  WHERE (("am"."id" = "nutrition_meal_logs"."assigned_nutrition_meal_id") AND "public"."is_client_owner"("ap"."client_id")))));



CREATE POLICY "nutrition_meal_logs_client_update_own" ON "public"."nutrition_meal_logs" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."assigned_nutrition_meals" "am"
     JOIN "public"."assigned_nutrition_days" "ad" ON (("ad"."id" = "am"."assigned_nutrition_day_id")))
     JOIN "public"."assigned_nutrition_plans" "ap" ON (("ap"."id" = "ad"."assigned_nutrition_plan_id")))
  WHERE (("am"."id" = "nutrition_meal_logs"."assigned_nutrition_meal_id") AND "public"."is_client_owner"("ap"."client_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."assigned_nutrition_meals" "am"
     JOIN "public"."assigned_nutrition_days" "ad" ON (("ad"."id" = "am"."assigned_nutrition_day_id")))
     JOIN "public"."assigned_nutrition_plans" "ap" ON (("ap"."id" = "ad"."assigned_nutrition_plan_id")))
  WHERE (("am"."id" = "nutrition_meal_logs"."assigned_nutrition_meal_id") AND "public"."is_client_owner"("ap"."client_id")))));



CREATE POLICY "nutrition_meal_logs_select_access" ON "public"."nutrition_meal_logs" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM (("public"."assigned_nutrition_meals" "am"
     JOIN "public"."assigned_nutrition_days" "ad" ON (("ad"."id" = "am"."assigned_nutrition_day_id")))
     JOIN "public"."assigned_nutrition_plans" "ap" ON (("ap"."id" = "ad"."assigned_nutrition_plan_id")))
  WHERE (("am"."id" = "nutrition_meal_logs"."assigned_nutrition_meal_id") AND "public"."is_client_owner"("ap"."client_id")))) OR (EXISTS ( SELECT 1
   FROM ((("public"."assigned_nutrition_meals" "am"
     JOIN "public"."assigned_nutrition_days" "ad" ON (("ad"."id" = "am"."assigned_nutrition_day_id")))
     JOIN "public"."assigned_nutrition_plans" "ap" ON (("ap"."id" = "ad"."assigned_nutrition_plan_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "ap"."client_id")))
  WHERE (("am"."id" = "nutrition_meal_logs"."assigned_nutrition_meal_id") AND "public"."is_pt_workspace_member"("c"."workspace_id"))))));



ALTER TABLE "public"."nutrition_template_days" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutrition_template_days_pt_manage" ON "public"."nutrition_template_days" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutrition_templates" "nt"
  WHERE (("nt"."id" = "nutrition_template_days"."nutrition_template_id") AND "public"."is_pt_workspace_member"("nt"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."nutrition_templates" "nt"
  WHERE (("nt"."id" = "nutrition_template_days"."nutrition_template_id") AND "public"."is_pt_workspace_member"("nt"."workspace_id")))));



ALTER TABLE "public"."nutrition_template_meal_components" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutrition_template_meal_components_pt_manage" ON "public"."nutrition_template_meal_components" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."nutrition_template_meals" "tm"
     JOIN "public"."nutrition_template_days" "td" ON (("td"."id" = "tm"."nutrition_template_day_id")))
     JOIN "public"."nutrition_templates" "nt" ON (("nt"."id" = "td"."nutrition_template_id")))
  WHERE (("tm"."id" = "nutrition_template_meal_components"."nutrition_template_meal_id") AND "public"."is_pt_workspace_member"("nt"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."nutrition_template_meals" "tm"
     JOIN "public"."nutrition_template_days" "td" ON (("td"."id" = "tm"."nutrition_template_day_id")))
     JOIN "public"."nutrition_templates" "nt" ON (("nt"."id" = "td"."nutrition_template_id")))
  WHERE (("tm"."id" = "nutrition_template_meal_components"."nutrition_template_meal_id") AND "public"."is_pt_workspace_member"("nt"."workspace_id")))));



ALTER TABLE "public"."nutrition_template_meal_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutrition_template_meal_items_pt_manage" ON "public"."nutrition_template_meal_items" TO "authenticated" USING ("public"."is_pt_workspace_member"("workspace_id")) WITH CHECK ("public"."is_pt_workspace_member"("workspace_id"));



ALTER TABLE "public"."nutrition_template_meals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutrition_template_meals_pt_manage" ON "public"."nutrition_template_meals" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."nutrition_template_days" "td"
     JOIN "public"."nutrition_templates" "nt" ON (("nt"."id" = "td"."nutrition_template_id")))
  WHERE (("td"."id" = "nutrition_template_meals"."nutrition_template_day_id") AND "public"."is_pt_workspace_member"("nt"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."nutrition_template_days" "td"
     JOIN "public"."nutrition_templates" "nt" ON (("nt"."id" = "td"."nutrition_template_id")))
  WHERE (("td"."id" = "nutrition_template_meals"."nutrition_template_day_id") AND "public"."is_pt_workspace_member"("nt"."workspace_id")))));



ALTER TABLE "public"."nutrition_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutrition_templates_pt_manage" ON "public"."nutrition_templates" TO "authenticated" USING ("public"."is_pt_workspace_member"("workspace_id")) WITH CHECK ("public"."is_pt_workspace_member"("workspace_id"));



ALTER TABLE "public"."program_template_days" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program_template_days_pt_manage" ON "public"."program_template_days" USING ((EXISTS ( SELECT 1
   FROM ("public"."program_templates" "pt"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "pt"."workspace_id")))
  WHERE (("pt"."id" = "program_template_days"."program_template_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."program_templates" "pt"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "pt"."workspace_id")))
  WHERE (("pt"."id" = "program_template_days"."program_template_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



ALTER TABLE "public"."program_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program_templates_pt_manage" ON "public"."program_templates" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "program_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "program_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" = ANY (ARRAY['pt_owner'::"text", 'pt_coach'::"text"]))))));



ALTER TABLE "public"."pt_hub_lead_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pt_hub_lead_notes_insert_own" ON "public"."pt_hub_lead_notes" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."pt_hub_leads" "lead"
  WHERE (("lead"."id" = "pt_hub_lead_notes"."lead_id") AND ("lead"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "pt_hub_lead_notes_select_own" ON "public"."pt_hub_lead_notes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."pt_hub_leads" "lead"
  WHERE (("lead"."id" = "pt_hub_lead_notes"."lead_id") AND ("lead"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."pt_hub_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pt_hub_leads_insert_own" ON "public"."pt_hub_leads" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "pt_hub_leads_select_own" ON "public"."pt_hub_leads" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "pt_hub_leads_update_own" ON "public"."pt_hub_leads" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."pt_hub_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pt_hub_profiles_insert_own" ON "public"."pt_hub_profiles" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "pt_hub_profiles_select_own" ON "public"."pt_hub_profiles" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "pt_hub_profiles_select_published" ON "public"."pt_hub_profiles" FOR SELECT TO "authenticated", "anon" USING ((("is_published" = true) AND ("slug" IS NOT NULL) AND ("btrim"("slug") <> ''::"text") AND (EXISTS ( SELECT 1
   FROM "public"."pt_hub_settings" "settings"
  WHERE (("settings"."user_id" = "pt_hub_profiles"."user_id") AND ("settings"."profile_visibility" = 'listed'::"text"))))));



CREATE POLICY "pt_hub_profiles_update_own" ON "public"."pt_hub_profiles" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."pt_hub_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pt_hub_settings_insert_own" ON "public"."pt_hub_settings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "pt_hub_settings_select_own" ON "public"."pt_hub_settings" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "pt_hub_settings_update_own" ON "public"."pt_hub_settings" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."pt_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pt_profiles_insert_own" ON "public"."pt_profiles" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "pt_profiles_select_own" ON "public"."pt_profiles" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "pt_profiles_update_own" ON "public"."pt_profiles" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "trainer_isolation" ON "public"."_archive_workout_log_items" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."_archive_workout_template_items" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."assigned_nutrition_days" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."assigned_nutrition_meal_components" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."assigned_nutrition_meals" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."assigned_nutrition_plans" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."assigned_workout_exercises" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."assigned_workouts" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."baseline_entries" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."baseline_marker_templates" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."baseline_marker_values" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."baseline_metrics" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."baseline_photos" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."checkin_answers" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."checkin_photos" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."checkin_questions" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."checkin_templates" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."checkins" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."client_macro_targets" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."client_program_assignments" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."client_program_overrides" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."client_programs" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."client_targets" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."clients" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "trainer_isolation" ON "public"."coach_activity_log" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."coach_calendar_events" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."coach_todos" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."conversations" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."dismissed_reminders" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."exercises" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."habit_logs" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."invites" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."message_typing" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "trainer_isolation" ON "public"."messages" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."nutrition_day_logs" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."nutrition_meal_logs" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."nutrition_template_days" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."nutrition_template_meal_components" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."nutrition_template_meal_items" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."nutrition_template_meals" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."nutrition_templates" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."program_template_days" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."program_templates" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."pt_profiles" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "trainer_isolation" ON "public"."workout_logs" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."workout_sessions" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."workout_set_logs" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."workout_template_exercises" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."workout_templates" USING (false) WITH CHECK (false);



CREATE POLICY "trainer_isolation" ON "public"."workspace_members" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "trainer_isolation" ON "public"."workspaces" USING (false) WITH CHECK (false);



ALTER TABLE "public"."workout_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_logs_insert_own" ON "public"."workout_logs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "workout_logs"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "workout_logs_select_own" ON "public"."workout_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "workout_logs"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "workout_logs_update_own" ON "public"."workout_logs" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "workout_logs"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "workout_logs"."client_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."workout_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_sessions_delete_pt" ON "public"."workout_sessions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("aw"."id" = "workout_sessions"."assigned_workout_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "workout_sessions_insert_client" ON "public"."workout_sessions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
  WHERE (("aw"."id" = "workout_sessions"."assigned_workout_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "workout_sessions_select" ON "public"."workout_sessions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM (("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("aw"."id" = "workout_sessions"."assigned_workout_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
  WHERE (("aw"."id" = "workout_sessions"."assigned_workout_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "workout_sessions_update" ON "public"."workout_sessions" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM (("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("aw"."id" = "workout_sessions"."assigned_workout_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
  WHERE (("aw"."id" = "workout_sessions"."assigned_workout_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("aw"."id" = "workout_sessions"."assigned_workout_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."assigned_workouts" "aw"
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
  WHERE (("aw"."id" = "workout_sessions"."assigned_workout_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."workout_set_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_set_logs_delete_pt" ON "public"."workout_set_logs" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((("public"."workout_sessions" "ws"
     JOIN "public"."assigned_workouts" "aw" ON (("aw"."id" = "ws"."assigned_workout_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("ws"."id" = "workout_set_logs"."workout_session_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "workout_set_logs_insert_client" ON "public"."workout_set_logs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."workout_sessions" "ws"
     JOIN "public"."assigned_workouts" "aw" ON (("aw"."id" = "ws"."assigned_workout_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
  WHERE (("ws"."id" = "workout_set_logs"."workout_session_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "workout_set_logs_select" ON "public"."workout_set_logs" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ((("public"."workout_sessions" "ws"
     JOIN "public"."assigned_workouts" "aw" ON (("aw"."id" = "ws"."assigned_workout_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("ws"."id" = "workout_set_logs"."workout_session_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))) OR (EXISTS ( SELECT 1
   FROM (("public"."workout_sessions" "ws"
     JOIN "public"."assigned_workouts" "aw" ON (("aw"."id" = "ws"."assigned_workout_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
  WHERE (("ws"."id" = "workout_set_logs"."workout_session_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "workout_set_logs_update" ON "public"."workout_set_logs" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ((("public"."workout_sessions" "ws"
     JOIN "public"."assigned_workouts" "aw" ON (("aw"."id" = "ws"."assigned_workout_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("ws"."id" = "workout_set_logs"."workout_session_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))) OR (EXISTS ( SELECT 1
   FROM (("public"."workout_sessions" "ws"
     JOIN "public"."assigned_workouts" "aw" ON (("aw"."id" = "ws"."assigned_workout_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
  WHERE (("ws"."id" = "workout_set_logs"."workout_session_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ((("public"."workout_sessions" "ws"
     JOIN "public"."assigned_workouts" "aw" ON (("aw"."id" = "ws"."assigned_workout_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "c"."workspace_id")))
  WHERE (("ws"."id" = "workout_set_logs"."workout_session_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))) OR (EXISTS ( SELECT 1
   FROM (("public"."workout_sessions" "ws"
     JOIN "public"."assigned_workouts" "aw" ON (("aw"."id" = "ws"."assigned_workout_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "aw"."client_id")))
  WHERE (("ws"."id" = "workout_set_logs"."workout_session_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."workout_template_exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_template_exercises_pt_manage" ON "public"."workout_template_exercises" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."workout_templates" "wt"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "wt"."workspace_id")))
  WHERE (("wt"."id" = "workout_template_exercises"."workout_template_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."workout_templates" "wt"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "wt"."workspace_id")))
  WHERE (("wt"."id" = "workout_template_exercises"."workout_template_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



ALTER TABLE "public"."workout_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_templates_delete_pt" ON "public"."workout_templates" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "workout_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "workout_templates_insert_pt" ON "public"."workout_templates" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "workout_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



CREATE POLICY "workout_templates_select_access" ON "public"."workout_templates" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."workspace_id" = "workout_templates"."workspace_id") AND ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "workout_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))));



CREATE POLICY "workout_templates_update_pt" ON "public"."workout_templates" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "workout_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "workout_templates"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_members_select_own" ON "public"."workspace_members" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspaces_member_read" ON "public"."workspaces" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "workspaces"."id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "workspaces_update_access" ON "public"."workspaces" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "workspaces"."id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "workspaces"."id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("wm"."role")::"text" ~~ 'pt_%'::"text")))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_invite"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_invite"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_invite"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invite"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_invite"("p_code" "text", "p_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_invite"("p_code" "text", "p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invite"("p_code" "text", "p_display_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_program_to_client"("p_client_id" "uuid", "p_program_template_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."apply_program_to_client"("p_client_id" "uuid", "p_program_template_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_program_to_client"("p_client_id" "uuid", "p_program_template_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_nutrition_template_to_client"("p_client_id" "uuid", "p_template_id" "uuid", "p_start_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_nutrition_template_to_client"("p_client_id" "uuid", "p_template_id" "uuid", "p_start_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."assign_nutrition_template_to_client"("p_client_id" "uuid", "p_template_id" "uuid", "p_start_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_nutrition_template_to_client"("p_client_id" "uuid", "p_template_id" "uuid", "p_start_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_program_to_client"("p_client_id" "uuid", "p_program_id" "uuid", "p_start_date" "date", "p_days_ahead" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."assign_program_to_client"("p_client_id" "uuid", "p_program_id" "uuid", "p_start_date" "date", "p_days_ahead" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_program_to_client"("p_client_id" "uuid", "p_program_id" "uuid", "p_start_date" "date", "p_days_ahead" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_workout_with_template"("p_client_id" "uuid", "p_scheduled_date" "date", "p_workout_template_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_workout_with_template"("p_client_id" "uuid", "p_scheduled_date" "date", "p_workout_template_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."assign_workout_with_template"("p_client_id" "uuid", "p_scheduled_date" "date", "p_workout_template_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_workout_with_template"("p_client_id" "uuid", "p_scheduled_date" "date", "p_workout_template_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."auto_materialize_assigned_exercises"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auto_materialize_assigned_exercises"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_materialize_assigned_exercises"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_materialize_assigned_exercises"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_invite"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_invite"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."consume_invite"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_invite"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_invite"("p_workspace_id" "uuid", "p_max_uses" integer, "p_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."create_invite"("p_workspace_id" "uuid", "p_max_uses" integer, "p_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_invite"("p_workspace_id" "uuid", "p_max_uses" integer, "p_expires_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_workspace"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_workspace"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_workspace"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_workspace"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_assigned_nutrition_item_client_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_assigned_nutrition_item_client_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_assigned_nutrition_item_client_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_nutrition_day_log_client_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_nutrition_day_log_client_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_nutrition_day_log_client_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_invite_by_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_invite_by_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invite_by_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invite_by_code"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_unread_notification_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_unread_notification_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_notification_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_notification_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_assigned_workout_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_assigned_workout_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_assigned_workout_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_checkin_requested_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_checkin_requested_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_checkin_requested_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_checkin_submitted_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_checkin_submitted_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_checkin_submitted_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_invite_accepted_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_invite_accepted_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_invite_accepted_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_message_received_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_message_received_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_message_received_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_client_owner"("p_client_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_client_owner"("p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_client_owner"("p_client_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_pt_workspace_member"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_pt_workspace_member"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_pt_workspace_member"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_workspace_pt"("ws_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_pt"("ws_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_pt"("ws_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_all_notifications_read"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."materialize_assigned_workout_exercises"("p_assigned_workout_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."materialize_assigned_workout_exercises"("p_assigned_workout_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."materialize_assigned_workout_exercises"("p_assigned_workout_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."materialize_assigned_workout_exercises"("p_assigned_workout_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notification_pref_enabled"("p_user_id" "uuid", "p_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notification_pref_enabled"("p_user_id" "uuid", "p_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."notification_pref_enabled"("p_user_id" "uuid", "p_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notification_pref_enabled"("p_user_id" "uuid", "p_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_user"("p_recipient_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_action_url" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_image_url" "text", "p_metadata" "jsonb", "p_category" "text", "p_priority" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_user"("p_recipient_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_action_url" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_image_url" "text", "p_metadata" "jsonb", "p_category" "text", "p_priority" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."notify_user"("p_recipient_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_action_url" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_image_url" "text", "p_metadata" "jsonb", "p_category" "text", "p_priority" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_user"("p_recipient_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_action_url" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_image_url" "text", "p_metadata" "jsonb", "p_category" "text", "p_priority" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pt_clients_summary"("p_workspace_id" "uuid", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pt_clients_summary"("p_workspace_id" "uuid", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."pt_clients_summary"("p_workspace_id" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pt_clients_summary"("p_workspace_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pt_dashboard_summary"("p_workspace_id" "uuid", "p_coach_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pt_dashboard_summary"("p_workspace_id" "uuid", "p_coach_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pt_dashboard_summary"("p_workspace_id" "uuid", "p_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pt_dashboard_summary"("p_workspace_id" "uuid", "p_coach_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON FUNCTION "public"."pt_update_client_admin_fields"("p_client_id" "uuid", "p_training_type" "text", "p_tags" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pt_update_client_admin_fields"("p_client_id" "uuid", "p_training_type" "text", "p_tags" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pt_update_client_admin_fields"("p_client_id" "uuid", "p_training_type" "text", "p_tags" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."restrict_notification_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."restrict_notification_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restrict_notification_updates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_message_workspace_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_message_workspace_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_message_workspace_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_my_appearance_preferences"("p_theme_preference" "text", "p_compact_density" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_my_appearance_preferences"("p_theme_preference" "text", "p_compact_density" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_my_appearance_preferences"("p_theme_preference" "text", "p_compact_density" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_my_appearance_preferences"("p_theme_preference" "text", "p_compact_density" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_pt_profile_publication"("p_publish" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_pt_profile_publication"("p_publish" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_pt_profile_publication"("p_publish" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_pt_profile_publication"("p_publish" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_workout_session_client_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_workout_session_client_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_workout_session_client_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."slugify_text"("input_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."slugify_text"("input_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."slugify_text"("input_text" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_public_pt_application"("p_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_goal_summary" "text", "p_training_experience" "text", "p_budget_interest" "text", "p_package_interest" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_public_pt_application"("p_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_goal_summary" "text", "p_training_experience" "text", "p_budget_interest" "text", "p_package_interest" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_public_pt_application"("p_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_goal_summary" "text", "p_training_experience" "text", "p_budget_interest" "text", "p_package_interest" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_public_pt_application"("p_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_goal_summary" "text", "p_training_experience" "text", "p_budget_interest" "text", "p_package_interest" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_assigned_workout_exercises_from_template"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_assigned_workout_exercises_from_template"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_assigned_workout_exercises_from_template"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_assigned_workout_exercises_from_template"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_notification_reminders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_notification_reminders"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_notification_reminders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_notification_reminders"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_notification_reminders_for_user"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_notification_reminders_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_notification_reminders_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_notification_reminders_for_user"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_pt_hub_display_name_to_pt_profiles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_pt_hub_display_name_to_pt_profiles"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_pt_hub_display_name_to_pt_profiles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_pt_hub_display_name_to_pt_profiles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_conversation_last_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_conversation_last_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_conversation_last_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_invite"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_invite"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_invite"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_invite"("p_token" "text") TO "service_role";



GRANT ALL ON TABLE "public"."_archive_workout_log_items" TO "service_role";



GRANT ALL ON TABLE "public"."_archive_workout_template_items" TO "service_role";



GRANT ALL ON TABLE "public"."assigned_nutrition_days" TO "anon";
GRANT ALL ON TABLE "public"."assigned_nutrition_days" TO "authenticated";
GRANT ALL ON TABLE "public"."assigned_nutrition_days" TO "service_role";



GRANT ALL ON TABLE "public"."assigned_nutrition_meal_components" TO "anon";
GRANT ALL ON TABLE "public"."assigned_nutrition_meal_components" TO "authenticated";
GRANT ALL ON TABLE "public"."assigned_nutrition_meal_components" TO "service_role";



GRANT ALL ON TABLE "public"."assigned_nutrition_meals" TO "anon";
GRANT ALL ON TABLE "public"."assigned_nutrition_meals" TO "authenticated";
GRANT ALL ON TABLE "public"."assigned_nutrition_meals" TO "service_role";



GRANT ALL ON TABLE "public"."assigned_nutrition_plans" TO "anon";
GRANT ALL ON TABLE "public"."assigned_nutrition_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."assigned_nutrition_plans" TO "service_role";



GRANT ALL ON TABLE "public"."assigned_workout_exercises" TO "anon";
GRANT ALL ON TABLE "public"."assigned_workout_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."assigned_workout_exercises" TO "service_role";



GRANT ALL ON TABLE "public"."assigned_workouts" TO "anon";
GRANT ALL ON TABLE "public"."assigned_workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."assigned_workouts" TO "service_role";



GRANT ALL ON TABLE "public"."baseline_entries" TO "anon";
GRANT ALL ON TABLE "public"."baseline_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."baseline_entries" TO "service_role";



GRANT ALL ON TABLE "public"."baseline_marker_templates" TO "anon";
GRANT ALL ON TABLE "public"."baseline_marker_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."baseline_marker_templates" TO "service_role";



GRANT ALL ON TABLE "public"."baseline_marker_values" TO "anon";
GRANT ALL ON TABLE "public"."baseline_marker_values" TO "authenticated";
GRANT ALL ON TABLE "public"."baseline_marker_values" TO "service_role";



GRANT ALL ON TABLE "public"."baseline_metrics" TO "anon";
GRANT ALL ON TABLE "public"."baseline_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."baseline_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."baseline_photos" TO "anon";
GRANT ALL ON TABLE "public"."baseline_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."baseline_photos" TO "service_role";



GRANT ALL ON TABLE "public"."checkin_answers" TO "anon";
GRANT ALL ON TABLE "public"."checkin_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."checkin_answers" TO "service_role";



GRANT ALL ON TABLE "public"."checkin_photos" TO "anon";
GRANT ALL ON TABLE "public"."checkin_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."checkin_photos" TO "service_role";



GRANT ALL ON TABLE "public"."checkin_questions" TO "anon";
GRANT ALL ON TABLE "public"."checkin_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."checkin_questions" TO "service_role";



GRANT ALL ON TABLE "public"."checkin_templates" TO "anon";
GRANT ALL ON TABLE "public"."checkin_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."checkin_templates" TO "service_role";



GRANT ALL ON TABLE "public"."checkins" TO "anon";
GRANT ALL ON TABLE "public"."checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."checkins" TO "service_role";



GRANT ALL ON TABLE "public"."client_macro_targets" TO "anon";
GRANT ALL ON TABLE "public"."client_macro_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."client_macro_targets" TO "service_role";



GRANT ALL ON TABLE "public"."client_program_assignments" TO "anon";
GRANT ALL ON TABLE "public"."client_program_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."client_program_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."client_program_overrides" TO "anon";
GRANT ALL ON TABLE "public"."client_program_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."client_program_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."client_programs" TO "anon";
GRANT ALL ON TABLE "public"."client_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."client_programs" TO "service_role";



GRANT ALL ON TABLE "public"."client_targets" TO "anon";
GRANT ALL ON TABLE "public"."client_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."client_targets" TO "service_role";



GRANT ALL ON TABLE "public"."coach_activity_log" TO "anon";
GRANT ALL ON TABLE "public"."coach_activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."coach_calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."coach_calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_calendar_events" TO "service_role";



GRANT ALL ON TABLE "public"."coach_todos" TO "anon";
GRANT ALL ON TABLE "public"."coach_todos" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_todos" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."dismissed_reminders" TO "anon";
GRANT ALL ON TABLE "public"."dismissed_reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."dismissed_reminders" TO "service_role";



GRANT ALL ON TABLE "public"."exercises" TO "anon";
GRANT ALL ON TABLE "public"."exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercises" TO "service_role";



GRANT ALL ON TABLE "public"."habit_logs" TO "anon";
GRANT ALL ON TABLE "public"."habit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."habit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."invites" TO "anon";
GRANT ALL ON TABLE "public"."invites" TO "authenticated";
GRANT ALL ON TABLE "public"."invites" TO "service_role";



GRANT ALL ON TABLE "public"."message_typing" TO "anon";
GRANT ALL ON TABLE "public"."message_typing" TO "authenticated";
GRANT ALL ON TABLE "public"."message_typing" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_day_logs" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_day_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_day_logs" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_meal_logs" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_meal_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_meal_logs" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_template_days" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_template_days" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_template_days" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_template_meal_components" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_template_meal_components" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_template_meal_components" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_template_meal_items" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_template_meal_items" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_template_meal_items" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_template_meals" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_template_meals" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_template_meals" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_templates" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_templates" TO "service_role";



GRANT ALL ON TABLE "public"."program_template_days" TO "anon";
GRANT ALL ON TABLE "public"."program_template_days" TO "authenticated";
GRANT ALL ON TABLE "public"."program_template_days" TO "service_role";



GRANT ALL ON TABLE "public"."program_templates" TO "anon";
GRANT ALL ON TABLE "public"."program_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."program_templates" TO "service_role";



GRANT ALL ON TABLE "public"."pt_hub_lead_notes" TO "anon";
GRANT ALL ON TABLE "public"."pt_hub_lead_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."pt_hub_lead_notes" TO "service_role";



GRANT ALL ON TABLE "public"."pt_hub_leads" TO "anon";
GRANT ALL ON TABLE "public"."pt_hub_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."pt_hub_leads" TO "service_role";



GRANT ALL ON TABLE "public"."pt_hub_profiles" TO "anon";
GRANT ALL ON TABLE "public"."pt_hub_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."pt_hub_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."pt_hub_settings" TO "anon";
GRANT ALL ON TABLE "public"."pt_hub_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."pt_hub_settings" TO "service_role";



GRANT ALL ON TABLE "public"."pt_profiles" TO "anon";
GRANT ALL ON TABLE "public"."pt_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."pt_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_members" TO "anon";
GRANT ALL ON TABLE "public"."workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_members" TO "service_role";



GRANT ALL ON TABLE "public"."v_workspace_pt_members" TO "anon";
GRANT ALL ON TABLE "public"."v_workspace_pt_members" TO "authenticated";
GRANT ALL ON TABLE "public"."v_workspace_pt_members" TO "service_role";



GRANT ALL ON TABLE "public"."workout_logs" TO "anon";
GRANT ALL ON TABLE "public"."workout_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_logs" TO "service_role";



GRANT ALL ON TABLE "public"."workout_sessions" TO "anon";
GRANT ALL ON TABLE "public"."workout_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."workout_set_logs" TO "anon";
GRANT ALL ON TABLE "public"."workout_set_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_set_logs" TO "service_role";



GRANT ALL ON TABLE "public"."workout_template_exercises" TO "anon";
GRANT ALL ON TABLE "public"."workout_template_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_template_exercises" TO "service_role";



GRANT ALL ON TABLE "public"."workout_templates" TO "anon";
GRANT ALL ON TABLE "public"."workout_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_templates" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







