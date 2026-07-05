-- PR-05.3 transfer compatibility: keep archive semantics extensible for
-- PR-05.5 without implementing transfer behavior yet.

alter table public.clients
  drop constraint if exists clients_relationship_status_check;

alter table public.clients
  add constraint clients_relationship_status_check
  check (relationship_status in ('active', 'removed', 'transferred_out'));
