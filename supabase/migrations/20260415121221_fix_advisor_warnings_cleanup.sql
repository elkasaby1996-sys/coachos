-- Consolidate RLS policies and harden function search_path to resolve Supabase advisor warnings.

-- -----------------------------
-- assigned_workouts
-- -----------------------------
drop policy if exists assigned_workouts_delete_client_personal on public.assigned_workouts;
drop policy if exists assigned_workouts_delete_pt on public.assigned_workouts;
create policy assigned_workouts_delete_access
on public.assigned_workouts
for delete
to authenticated
using (
  (
    exists (
      select 1
      from public.clients c
      where c.id = assigned_workouts.client_id
        and c.user_id = (select auth.uid())
    )
    and assigned_workouts.workout_template_id is null
    and assigned_workouts.program_id is null
  )
  or exists (
    select 1
    from public.clients c
    join public.workspace_members wm on wm.workspace_id = c.workspace_id
    where c.id = assigned_workouts.client_id
      and wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
  )
);

drop policy if exists assigned_workouts_insert_client on public.assigned_workouts;
drop policy if exists assigned_workouts_insert_pt on public.assigned_workouts;
create policy assigned_workouts_insert_access
on public.assigned_workouts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.clients c
    where c.id = assigned_workouts.client_id
      and c.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.clients c
    join public.workspace_members wm on wm.workspace_id = c.workspace_id
    where c.id = assigned_workouts.client_id
      and wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
  )
);

-- -----------------------------
-- assigned_workout_exercises
-- -----------------------------
drop policy if exists awe_delete_client on public.assigned_workout_exercises;
drop policy if exists awe_delete_pt on public.assigned_workout_exercises;
create policy awe_delete_access
on public.assigned_workout_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.assigned_workouts aw
    join public.clients c on c.id = aw.client_id
    where aw.id = assigned_workout_exercises.assigned_workout_id
      and c.user_id = (select auth.uid())
      and aw.workout_template_id is null
      and aw.program_id is null
  )
  or exists (
    select 1
    from public.assigned_workouts aw
    join public.clients c on c.id = aw.client_id
    join public.workspace_members wm on wm.workspace_id = c.workspace_id
    where aw.id = assigned_workout_exercises.assigned_workout_id
      and wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
  )
);

drop policy if exists awe_insert_client on public.assigned_workout_exercises;
drop policy if exists awe_insert_pt on public.assigned_workout_exercises;
create policy awe_insert_access
on public.assigned_workout_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.assigned_workouts aw
    join public.clients c on c.id = aw.client_id
    where aw.id = assigned_workout_exercises.assigned_workout_id
      and c.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.assigned_workouts aw
    join public.clients c on c.id = aw.client_id
    join public.workspace_members wm on wm.workspace_id = c.workspace_id
    where aw.id = assigned_workout_exercises.assigned_workout_id
      and wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
  )
);

-- -----------------------------
-- exercises
-- -----------------------------
drop policy if exists exercises_insert_client_own on public.exercises;
drop policy if exists exercises_insert_pt on public.exercises;
create policy exercises_insert_access
on public.exercises
for insert
to authenticated
with check (
  (
    exercises.owner_user_id = (select auth.uid())
    and exercises.workspace_id is null
  )
  or exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where w.owner_user_id = exercises.owner_user_id
      and wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
  )
);

drop policy if exists exercises_select_own on public.exercises;
drop policy if exists exercises_select_access on public.exercises;
create policy exercises_select_access
on public.exercises
for select
to authenticated
using (
  exercises.owner_user_id = (select auth.uid())
  or exists (
    select 1
    from public.assigned_workout_exercises awe
    join public.assigned_workouts aw on aw.id = awe.assigned_workout_id
    join public.clients c on c.id = aw.client_id
    where awe.exercise_id = exercises.id
      and c.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where w.owner_user_id = exercises.owner_user_id
      and wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
  )
);

-- -----------------------------
-- baseline_marker_templates
-- -----------------------------
drop policy if exists baseline_marker_templates_delete_pt on public.baseline_marker_templates;
create policy baseline_marker_templates_delete_pt
on public.baseline_marker_templates
for delete
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
      and w.owner_user_id = baseline_marker_templates.owner_user_id
  )
);

drop policy if exists baseline_marker_templates_insert_pt on public.baseline_marker_templates;
create policy baseline_marker_templates_insert_pt
on public.baseline_marker_templates
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
      and w.owner_user_id = baseline_marker_templates.owner_user_id
  )
);

drop policy if exists baseline_marker_templates_select_access on public.baseline_marker_templates;
create policy baseline_marker_templates_select_access
on public.baseline_marker_templates
for select
to authenticated
using (
  exists (
    select 1
    from public.clients c
    join public.workspaces w on w.id = c.workspace_id
    where c.user_id = (select auth.uid())
      and w.owner_user_id = baseline_marker_templates.owner_user_id
  )
  or exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
      and w.owner_user_id = baseline_marker_templates.owner_user_id
  )
);

