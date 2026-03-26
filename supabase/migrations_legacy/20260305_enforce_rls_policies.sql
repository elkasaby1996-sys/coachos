-- Enforce RLS baseline for every public base table.
-- Policy strategy:
-- 1) trainer_isolation: trainer_id/auth.uid() where available (fallback deny-all).
-- 2) client_read_own: client_id/auth.uid() where available (fallback deny-all).

do $$
declare
  t record;
  has_trainer_id boolean;
  has_client_id boolean;
  has_user_id boolean;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not like 'pg_%'
      and tablename not like 'sql_%'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);

    execute format('drop policy if exists trainer_isolation on public.%I', t.tablename);
    execute format('drop policy if exists client_read_own on public.%I', t.tablename);

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = t.tablename
        and column_name = 'trainer_id'
    ) into has_trainer_id;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = t.tablename
        and column_name = 'client_id'
    ) into has_client_id;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = t.tablename
        and column_name = 'user_id'
    ) into has_user_id;

    if has_trainer_id then
      execute format(
        'create policy trainer_isolation on public.%I for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid())',
        t.tablename
      );
    elsif has_user_id then
      execute format(
        'create policy trainer_isolation on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
        t.tablename
      );
    else
      execute format(
        'create policy trainer_isolation on public.%I for all using (false) with check (false)',
        t.tablename
      );
    end if;

    if has_client_id then
      execute format(
        'create policy client_read_own on public.%I for select using (client_id = auth.uid())',
        t.tablename
      );
    elsif has_user_id then
      execute format(
        'create policy client_read_own on public.%I for select using (user_id = auth.uid())',
        t.tablename
      );
    else
      execute format(
        'create policy client_read_own on public.%I for select using (false)',
        t.tablename
      );
    end if;
  end loop;
end
$$;
