-- PR-04.6A2: clients need read access to their own workspace check-in
-- template/question definitions so persisted check-in assignment settings can
-- resolve on /app/checkin. Workspace member library access remains unchanged.

drop policy if exists checkin_templates_select_access on public.checkin_templates;
create policy checkin_templates_select_access
on public.checkin_templates
for select
to authenticated
using (
  public.can_access_workspace(workspace_id)
  or exists (
    select 1
    from public.clients c
    where c.workspace_id = checkin_templates.workspace_id
      and c.user_id = (select auth.uid())
  )
);

drop policy if exists checkin_questions_select_access on public.checkin_questions;
create policy checkin_questions_select_access
on public.checkin_questions
for select
to authenticated
using (
  exists (
    select 1
    from public.checkin_templates ct
    where ct.id = checkin_questions.template_id
      and (
        public.can_access_workspace(ct.workspace_id)
        or exists (
          select 1
          from public.clients c
          where c.workspace_id = ct.workspace_id
            and c.user_id = (select auth.uid())
        )
      )
  )
);