drop policy if exists baseline_marker_templates_update_pt on public.baseline_marker_templates;
create policy baseline_marker_templates_update_pt
on public.baseline_marker_templates
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
      and w.owner_user_id = baseline_marker_templates.owner_user_id
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
      and w.owner_user_id = baseline_marker_templates.owner_user_id
  )
);

-- -----------------------------
-- baseline_entry_marker_templates
-- -----------------------------
drop policy if exists baseline_entry_marker_templates_delete_pt on public.baseline_entry_marker_templates;
create policy baseline_entry_marker_templates_delete_pt
on public.baseline_entry_marker_templates
for delete
to authenticated
using (
  exists (
    select 1
    from public.baseline_entries be
    join public.workspace_members wm on wm.workspace_id = be.workspace_id
    where be.id = baseline_entry_marker_templates.baseline_id
      and wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
  )
);

drop policy if exists baseline_entry_marker_templates_insert_pt on public.baseline_entry_marker_templates;
create policy baseline_entry_marker_templates_insert_pt
on public.baseline_entry_marker_templates
for insert
to authenticated
with check (
  exists (
    select 1
    from public.baseline_entries be
    join public.workspace_members wm on wm.workspace_id = be.workspace_id
    where be.id = baseline_entry_marker_templates.baseline_id
      and wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
  )
);

drop policy if exists baseline_entry_marker_templates_select_access on public.baseline_entry_marker_templates;
create policy baseline_entry_marker_templates_select_access
on public.baseline_entry_marker_templates
for select
to authenticated
using (
  exists (
    select 1
    from public.baseline_entries be
    join public.clients c on c.id = be.client_id
    where be.id = baseline_entry_marker_templates.baseline_id
      and c.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.baseline_entries be
    join public.workspace_members wm on wm.workspace_id = be.workspace_id
    where be.id = baseline_entry_marker_templates.baseline_id
      and wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
  )
);

-- -----------------------------
-- lead chat policies
-- -----------------------------
drop policy if exists lead_conversations_select_participants on public.lead_conversations;
create policy lead_conversations_select_participants
on public.lead_conversations
for select
to authenticated
using (
  (select auth.uid()) = pt_user_id
  or (select auth.uid()) = lead_user_id
);

drop policy if exists lead_messages_select_participants on public.lead_messages;
create policy lead_messages_select_participants
on public.lead_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.lead_conversations c
    where c.id = lead_messages.conversation_id
      and (
        c.pt_user_id = (select auth.uid())
        or c.lead_user_id = (select auth.uid())
      )
  )
);

drop policy if exists lead_conversation_participants_select_own on public.lead_conversation_participants;
create policy lead_conversation_participants_select_own
on public.lead_conversation_participants
for select
to authenticated
using (
  lead_conversation_participants.user_id = (select auth.uid())
  and exists (
    select 1
    from public.lead_conversations c
    where c.id = lead_conversation_participants.conversation_id
      and (
        c.pt_user_id = (select auth.uid())
        or c.lead_user_id = (select auth.uid())
      )
  )
);

drop policy if exists lead_conversation_participants_update_own on public.lead_conversation_participants;
create policy lead_conversation_participants_update_own
on public.lead_conversation_participants
for update
to authenticated
using (lead_conversation_participants.user_id = (select auth.uid()))
with check (lead_conversation_participants.user_id = (select auth.uid()));

drop policy if exists lead_chat_events_select_participants on public.lead_chat_events;
create policy lead_chat_events_select_participants
on public.lead_chat_events
for select
to authenticated
using (
  exists (
    select 1
    from public.lead_conversations c
    where c.id = lead_chat_events.conversation_id
      and (
        c.pt_user_id = (select auth.uid())
        or c.lead_user_id = (select auth.uid())
      )
  )
  or exists (
    select 1
    from public.pt_hub_leads lead
    where lead.id = lead_chat_events.lead_id
      and (
        lead.user_id = (select auth.uid())
        or lead.applicant_user_id = (select auth.uid())
      )
  )
);

-- -----------------------------
-- nutrition templates: merge duplicate permissive policies
-- -----------------------------
drop policy if exists nutrition_templates_client_manage_own on public.nutrition_templates;
drop policy if exists nutrition_templates_pt_manage on public.nutrition_templates;
create policy nutrition_templates_manage_access
on public.nutrition_templates
for all
to authenticated
using (
  is_client_owner(owner_client_id)
  or is_pt_workspace_member(workspace_id)
)
with check (
  (
    is_client_owner(owner_client_id)
    and workspace_id is null
    and owner_client_id is not null
  )
  or is_pt_workspace_member(workspace_id)
);

