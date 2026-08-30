alter table public.exercises
  add column if not exists body_region_keys text[] not null default '{}'::text[],
  add column if not exists primary_muscle_keys text[] not null default '{}'::text[],
  add column if not exists secondary_muscle_keys text[] not null default '{}'::text[],
  add column if not exists muscle_taxonomy_version smallint not null default 1;

comment on column public.exercises.body_region_keys is
  'RepSync canonical body-region keys. Legacy display fields remain unchanged for compatibility.';
comment on column public.exercises.primary_muscle_keys is
  'RepSync canonical primary-muscle keys. Empty means unknown or intentionally unmapped.';
comment on column public.exercises.secondary_muscle_keys is
  'RepSync canonical secondary-muscle keys. Values must not overlap primary_muscle_keys.';
comment on column public.exercises.muscle_taxonomy_version is
  'Version of the RepSync canonical muscle taxonomy used by the canonical arrays.';

alter table public.exercises
  add constraint exercises_body_region_keys_canonical_check check (
    array_position(body_region_keys, null) is null
    and body_region_keys <@ array[
      'chest',
      'shoulders',
      'arms',
      'forearms',
      'core',
      'back',
      'hips_glutes',
      'upper_legs',
      'lower_legs',
      'full_body'
    ]::text[]
  ),
  add constraint exercises_primary_muscle_keys_canonical_check check (
    array_position(primary_muscle_keys, null) is null
    and primary_muscle_keys <@ array[
      'pectorals',
      'anterior_deltoids',
      'lateral_deltoids',
      'posterior_deltoids',
      'biceps',
      'triceps',
      'forearms',
      'rectus_abdominis',
      'obliques',
      'hip_flexors',
      'trapezius',
      'latissimus_dorsi',
      'rhomboids',
      'spinal_erectors',
      'gluteals',
      'hip_abductors',
      'quadriceps',
      'hamstrings',
      'adductors',
      'calves',
      'tibialis_anterior'
    ]::text[]
  ),
  add constraint exercises_secondary_muscle_keys_canonical_check check (
    array_position(secondary_muscle_keys, null) is null
    and secondary_muscle_keys <@ array[
      'pectorals',
      'anterior_deltoids',
      'lateral_deltoids',
      'posterior_deltoids',
      'biceps',
      'triceps',
      'forearms',
      'rectus_abdominis',
      'obliques',
      'hip_flexors',
      'trapezius',
      'latissimus_dorsi',
      'rhomboids',
      'spinal_erectors',
      'gluteals',
      'hip_abductors',
      'quadriceps',
      'hamstrings',
      'adductors',
      'calves',
      'tibialis_anterior'
    ]::text[]
  ),
  add constraint exercises_primary_secondary_muscle_keys_disjoint_check check (
    not (primary_muscle_keys && secondary_muscle_keys)
  );

-- PostgreSQL can combine the existing owner_user_id B-tree index with these
-- GIN indexes using a bitmap-AND for owner-scoped canonical filtering.
create index if not exists exercises_body_region_keys_gin_idx
  on public.exercises using gin (body_region_keys);

create index if not exists exercises_primary_muscle_keys_gin_idx
  on public.exercises using gin (primary_muscle_keys);

create index if not exists exercises_secondary_muscle_keys_gin_idx
  on public.exercises using gin (secondary_muscle_keys);

