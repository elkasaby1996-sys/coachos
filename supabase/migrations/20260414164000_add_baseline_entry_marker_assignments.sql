create table if not exists public.baseline_entry_marker_templates (
  baseline_id uuid not null references public.baseline_entries(id) on delete cascade,
  template_id uuid not null references public.baseline_marker_templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint baseline_entry_marker_templates_pkey primary key (baseline_id, template_id)
);

create index if not exists baseline_entry_marker_templates_template_id_idx
  on public.baseline_entry_marker_templates(template_id);

create or replace function public.validate_baseline_entry_marker_template_match()
returns trigger
language plpgsql
as $$
declare
  v_baseline_workspace_id uuid;
  v_template_workspace_id uuid;
begin
  select workspace_id
  into v_baseline_workspace_id
  from public.baseline_entries
  where id = new.baseline_id;

  select workspace_id
  into v_template_workspace_id
  from public.baseline_marker_templates
  where id = new.template_id;

  if v_baseline_workspace_id is null or v_template_workspace_id is null then
    raise exception 'Baseline marker assignment is missing a valid baseline or marker template.';
  end if;

  if v_baseline_workspace_id <> v_template_workspace_id then
    raise exception 'Baseline marker assignments must stay inside the same workspace.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_baseline_entry_marker_template_match
  on public.baseline_entry_marker_templates;

create trigger validate_baseline_entry_marker_template_match
before insert or update on public.baseline_entry_marker_templates
for each row
execute function public.validate_baseline_entry_marker_template_match();

alter table public.baseline_entry_marker_templates enable row level security;
alter table only public.baseline_entry_marker_templates force row level security;

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
      and c.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.baseline_entries be
    join public.workspace_members wm on wm.workspace_id = be.workspace_id
    where be.id = baseline_entry_marker_templates.baseline_id
      and wm.user_id = auth.uid()
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
      and wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
  )
);

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
      and wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
  )
);

grant all on table public.baseline_entry_marker_templates to authenticated;
grant all on table public.baseline_entry_marker_templates to service_role;