drop policy if exists nutrition_template_days_client_manage_own on public.nutrition_template_days;
drop policy if exists nutrition_template_days_pt_manage on public.nutrition_template_days;
create policy nutrition_template_days_manage_access
on public.nutrition_template_days
for all
to authenticated
using (
  exists (
    select 1
    from public.nutrition_templates nt
    where nt.id = nutrition_template_days.nutrition_template_id
      and (
        is_client_owner(nt.owner_client_id)
        or is_pt_workspace_member(nt.workspace_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.nutrition_templates nt
    where nt.id = nutrition_template_days.nutrition_template_id
      and (
        is_client_owner(nt.owner_client_id)
        or is_pt_workspace_member(nt.workspace_id)
      )
  )
);

drop policy if exists nutrition_template_meals_client_manage_own on public.nutrition_template_meals;
drop policy if exists nutrition_template_meals_pt_manage on public.nutrition_template_meals;
create policy nutrition_template_meals_manage_access
on public.nutrition_template_meals
for all
to authenticated
using (
  exists (
    select 1
    from public.nutrition_template_days td
    join public.nutrition_templates nt on nt.id = td.nutrition_template_id
    where td.id = nutrition_template_meals.nutrition_template_day_id
      and (
        is_client_owner(nt.owner_client_id)
        or is_pt_workspace_member(nt.workspace_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.nutrition_template_days td
    join public.nutrition_templates nt on nt.id = td.nutrition_template_id
    where td.id = nutrition_template_meals.nutrition_template_day_id
      and (
        is_client_owner(nt.owner_client_id)
        or is_pt_workspace_member(nt.workspace_id)
      )
  )
);

drop policy if exists nutrition_template_meal_components_client_manage_own on public.nutrition_template_meal_components;
drop policy if exists nutrition_template_meal_components_pt_manage on public.nutrition_template_meal_components;
create policy nutrition_template_meal_components_manage_access
on public.nutrition_template_meal_components
for all
to authenticated
using (
  exists (
    select 1
    from public.nutrition_template_meals tm
    join public.nutrition_template_days td on td.id = tm.nutrition_template_day_id
    join public.nutrition_templates nt on nt.id = td.nutrition_template_id
    where tm.id = nutrition_template_meal_components.nutrition_template_meal_id
      and (
        is_client_owner(nt.owner_client_id)
        or is_pt_workspace_member(nt.workspace_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.nutrition_template_meals tm
    join public.nutrition_template_days td on td.id = tm.nutrition_template_day_id
    join public.nutrition_templates nt on nt.id = td.nutrition_template_id
    where tm.id = nutrition_template_meal_components.nutrition_template_meal_id
      and (
        is_client_owner(nt.owner_client_id)
        or is_pt_workspace_member(nt.workspace_id)
      )
  )
);

-- -----------------------------
-- pt_packages: remove duplicate authenticated SELECT permissive policies
-- -----------------------------
drop policy if exists pt_packages_select_owner on public.pt_packages;
drop policy if exists pt_packages_select_public on public.pt_packages;

create policy pt_packages_select_authenticated
on public.pt_packages
for select
to authenticated
using (
  pt_user_id = (select auth.uid())
  or (status = 'active'::text and is_public = true)
);

create policy pt_packages_select_public
on public.pt_packages
for select
to anon
using (status = 'active'::text and is_public = true);

-- -----------------------------
-- function search_path hardening
-- -----------------------------
create or replace function public.hash_rate_limit_key(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $function$
  select case
    when nullif(btrim(coalesce(p_value, '')), '') is null then null
    else md5(lower(btrim(p_value)))
  end;
$function$;

create or replace function public.lead_chat_is_open_lead_status(p_status text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $function$
  select coalesce(p_status, '') = any (
    array[
      'new'::text,
      'contacted'::text,
      'approved_pending_workspace'::text
    ]
  );
$function$;

create or replace function public.validate_performance_marker_assignment_match()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_baseline_workspace_id uuid;
  v_baseline_owner_user_id uuid;
  v_template_owner_user_id uuid;
begin
  select
    be.workspace_id,
    w.owner_user_id
  into
    v_baseline_workspace_id,
    v_baseline_owner_user_id
  from public.baseline_entries be
  join public.workspaces w
    on w.id = be.workspace_id
  where be.id = new.baseline_id;

  select
    coalesce(bmt.owner_user_id, w.owner_user_id)
  into v_template_owner_user_id
  from public.baseline_marker_templates bmt
  left join public.workspaces w
    on w.id = bmt.workspace_id
  where bmt.id = new.template_id;

  if v_baseline_workspace_id is null
    or v_baseline_owner_user_id is null
    or v_template_owner_user_id is null then
    raise exception
      'Performance marker assignment is missing a valid baseline or performance marker.';
  end if;

  if v_baseline_owner_user_id <> v_template_owner_user_id then
    raise exception
      'Performance marker assignments must stay inside the same PT marker library.';
  end if;

  return new;
end;
$function$;