create or replace function public.exercise_canonical_muscle_key(input_text text)
returns text
language sql
immutable
parallel safe
as $$
  select case lower(
    regexp_replace(
      regexp_replace(btrim(coalesce(input_text, '')), '[_-]+', ' ', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    )
  )
    when 'chest' then 'pectorals'
    when 'pectorals' then 'pectorals'
    when 'pectoralis major' then 'pectorals'
    when 'pectoralis minor' then 'pectorals'
    when 'anterior deltoid' then 'anterior_deltoids'
    when 'anterior deltoids' then 'anterior_deltoids'
    when 'lateral deltoid' then 'lateral_deltoids'
    when 'lateral deltoids' then 'lateral_deltoids'
    when 'posterior deltoid' then 'posterior_deltoids'
    when 'posterior deltoids' then 'posterior_deltoids'
    when 'biceps' then 'biceps'
    when 'biceps brachii' then 'biceps'
    when 'brachialis' then 'biceps'
    when 'triceps' then 'triceps'
    when 'triceps brachii' then 'triceps'
    when 'forearms' then 'forearms'
    when 'lower arms' then 'forearms'
    when 'brachioradialis' then 'forearms'
    when 'abs' then 'rectus_abdominis'
    when 'abdominals' then 'rectus_abdominis'
    when 'rectus abdominis' then 'rectus_abdominis'
    when 'obliques' then 'obliques'
    when 'iliopsoas' then 'hip_flexors'
    when 'hip flexors' then 'hip_flexors'
    when 'traps' then 'trapezius'
    when 'trapezius' then 'trapezius'
    when 'trapezius upper fibers' then 'trapezius'
    when 'trapezius middle fibers' then 'trapezius'
    when 'trapezius lower fibers' then 'trapezius'
    when 'lats' then 'latissimus_dorsi'
    when 'latissimus dorsi' then 'latissimus_dorsi'
    when 'rhomboids' then 'rhomboids'
    when 'erector spinae' then 'spinal_erectors'
    when 'spinal erectors' then 'spinal_erectors'
    when 'lower back' then 'spinal_erectors'
    when 'glutes' then 'gluteals'
    when 'gluteals' then 'gluteals'
    when 'gluteus maximus' then 'gluteals'
    when 'gluteus medius' then 'gluteals'
    when 'gluteus minimus' then 'gluteals'
    when 'hip abductors' then 'hip_abductors'
    when 'tensor fasciae latae' then 'hip_abductors'
    when 'quadriceps' then 'quadriceps'
    when 'quads' then 'quadriceps'
    when 'rectus femoris' then 'quadriceps'
    when 'vastus intermedius' then 'quadriceps'
    when 'vastus lateralis' then 'quadriceps'
    when 'vastus medialis' then 'quadriceps'
    when 'hamstrings' then 'hamstrings'
    when 'adductors' then 'adductors'
    when 'adductor brevis' then 'adductors'
    when 'adductor longus' then 'adductors'
    when 'adductor magnus' then 'adductors'
    when 'calves' then 'calves'
    when 'gastrocnemius' then 'calves'
    when 'soleus' then 'calves'
    when 'tibialis anterior' then 'tibialis_anterior'
    else null
  end;
$$;

create or replace function public.exercise_canonical_body_region_key(input_text text)
returns text
language sql
immutable
parallel safe
as $$
  select case lower(
    regexp_replace(
      regexp_replace(btrim(coalesce(input_text, '')), '[_-]+', ' ', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    )
  )
    when 'chest' then 'chest'
    when 'pectorals' then 'chest'
    when 'pectoralis major' then 'chest'
    when 'pectoralis minor' then 'chest'
    when 'shoulders' then 'shoulders'
    when 'deltoid' then 'shoulders'
    when 'deltoids' then 'shoulders'
    when 'anterior deltoid' then 'shoulders'
    when 'lateral deltoid' then 'shoulders'
    when 'posterior deltoid' then 'shoulders'
    when 'arms' then 'arms'
    when 'upper arms' then 'arms'
    when 'biceps' then 'arms'
    when 'biceps brachii' then 'arms'
    when 'brachialis' then 'arms'
    when 'triceps' then 'arms'
    when 'triceps brachii' then 'arms'
    when 'forearms' then 'forearms'
    when 'lower arms' then 'forearms'
    when 'brachioradialis' then 'forearms'
    when 'core' then 'core'
    when 'abs' then 'core'
    when 'abdominals' then 'core'
    when 'rectus abdominis' then 'core'
    when 'obliques' then 'core'
    when 'waist' then 'core'
    when 'back' then 'back'
    when 'upper back' then 'back'
    when 'lower back' then 'back'
    when 'lats' then 'back'
    when 'latissimus dorsi' then 'back'
    when 'traps' then 'back'
    when 'trapezius' then 'back'
    when 'trapezius upper fibers' then 'back'
    when 'trapezius middle fibers' then 'back'
    when 'trapezius lower fibers' then 'back'
    when 'rhomboids' then 'back'
    when 'erector spinae' then 'back'
    when 'spinal erectors' then 'back'
    when 'hips' then 'hips_glutes'
    when 'hip flexors' then 'hips_glutes'
    when 'iliopsoas' then 'hips_glutes'
    when 'glutes' then 'hips_glutes'
    when 'gluteals' then 'hips_glutes'
    when 'gluteus maximus' then 'hips_glutes'
    when 'gluteus medius' then 'hips_glutes'
    when 'gluteus minimus' then 'hips_glutes'
    when 'hip abductors' then 'hips_glutes'
    when 'tensor fasciae latae' then 'hips_glutes'
    when 'quadriceps' then 'upper_legs'
    when 'quads' then 'upper_legs'
    when 'rectus femoris' then 'upper_legs'
    when 'vastus intermedius' then 'upper_legs'
    when 'vastus lateralis' then 'upper_legs'
    when 'vastus medialis' then 'upper_legs'
    when 'hamstrings' then 'upper_legs'
    when 'adductors' then 'upper_legs'
    when 'adductor brevis' then 'upper_legs'
    when 'adductor longus' then 'upper_legs'
    when 'adductor magnus' then 'upper_legs'
    when 'thighs' then 'upper_legs'
    when 'upper legs' then 'upper_legs'
    when 'calves' then 'lower_legs'
    when 'gastrocnemius' then 'lower_legs'
    when 'soleus' then 'lower_legs'
    when 'tibialis anterior' then 'lower_legs'
    when 'lower legs' then 'lower_legs'
    -- Do not backfill legacy Full Body: the current provider historically
    -- collapsed Cardio into that display label, so anatomical intent is unknown.
    else null
  end;
$$;

create or replace function public.exercise_canonical_region_for_muscle_key(input_key text)
returns text
language sql
immutable
parallel safe
as $$
  select case input_key
    when 'pectorals' then 'chest'
    when 'anterior_deltoids' then 'shoulders'
    when 'lateral_deltoids' then 'shoulders'
    when 'posterior_deltoids' then 'shoulders'
    when 'biceps' then 'arms'
    when 'triceps' then 'arms'
    when 'forearms' then 'forearms'
    when 'rectus_abdominis' then 'core'
    when 'obliques' then 'core'
    when 'hip_flexors' then 'hips_glutes'
    when 'trapezius' then 'back'
    when 'latissimus_dorsi' then 'back'
    when 'rhomboids' then 'back'
    when 'spinal_erectors' then 'back'
    when 'gluteals' then 'hips_glutes'
    when 'hip_abductors' then 'hips_glutes'
    when 'quadriceps' then 'upper_legs'
    when 'hamstrings' then 'upper_legs'
    when 'adductors' then 'upper_legs'
    when 'calves' then 'lower_legs'
    when 'tibialis_anterior' then 'lower_legs'
    else null
  end;
$$;

with mapped_muscles as (
  select
    e.id,
    array(
      select distinct muscle_key
      from (values (public.exercise_canonical_muscle_key(e.primary_muscle))) as primary_values(muscle_key)
      where muscle_key is not null
      order by muscle_key
    ) as primary_keys,
    array(
      select distinct public.exercise_canonical_muscle_key(legacy_label) as muscle_key
      from unnest(coalesce(e.secondary_muscles, '{}'::text[])) as legacy_labels(legacy_label)
      where public.exercise_canonical_muscle_key(legacy_label) is not null
      order by muscle_key
    ) as raw_secondary_keys,
    e.muscle_group,
    e.primary_muscle,
    e.secondary_muscles,
    e.category
  from public.exercises e
),
canonical_values as (
  select
    mapped.id,
    mapped.primary_keys,
    array(
      select secondary_key
      from unnest(mapped.raw_secondary_keys) as secondary_keys(secondary_key)
      where not (secondary_key = any(mapped.primary_keys))
      order by secondary_key
    ) as secondary_keys,
    array(
      select distinct region_key
      from (
        values
          (public.exercise_canonical_body_region_key(mapped.muscle_group)),
          (public.exercise_canonical_body_region_key(mapped.primary_muscle)),
          (public.exercise_canonical_body_region_key(mapped.category))
        union all
        select public.exercise_canonical_body_region_key(legacy_label)
        from unnest(coalesce(mapped.secondary_muscles, '{}'::text[])) as legacy_labels(legacy_label)
        union all
        select public.exercise_canonical_region_for_muscle_key(muscle_key)
        from unnest(mapped.primary_keys || mapped.raw_secondary_keys) as muscle_keys(muscle_key)
      ) as candidate_regions(region_key)
      where region_key is not null
      order by region_key
    ) as body_region_keys
  from mapped_muscles mapped
)
update public.exercises e
set
  body_region_keys = case
    when cardinality(e.body_region_keys) = 0 then mapped.body_region_keys
    else e.body_region_keys
  end,
  primary_muscle_keys = case
    when cardinality(e.primary_muscle_keys) = 0 then mapped.primary_keys
    else e.primary_muscle_keys
  end,
  secondary_muscle_keys = case
    when cardinality(e.secondary_muscle_keys) = 0 then mapped.secondary_keys
    else e.secondary_muscle_keys
  end
from canonical_values mapped
where mapped.id = e.id;
