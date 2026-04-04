create or replace function public.normalize_exercise_library_label(input_text text)
returns text
language sql
immutable
as $$
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
$$;

update public.exercises
set
  muscle_group = public.normalize_exercise_library_label(muscle_group),
  primary_muscle = public.normalize_exercise_library_label(primary_muscle),
  secondary_muscles = case
    when secondary_muscles is null then null
    else array(
      select distinct normalized_value
      from (
        select public.normalize_exercise_library_label(value) as normalized_value
        from unnest(secondary_muscles) as value
      ) normalized
      where normalized_value is not null
    )
  end,
  tags = case
    when coalesce(array_length(tags, 1), 0) = 0 then tags
    else array(
      select distinct normalized_value
      from (
        select public.normalize_exercise_library_label(value) as normalized_value
        from unnest(tags) as value
      ) normalized
      where normalized_value is not null
    )
  end
where source = 'exercise_dataset';
