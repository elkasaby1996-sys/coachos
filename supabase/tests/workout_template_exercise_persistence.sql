begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
values
  ('00000000-0000-4000-8000-000000000701', 'authenticated', 'authenticated', 'wte-owner@example.test', 'x', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000702', 'authenticated', 'authenticated', 'wte-coach@example.test', 'x', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000703', 'authenticated', 'authenticated', 'wte-viewer@example.test', 'x', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000704', 'authenticated', 'authenticated', 'wte-client@example.test', 'x', now(), now(), now());

insert into public.workspaces (id, name, owner_user_id, slug)
values (
  '00000000-0000-4000-8000-000000000710',
  'PR-EXLIB-07B Workspace',
  '00000000-0000-4000-8000-000000000701',
  'pr-exlib-07b-workspace'
);

insert into public.workspace_members (workspace_id, user_id, role, status)
values
  ('00000000-0000-4000-8000-000000000710', '00000000-0000-4000-8000-000000000702', 'pt_coach', 'active'),
  ('00000000-0000-4000-8000-000000000710', '00000000-0000-4000-8000-000000000703', 'viewer', 'active');

insert into public.exercises (id, owner_user_id, workspace_id, name, source)
values
  ('00000000-0000-4000-8000-000000000720', '00000000-0000-4000-8000-000000000701', null, 'PR-EXLIB-07B Press', 'manual'),
  ('00000000-0000-4000-8000-000000000721', '00000000-0000-4000-8000-000000000701', null, 'PR-EXLIB-07B Row', 'manual');

insert into public.workout_templates (id, workspace_id, name)
values
  ('00000000-0000-4000-8000-000000000730', '00000000-0000-4000-8000-000000000710', 'PR-EXLIB-07B Unassigned'),
  ('00000000-0000-4000-8000-000000000731', '00000000-0000-4000-8000-000000000710', 'PR-EXLIB-07B Protected');

insert into public.workout_template_exercises (
  id,
  workout_template_id,
  exercise_id,
  sort_order
)
values
  ('00000000-0000-4000-8000-000000000740', '00000000-0000-4000-8000-000000000730', '00000000-0000-4000-8000-000000000720', 10),
  ('00000000-0000-4000-8000-000000000741', '00000000-0000-4000-8000-000000000730', '00000000-0000-4000-8000-000000000721', 20),
  ('00000000-0000-4000-8000-000000000742', '00000000-0000-4000-8000-000000000731', '00000000-0000-4000-8000-000000000720', 10);

insert into public.clients (
  id,
  workspace_id,
  user_id,
  status,
  relationship_status,
  email,
  display_name
)
values (
  '00000000-0000-4000-8000-000000000750',
  '00000000-0000-4000-8000-000000000710',
  '00000000-0000-4000-8000-000000000704',
  'active',
  'active',
  'wte-client@example.test',
  'PR-EXLIB-07B Client'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000701', true);

insert into public.assigned_workouts (
  id,
  client_id,
  workout_template_id,
  scheduled_date,
  status
)
values (
  '00000000-0000-4000-8000-000000000760',
  '00000000-0000-4000-8000-000000000750',
  '00000000-0000-4000-8000-000000000731',
  current_date,
  'planned'
);

set local role authenticated;

select ok(
  public.can_manage_workspace_delivery('00000000-0000-4000-8000-000000000710'),
  'PT owner has delivery-management permission'
);

select results_eq(
  $$
    update public.workout_template_exercises
    set sets = 4,
        reps = '8-10',
        rest_seconds = 90,
        tempo = '3-1-1',
        rpe = 8.5,
        video_url = 'https://example.test/demo',
        notes = 'Owner persisted note',
        superset_group = 'A',
        sort_order = 30
    where id = '00000000-0000-4000-8000-000000000740'
    returning id
  $$,
  $$ values ('00000000-0000-4000-8000-000000000740'::uuid) $$,
  'PT owner update returns the intended WTE row'
);

select is((select sets from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000740'), 4, 'sets persists');
select is((select reps from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000740'), '8-10', 'reps persists');
select is((select rest_seconds from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000740'), 90, 'rest persists');
select is((select tempo from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000740'), '3-1-1', 'tempo persists');
select is((select rpe from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000740'), 8.5::numeric, 'RPE persists');
select is((select video_url from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000740'), 'https://example.test/demo', 'video URL persists');
select is((select notes from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000740'), 'Owner persisted note', 'notes persists');
select is((select superset_group from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000740'), 'A', 'superset group persists');
select is((select sort_order from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000740'), 30, 'sort order persists');
select is((select exercise_id from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000740'), '00000000-0000-4000-8000-000000000720'::uuid, 'prescription update leaves exercise_id unchanged');

select results_eq(
  $$
    update public.workout_template_exercises
    set reps = null,
        rest_seconds = null,
        tempo = null,
        rpe = null,
        video_url = null,
        notes = null,
        superset_group = null
    where id = '00000000-0000-4000-8000-000000000740'
    returning id
  $$,
  $$ values ('00000000-0000-4000-8000-000000000740'::uuid) $$,
  'nullable clearing returns the intended WTE row'
);

select ok(
  (
    select reps is null
      and rest_seconds is null
      and tempo is null
      and rpe is null
      and video_url is null
      and notes is null
      and superset_group is null
    from public.workout_template_exercises
    where id = '00000000-0000-4000-8000-000000000740'
  ),
  'nullable fields remain cleared on readback'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000702', true);
set local role authenticated;

select ok(
  public.can_manage_workspace_delivery('00000000-0000-4000-8000-000000000710'),
  'authorized PT coach has delivery-management permission'
);

select results_eq(
  $$
    update public.workout_template_exercises
    set notes = 'Coach persisted note',
        sort_order = 10,
        superset_group = 'B',
        rest_seconds = 0
    where id = '00000000-0000-4000-8000-000000000741'
    returning id
  $$,
  $$ values ('00000000-0000-4000-8000-000000000741'::uuid) $$,
  'authorized PT coach update returns the intended WTE row'
);

select is((select notes from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000741'), 'Coach persisted note', 'coach notes persist on readback');
select is((select sort_order from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000741'), 10, 'coach sort order persists on readback');
select is((select superset_group from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000741'), 'B', 'coach superset group persists on readback');

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000703', true);
set local role authenticated;

select isnt(
  public.can_manage_workspace_delivery('00000000-0000-4000-8000-000000000710'),
  true,
  'viewer does not have delivery-management permission'
);

select is_empty(
  $$
    update public.workout_template_exercises
    set notes = 'Viewer must not persist'
    where id = '00000000-0000-4000-8000-000000000741'
    returning id
  $$,
  'unauthorized viewer update returns zero rows'
);

select is((select notes from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000741'), 'Coach persisted note', 'unauthorized update leaves the stored row unchanged');

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000701', true);
set local role authenticated;

select throws_ok(
  $$
    update public.workout_template_exercises
    set notes = 'Protected update'
    where id = '00000000-0000-4000-8000-000000000742'
  $$,
  'P0001',
  'This template is already assigned to a client and cannot be deleted. Existing client assignments prevent deletion. Historical records are preserved.',
  'active-delivery protection still rejects WTE updates'
);

select is((select notes from public.workout_template_exercises where id = '00000000-0000-4000-8000-000000000742'), null, 'protected WTE remains unchanged');

reset role;
select * from finish();

rollback;
