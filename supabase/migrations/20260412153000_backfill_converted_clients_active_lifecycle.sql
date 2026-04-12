-- Normalize previously converted lead clients into active lifecycle state.
-- This keeps transferred/converted clients visible in workspace client lists.

update public.clients c
set
  status = 'active',
  lifecycle_state = 'active',
  lifecycle_changed_at = now(),
  paused_reason = null,
  churn_reason = null
from public.pt_hub_leads l
where l.status = 'converted'
  and l.converted_client_id = c.id
  and c.lifecycle_state is distinct from 'active';

