-- Recommended safe cleanup:
-- 1) Add primary keys to archive tables that currently have unique non-null ids.
-- 2) Drop strictly redundant non-unique indexes where an equivalent unique index exists.

-- Ensure archive id columns are non-null before promoting to primary keys.
alter table public._archive_workout_log_items
  alter column id set not null;

alter table public._archive_workout_template_items
  alter column id set not null;

-- Add PK constraints only if missing.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = '_archive_workout_log_items'
      and c.contype = 'p'
  ) then
    alter table public._archive_workout_log_items
      add constraint _archive_workout_log_items_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = '_archive_workout_template_items'
      and c.contype = 'p'
  ) then
    alter table public._archive_workout_template_items
      add constraint _archive_workout_template_items_pkey primary key (id);
  end if;
end $$;

-- Drop redundant duplicate indexes (equivalent unique index already exists).
drop index if exists public.client_macro_targets_client_id_idx;
drop index if exists public.nutrition_day_logs_client_id_log_date_idx;
drop index if exists public.idx_workout_sessions_assigned_workout_id;