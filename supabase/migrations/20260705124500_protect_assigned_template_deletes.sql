-- PR-UI-01.9D: protect active delivery source rows from library deletes.

create or replace function public.is_program_template_in_active_delivery(
  p_program_template_id uuid
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.client_programs cp
    where cp.program_template_id = p_program_template_id
      and cp.is_active = true
  )
  or exists (
    select 1
    from public.assigned_workouts aw
    where aw.program_id = p_program_template_id
      and aw.status = 'planned'
      and aw.completed_at is null
  );
$$;

create or replace function public.is_workout_template_in_active_delivery(
  p_workout_template_id uuid
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.assigned_workouts aw
    where aw.workout_template_id = p_workout_template_id
      and aw.status = 'planned'
      and aw.completed_at is null
  )
  or exists (
    select 1
    from public.client_program_overrides cpo
    join public.client_programs cp on cp.id = cpo.client_program_id
    where cpo.workout_template_id = p_workout_template_id
      and cp.is_active = true
  )
  or exists (
    select 1
    from public.program_template_days ptd
    where ptd.workout_template_id = p_workout_template_id
      and public.is_program_template_in_active_delivery(ptd.program_template_id)
  );
$$;

create or replace function public.raise_assigned_template_delete_protection()
returns void
language plpgsql
as $$
begin
  raise exception
    'This template is already assigned to a client and cannot be deleted. Existing client assignments prevent deletion. Historical records are preserved.'
    using errcode = 'P0001';
end;
$$;

create or replace function public.prevent_assigned_program_template_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_program_template_in_active_delivery(old.id) then
    perform public.raise_assigned_template_delete_protection();
  end if;
  return old;
end;
$$;

create or replace function public.prevent_assigned_workout_template_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_workout_template_in_active_delivery(old.id) then
    perform public.raise_assigned_template_delete_protection();
  end if;
  return old;
end;
$$;

create or replace function public.prevent_assigned_program_day_rewrite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_program_template_in_active_delivery(old.program_template_id) then
    perform public.raise_assigned_template_delete_protection();
  end if;
  return old;
end;
$$;

create or replace function public.prevent_assigned_workout_exercise_rewrite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_workout_template_in_active_delivery(old.workout_template_id) then
    perform public.raise_assigned_template_delete_protection();
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_assigned_program_template_delete_trigger
  on public.program_templates;
create trigger prevent_assigned_program_template_delete_trigger
before delete on public.program_templates
for each row execute function public.prevent_assigned_program_template_delete();

drop trigger if exists prevent_assigned_workout_template_delete_trigger
  on public.workout_templates;
create trigger prevent_assigned_workout_template_delete_trigger
before delete on public.workout_templates
for each row execute function public.prevent_assigned_workout_template_delete();

drop trigger if exists prevent_assigned_program_day_delete_trigger
  on public.program_template_days;
create trigger prevent_assigned_program_day_delete_trigger
before delete on public.program_template_days
for each row execute function public.prevent_assigned_program_day_rewrite();

drop trigger if exists prevent_assigned_program_day_update_trigger
  on public.program_template_days;
create trigger prevent_assigned_program_day_update_trigger
before update on public.program_template_days
for each row execute function public.prevent_assigned_program_day_rewrite();

drop trigger if exists prevent_assigned_workout_exercise_delete_trigger
  on public.workout_template_exercises;
create trigger prevent_assigned_workout_exercise_delete_trigger
before delete on public.workout_template_exercises
for each row execute function public.prevent_assigned_workout_exercise_rewrite();

drop trigger if exists prevent_assigned_workout_exercise_update_trigger
  on public.workout_template_exercises;
create trigger prevent_assigned_workout_exercise_update_trigger
before update on public.workout_template_exercises
for each row execute function public.prevent_assigned_workout_exercise_rewrite();

grant execute on function public.is_program_template_in_active_delivery(uuid)
  to authenticated;
grant execute on function public.is_workout_template_in_active_delivery(uuid)
  to authenticated;
