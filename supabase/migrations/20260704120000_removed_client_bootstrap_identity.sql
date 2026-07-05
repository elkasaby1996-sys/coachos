-- PR-05.3B: removed client rows must remain readable to their owner so auth
-- bootstrap preserves client identity/account onboarding. Active workspace
-- access remains guarded by relationship_status = 'active' helpers.

drop policy if exists clients_select_access on public.clients;
create policy clients_select_access
on public.clients
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.can_access_client(id, 'clients.view')
);
