create table public.support_requests (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  workspace_name text not null default '' check (char_length(workspace_name) <= 160),
  topic text not null check (topic in ('account', 'billing', 'technical', 'other')),
  message text not null check (char_length(message) between 20 and 5000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

create index support_requests_status_created_idx on public.support_requests (status, created_at);
alter table public.support_requests enable row level security;
revoke all on public.support_requests from public, anon, authenticated;
grant select, insert, update, delete on public.support_requests to service_role;

-- Public support must work for people who cannot sign in. Only this bounded
-- submission API is exposed; requests are readable only by the service role.
create function public.submit_support_request(
  p_request_id uuid,
  p_name text,
  p_email text,
  p_workspace_name text,
  p_topic text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_workspace text := btrim(coalesce(p_workspace_name, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_existing public.support_requests;
begin
  if p_request_id is null
     or char_length(v_name) not between 1 and 120
     or char_length(v_email) > 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or char_length(v_workspace) > 160
     or coalesce(p_topic, '') not in ('account', 'billing', 'technical', 'other')
     or char_length(v_message) not between 20 and 5000 then
    raise exception 'Please check the form details and try again.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('support-request:' || p_request_id::text, 0));
  select * into v_existing from public.support_requests where id = p_request_id;
  if found then
    if v_existing.email = v_email and v_existing.name = v_name
       and v_existing.workspace_name = v_workspace and v_existing.topic = p_topic
       and v_existing.message = v_message
       and v_existing.user_id is not distinct from auth.uid() then
      return p_request_id;
    end if;
    raise exception 'Please start a new support request.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('support-email:' || v_email, 0));
  if auth.uid() is not null then
    perform pg_advisory_xact_lock(hashtextextended('support-user:' || auth.uid()::text, 0));
  end if;
  perform public.enforce_rate_limit(
    'support-request', 5, 3600, auth.uid(), public.hash_rate_limit_key(v_email), null,
    'Too many support requests. Please try again in an hour.'
  );

  insert into public.support_requests (id, user_id, name, email, workspace_name, topic, message)
  values (p_request_id, auth.uid(), v_name, v_email, v_workspace, p_topic, v_message);
  return p_request_id;
end;
$$;

revoke all on function public.submit_support_request(uuid, text, text, text, text, text) from public;
grant execute on function public.submit_support_request(uuid, text, text, text, text, text) to anon, authenticated;
