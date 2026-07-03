-- PR-04.6C: active client check-in forms need realtime notification when a
-- coach changes the assigned template or its questions.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'checkin_templates'
  ) then
    alter publication supabase_realtime add table public.checkin_templates;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'checkin_questions'
  ) then
    alter publication supabase_realtime add table public.checkin_questions;
  end if;
end $$;
