create or replace function public.normalize_exercise_library_label(input_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case upper(trim(coalesce(input_text, '')))
    when '' then null
    when 'ABDOMINALS' then 'Core'
    when 'ABS' then 'Core'
    when 'ADDUCTOR BREVIS' then 'Legs'
    when 'ADDUCTOR LONGUS' then 'Legs'
    when 'ADDUCTOR MAGNUS' then 'Legs'
    when 'ANTERIOR DELTOID' then 'Shoulders'
    when 'BACK' then 'Back'
    when 'BICEPS' then 'Biceps'
    when 'BICEPS BRACHII' then 'Biceps'
    when 'BRACHIALIS' then 'Biceps'
    when 'BRACHIORADIALIS' then 'Forearms'
    when 'CALVES' then 'Calves'
    when 'CARDIO' then 'Full Body'
    when 'CHEST' then 'Chest'
    when 'DELTOID' then 'Shoulders'
    when 'DELTOIDS' then 'Shoulders'
    when 'ERECTOR SPINAE' then 'Back'
    when 'FOREARMS' then 'Forearms'
    when 'GASTROCNEMIUS' then 'Calves'
    when 'GLUTEUS MAXIMUS' then 'Glutes'
    when 'GLUTEUS MEDIUS' then 'Glutes'
    when 'GLUTEUS MINIMUS' then 'Glutes'
    when 'GLUTES' then 'Glutes'
    when 'HAMSTRINGS' then 'Hamstrings'
    when 'HIPS' then 'Glutes'
    when 'ILIOPSOAS' then 'Core'
    when 'INFRASPINATUS' then 'Back'
    when 'LATS' then 'Back'
    when 'LATISSIMUS DORSI' then 'Back'
    when 'LEGS' then 'Legs'
    when 'LOWER ARMS' then 'Forearms'
    when 'LOWER BACK' then 'Back'
    when 'LOWER LEGS' then 'Calves'
    when 'OBLIQUES' then 'Core'
    when 'PECTORALIS MAJOR' then 'Chest'
    when 'PECTORALIS MINOR' then 'Chest'
    when 'PECTINEUS' then 'Legs'
    when 'POSTERIOR DELTOID' then 'Shoulders'
    when 'QUADRICEPS' then 'Quads'
    when 'QUADS' then 'Quads'
    when 'RECTUS ABDOMINIS' then 'Core'
    when 'RECTUS FEMORIS' then 'Quads'
    when 'RHOMBOIDS' then 'Back'
    when 'SERRATUS ANTERIOR' then 'Core'
    when 'SHOULDERS' then 'Shoulders'
    when 'SOLEUS' then 'Calves'
    when 'TENSOR FASCIAE LATAE' then 'Glutes'
    when 'TERES MAJOR' then 'Back'
    when 'TERES MINOR' then 'Back'
    when 'THIGHS' then 'Legs'
    when 'TRAPEZIUS LOWER FIBERS' then 'Back'
    when 'TRAPEZIUS MIDDLE FIBERS' then 'Back'
    when 'TRAPEZIUS UPPER FIBERS' then 'Back'
    when 'TRAPS' then 'Back'
    when 'TRANSVERSE ABDOMINIS' then 'Core'
    when 'TRICEPS' then 'Triceps'
    when 'TRICEPS BRACHII' then 'Triceps'
    when 'UPPER ARMS' then 'Arms'
    when 'UPPER LEGS' then 'Legs'
    when 'VASTUS INTERMEDIUS' then 'Quads'
    when 'VASTUS LATERALIS' then 'Quads'
    when 'VASTUS MEDIALIS' then 'Quads'
    when 'WAIST' then 'Core'
    else initcap(trim(input_text))
  end;
$function$;

create or replace function public.set_workspace_client_onboarding_timestamps()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  new.updated_at := now();
  new.last_saved_at := now();
  return new;
end;
$function$;

drop policy if exists client_lifecycle_events_select_access on public.client_lifecycle_events;
create policy client_lifecycle_events_select_access
on public.client_lifecycle_events
for select
to authenticated
using (
  exists (
    select 1
    from public.clients c
    left join public.workspace_members wm
      on wm.workspace_id = c.workspace_id
     and wm.user_id = (select auth.uid())
    where c.id = client_lifecycle_events.client_id
      and (
        c.user_id = (select auth.uid())
        or wm.role::text like 'pt_%'
      )
  )
);

drop policy if exists client_medical_documents_access on public.client_medical_documents;
create policy client_medical_documents_access
on public.client_medical_documents
for all
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = client_medical_documents.client_id
      and c.workspace_id = client_medical_documents.workspace_id
      and (
        c.user_id = (select auth.uid())
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = client_medical_documents.workspace_id
            and wm.user_id = (select auth.uid())
            and wm.role::text like 'pt_%'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.clients c
    where c.id = client_medical_documents.client_id
      and c.workspace_id = client_medical_documents.workspace_id
      and (
        c.user_id = (select auth.uid())
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = client_medical_documents.workspace_id
            and wm.user_id = (select auth.uid())
            and wm.role::text like 'pt_%'
        )
      )
  )
);

drop policy if exists client_medical_records_access on public.client_medical_records;
create policy client_medical_records_access
on public.client_medical_records
for all
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = client_medical_records.client_id
      and c.workspace_id = client_medical_records.workspace_id
      and (
        c.user_id = (select auth.uid())
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = client_medical_records.workspace_id
            and wm.user_id = (select auth.uid())
            and wm.role::text like 'pt_%'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.clients c
    where c.id = client_medical_records.client_id
      and c.workspace_id = client_medical_records.workspace_id
      and (
        c.user_id = (select auth.uid())
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = client_medical_records.workspace_id
            and wm.user_id = (select auth.uid())
            and wm.role::text like 'pt_%'
        )
      )
  )
);

drop policy if exists exercises_delete_pt on public.exercises;
create policy exercises_delete_pt
on public.exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where w.owner_user_id = exercises.owner_user_id
      and wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
  )
);

drop policy if exists exercises_insert_pt on public.exercises;
create policy exercises_insert_pt
on public.exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where w.owner_user_id = exercises.owner_user_id
      and wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
  )
);

drop policy if exists exercises_select_access on public.exercises;
create policy exercises_select_access
on public.exercises
for select
to authenticated
using (
  exists (
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

drop policy if exists exercises_update_pt on public.exercises;
create policy exercises_update_pt
on public.exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where w.owner_user_id = exercises.owner_user_id
      and wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where w.owner_user_id = exercises.owner_user_id
      and wm.user_id = (select auth.uid())
      and wm.role::text like 'pt_%'
  )
);

drop policy if exists pt_profiles_insert_own on public.pt_profiles;
drop policy if exists pt_profiles_select_own on public.pt_profiles;
drop policy if exists pt_profiles_update_own on public.pt_profiles;
drop policy if exists pt_profiles_self_access on public.pt_profiles;

create policy pt_profiles_self_access
on public.pt_profiles
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
