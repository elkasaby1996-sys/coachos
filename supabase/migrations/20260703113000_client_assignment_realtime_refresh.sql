-- PR-04.5C: publish client assignment tables for scoped realtime refresh.
-- RLS remains the access boundary; client code subscribes with client_id/id filters.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'assigned_workouts'
  ) then
    alter publication supabase_realtime add table public.assigned_workouts;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'assigned_nutrition_plans'
  ) then
    alter publication supabase_realtime add table public.assigned_nutrition_plans;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'assigned_nutrition_days'
  ) then
    alter publication supabase_realtime add table public.assigned_nutrition_days;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'checkins'
  ) then
    alter publication supabase_realtime add table public.checkins;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'clients'
  ) then
    alter publication supabase_realtime add table public.clients;
  end if;
end $$;
