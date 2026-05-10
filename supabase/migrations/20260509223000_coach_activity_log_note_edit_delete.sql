drop policy if exists coach_activity_log_pt_note_update_own on public.coach_activity_log;
create policy coach_activity_log_pt_note_update_own
on public.coach_activity_log
for update
to authenticated
using (
  action = 'pt_note'
  and actor_user_id = (select auth.uid())
  and public.can_access_workspace(workspace_id)
)
with check (
  action = 'pt_note'
  and actor_user_id = (select auth.uid())
  and public.can_access_workspace(workspace_id)
);

drop policy if exists coach_activity_log_pt_note_delete_own on public.coach_activity_log;
create policy coach_activity_log_pt_note_delete_own
on public.coach_activity_log
for delete
to authenticated
using (
  action = 'pt_note'
  and actor_user_id = (select auth.uid())
  and public.can_access_workspace(workspace_id)
);
