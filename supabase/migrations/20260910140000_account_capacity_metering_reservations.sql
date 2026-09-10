-- PR-PRICE-03: derived metering and unused admission primitives. No domain enforcement.
begin;

create table public.account_capacity_reservations (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete restrict,
  dimension text not null check (dimension in ('counted_clients','coach_seats','active_workspaces','published_packages')),
  quantity integer not null check (quantity > 0),
  status text not null default 'active' check (status in ('active','consumed','released','expired')),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  subject_type text not null check (btrim(subject_type) <> ''),
  subject_key text not null check (btrim(subject_key) <> ''),
  workspace_id uuid references public.workspaces(id) on delete restrict,
  source text not null check (btrim(source) <> ''),
  created_by_user_id uuid references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  released_at timestamptz,
  expired_at timestamptz,
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  unique (billing_account_id,dimension,idempotency_key),
  check (expires_at > created_at),
  check (
    (status = 'active' and consumed_at is null and released_at is null and expired_at is null) or
    (status = 'consumed' and consumed_at is not null and released_at is null and expired_at is null) or
    (status = 'released' and released_at is not null and consumed_at is null and expired_at is null) or
    (status = 'expired' and expired_at is not null and consumed_at is null and released_at is null)
  )
);
create index account_capacity_active_idx on public.account_capacity_reservations(billing_account_id,dimension,expires_at) where status = 'active';
create index account_capacity_subject_idx on public.account_capacity_reservations(billing_account_id,dimension,subject_key);
create index account_capacity_expiry_idx on public.account_capacity_reservations(status,expires_at);

create table public.account_capacity_events (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete restrict,
  reservation_id uuid references public.account_capacity_reservations(id) on delete restrict,
  dimension text not null check (dimension in ('counted_clients','coach_seats','active_workspaces','published_packages')),
  event_type text not null check (btrim(event_type) <> ''),
  quantity integer not null check (quantity > 0),
  actor_user_id uuid references auth.users(id) on delete restrict,
  source text not null check (btrim(source) <> ''),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default transaction_timestamp()
);
-- Denials have no reservation row, but repeated admission attempts retain one result.
create unique index account_capacity_denied_key_idx on public.account_capacity_events(billing_account_id,dimension,(metadata->>'idempotencyHash')) where event_type = 'capacity.reservation_denied';

create function public.protect_account_capacity_history()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' or tg_table_name = 'account_capacity_events' then
    raise exception 'Capacity history is append-only.';
  end if;
  if old.status <> 'active' or (to_jsonb(new) - array['status','consumed_at','released_at','expired_at','updated_at'])
    is distinct from (to_jsonb(old) - array['status','consumed_at','released_at','expired_at','updated_at']) then
    raise exception 'Reservation identity and terminal history are immutable.';
  end if;
  return new;
end;
$$;
create trigger protect_account_capacity_reservations before update or delete on public.account_capacity_reservations for each row execute function public.protect_account_capacity_history();
create trigger account_capacity_updated_at before update on public.account_capacity_reservations for each row execute function public.set_updated_at();
create trigger protect_account_capacity_events before update or delete on public.account_capacity_events for each row execute function public.protect_account_capacity_history();

-- Internal identities never leave owner RPCs. Emails are only used for matching;
-- stored reservation subjects accept SHA-256 hashes, never raw addresses.
create function public.account_capacity_email_key(p_email text)
returns text language sql immutable set search_path = pg_catalog, public, extensions
as $$ select 'email:' || encode(extensions.digest(lower(btrim(p_email)), 'sha256'),'hex'); $$;

create function public.account_capacity_subject_key(p_dimension text,p_key text)
returns text language sql stable security definer set search_path = pg_catalog, public
as $$
  select coalesce(
    (select 'user:' || u.id from auth.users u where left(p_key,6)='email:' and p_dimension in ('counted_clients','coach_seats') and public.account_capacity_email_key(u.email) = p_key order by u.id limit 1),
    (select 'user:' || c.user_id from public.clients c where left(p_key,7)='client:' and p_dimension = 'counted_clients' and c.id = substring(p_key from 8)::uuid and c.user_id is not null),
    p_key);
$$;

create function public.account_capacity_subjects(p_owner uuid,p_at timestamptz)
returns table(dimension text,subject_key text,pending boolean,data_quality_issue boolean)
language sql stable security definer set search_path = pg_catalog, public
as $$
  with owned as (select id from public.workspaces where owner_user_id = p_owner),
  staff as (
    select p_owner as user_id
    union select m.user_id from public.workspace_members m join owned w on w.id=m.workspace_id
      where m.status='active' and m.role::text in ('owner','admin','coach','assistant_coach','viewer','pt_owner','pt_coach','pt')
  )
  select 'counted_clients',coalesce('user:' || c.user_id,'client:' || c.id),false,
    c.lifecycle_state is null or c.lifecycle_state not in ('invited','onboarding','active','paused','completed','churned')
  from public.clients c join owned w on w.id=c.workspace_id
  where coalesce(c.relationship_status,'active')='active'
    and (c.lifecycle_state is null or c.lifecycle_state not in ('completed','churned'))
  union all select 'coach_seats','user:' || s.user_id,false,false from staff s where s.user_id is not null
  union all
  select 'coach_seats',coalesce((select 'user:' || u.id from auth.users u where lower(btrim(u.email))=lower(btrim(i.email)) order by u.id limit 1),public.account_capacity_email_key(i.email)),true,false
  from public.workspace_member_invites i join owned w on w.id=i.workspace_id
  where i.status='pending' and i.expires_at > p_at and i.accepted_at is null and i.accepted_by_user_id is null
    and btrim(i.email) <> '' and position('@' in i.email) > 1
    and not exists(select 1 from staff s join auth.users u on u.id=s.user_id where lower(btrim(u.email))=lower(btrim(i.email)))
  union all select 'active_workspaces','workspace:' || id,false,false from owned
  union all select 'published_packages','package:' || id,false,false from public.pt_packages
    where pt_user_id=p_owner and status='active' and is_public=true;
$$;

create function public.account_capacity_dimension(p_key text,p_actual bigint,p_pending bigint,p_reserved bigint,p_limit integer,p_available boolean,p_quality boolean,p_included integer default null)
returns jsonb language plpgsql immutable set search_path = pg_catalog, public
as $$
declare c bigint := p_actual+p_pending+p_reserved; s text; result jsonb;
begin
  s := case when not p_available then 'unavailable' when p_limit is null then 'unlimited'
    when c > p_limit then 'over_limit' when c = p_limit then 'at_limit'
    when c::numeric >= p_limit::numeric * 0.8 then 'approaching' else 'available' end;
  result := jsonb_build_object('key',p_key,'actual',p_actual,'pending',p_pending,'reserved',p_reserved,'committed',c,
    'limit',case when p_available then p_limit end,
    'remaining',case when p_available and p_limit is not null then greatest(p_limit-c,0) end,
    -- Zero ceiling: 0/0 is displayed as 100%; nonzero overage uses 100 per unit.
    'utilizationPercent',case when p_available and p_limit is not null then case when p_limit=0 then case when c=0 then 100 else c*100 end else round(c::numeric*100/p_limit,2) end end,
    'state',s,'overBy',case when p_available and p_limit is not null then greatest(c-p_limit,0) else 0 end,
    'wouldExceedNext',case when not p_available then null when p_limit is null then false else c+1>p_limit end,
    'dataQualityIssue',p_quality);
  if p_key='coach_seats' then result := result || jsonb_build_object('included',case when p_available then p_included end,
    'aboveIncludedBy',case when p_available and p_included is not null then greatest(c-p_included,0) end); end if;
  return result;
end;
$$;

create function public.resolve_account_capacity(p_owner uuid,p_account uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare e jsonb := public.resolve_account_entitlements(p_account); t timestamptz := transaction_timestamp(); dims jsonb;
begin
  with subjects as materialized (
    select dimension,subject_key,bool_and(pending) pending,bool_or(data_quality_issue) quality
    from public.account_capacity_subjects(p_owner,t) group by dimension,subject_key
  ), reservations as (
    select r.dimension,public.account_capacity_subject_key(r.dimension,r.subject_key) subject_key,max(r.quantity) quantity
    from public.account_capacity_reservations r where r.billing_account_id=p_account and r.status='active' and r.expires_at>t
    group by r.dimension,public.account_capacity_subject_key(r.dimension,r.subject_key)
  ), keys(key,limit_key,ordinal) as (values ('counted_clients','countedClients',1),('coach_seats','maxCoachSeats',2),('active_workspaces','activeWorkspaces',3),('published_packages','publishedPackages',4))
  select jsonb_agg(public.account_capacity_dimension(k.key,
    (select count(*) from subjects s where s.dimension=k.key and not s.pending),
    (select count(*) from subjects s where s.dimension=k.key and s.pending),
    coalesce((select sum(r.quantity) from reservations r where r.dimension=k.key and not exists(select 1 from subjects s where s.dimension=r.dimension and s.subject_key=r.subject_key)),0),
    (e->'limits'->>k.limit_key)::integer,e#>>'{subscription,effectiveStatus}' <> 'no_subscription',
    coalesce((select bool_or(s.quality) from subjects s where s.dimension=k.key),false)
      or (k.key='counted_clients' and exists(select 1 from public.invites i join public.workspaces w on w.id=i.workspace_id
        where w.owner_user_id=p_owner and i.role::text='client' and i.max_uses=1 and i.uses=0 and i.used_at is null and (i.expires_at is null or i.expires_at>t))),
    (e#>>'{limits,includedCoachSeats}')::integer) order by k.ordinal) into dims from keys k;
  return jsonb_build_object('schemaVersion',1,'billingAccountId',p_account,'ownerUserId',p_owner,
    'subscription',e->'subscription','dimensions',dims,'hasAnyDataQualityIssue',exists(select 1 from jsonb_array_elements(dims) d where (d->>'dataQualityIssue')::boolean),'computedAt',t);
end;
$$;

create function public.get_my_account_capacity_snapshot()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare u uuid := auth.uid(); a uuid;
begin
  if u is null or not exists(select 1 from public.pt_profiles where user_id=u) then raise exception 'PT authentication required.' using errcode='42501'; end if;
  select id into a from public.billing_accounts where owner_user_id=u;
  return public.resolve_account_capacity(u,a);
end;
$$;

create function public.evaluate_my_capacity_change(p_dimension text,p_quantity integer default 1)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare s jsonb; d jsonb; projected jsonb; allowed boolean; reason text;
begin
  if p_dimension is null or p_dimension not in ('counted_clients','coach_seats','active_workspaces','published_packages') or p_quantity is null or p_quantity<=0 then raise exception 'Invalid capacity change.' using errcode='22023'; end if;
  s := public.get_my_account_capacity_snapshot();
  select value into d from jsonb_array_elements(s->'dimensions') where value->>'key'=p_dimension;
  projected := public.account_capacity_dimension(p_dimension,(d->>'committed')::bigint+p_quantity,0,0,(d->>'limit')::integer,d->>'state'<>'unavailable',false);
  allowed := case when d->>'state'='unavailable' then null else projected->>'state'<>'over_limit' end;
  reason := case when d->>'state'='unavailable' then 'capacity_unavailable' when d->>'state'='unlimited' then 'capacity_unlimited'
    when d->>'state'='over_limit' then 'capacity_already_over_limit' when not allowed then 'capacity_would_exceed' else 'capacity_available' end;
  return jsonb_build_object('dimension',p_dimension,'currentCommitted',d->'committed','proposedQuantity',p_quantity,
    'projectedCommitted',projected->'committed','limit',d->'limit','currentState',d->'state','projectedState',projected->'state',
    'allowedUnderCurrentContract',allowed,'reasonCode',reason,'computedAt',s->'computedAt');
end;
$$;

-- No arbitrary event payloads: allow only a UUID commercial operation identifier.
create function public.validate_account_capacity_metadata(p_source text,p_metadata jsonb)
returns void language plpgsql immutable set search_path = pg_catalog, public
as $$
begin
  if p_source is null or p_source !~ '^[a-z][a-z0-9_.-]{0,63}$' or p_metadata is null or jsonb_typeof(p_metadata)<>'object'
    or (p_metadata - 'operationId') <> '{}'::jsonb then raise exception 'Invalid capacity metadata.' using errcode='22023'; end if;
  if p_metadata ? 'operationId' and (jsonb_typeof(p_metadata->'operationId') <> 'string' or (p_metadata->>'operationId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Invalid operation identifier.' using errcode='22023'; end if;
end;
$$;

create function public.reserve_account_capacity(p_billing_account_id uuid,p_dimension text,p_quantity integer,p_idempotency_key text,p_subject_type text,p_subject_key text,p_workspace_id uuid default null,p_source text default null,p_expires_at timestamptz default null,p_metadata jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, extensions
as $$
declare a public.billing_accounts%rowtype; r public.account_capacity_reservations%rowtype; d jsonb; s jsonb;
  t timestamptz := transaction_timestamp(); h text; canonical text; delta bigint; reason text;
begin
  perform public.validate_account_capacity_metadata(p_source,p_metadata);
  if p_dimension is null or p_dimension not in ('counted_clients','coach_seats','active_workspaces','published_packages') or p_quantity is null or p_quantity<=0
    or p_idempotency_key is null or btrim(p_idempotency_key)='' or length(p_idempotency_key)>200
    or p_subject_type is null or p_subject_type not in ('user','client','email','workspace','package','operation') or p_subject_key is null
    or not (p_subject_key ~ ('^' || p_subject_type || ':' || case when p_subject_type='email' then '[0-9a-f]{64}' else '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' end || '$'))
    or (p_subject_type <> 'operation' and p_quantity<>1)
    or (p_dimension='counted_clients' and p_subject_type not in ('user','client','email','operation'))
    or (p_dimension='coach_seats' and p_subject_type not in ('user','email','operation'))
    or (p_dimension='active_workspaces' and p_subject_type not in ('workspace','operation'))
    or (p_dimension='published_packages' and p_subject_type not in ('package','operation')) then raise exception 'Invalid reservation.' using errcode='22023'; end if;
  select * into a from public.billing_accounts where id=p_billing_account_id for update;
  if not found then raise exception 'Unknown billing account.' using errcode='22023'; end if;
  -- VOLATILE statements after the lock see prior writers under READ COMMITTED.
  select * into r from public.account_capacity_reservations where billing_account_id=a.id and dimension=p_dimension and idempotency_key=p_idempotency_key;
  if found then
    if (r.quantity,r.subject_type,r.subject_key,r.workspace_id) is distinct from (p_quantity,p_subject_type,p_subject_key,p_workspace_id) then raise exception 'Idempotency payload conflict.' using errcode='22023'; end if;
    return jsonb_build_object('granted',true,'reservationId',r.id,'status',r.status,'expiresAt',r.expires_at);
  end if;
  h := encode(extensions.digest(p_idempotency_key,'sha256'),'hex');
  select metadata->>'reasonCode' into reason from public.account_capacity_events where billing_account_id=a.id and dimension=p_dimension and event_type='capacity.reservation_denied' and metadata->>'idempotencyHash'=h;
  if found then return jsonb_build_object('granted',false,'reservationId',null,'reasonCode',reason); end if;
  if p_expires_at is null or p_expires_at<=t or p_expires_at>t+interval '5 minutes' then raise exception 'Reservation TTL must be positive and at most five minutes.' using errcode='22023'; end if;
  if p_workspace_id is not null and not exists(select 1 from public.workspaces where id=p_workspace_id and owner_user_id=a.owner_user_id) then raise exception 'Workspace is outside account.' using errcode='22023'; end if;
  canonical := public.account_capacity_subject_key(p_dimension,p_subject_key);
  s := public.resolve_account_capacity(a.owner_user_id,a.id);
  select value into d from jsonb_array_elements(s->'dimensions') where value->>'key'=p_dimension;
  delta := greatest(p_quantity-coalesce((select max(quantity) from public.account_capacity_reservations where billing_account_id=a.id and dimension=p_dimension and status='active' and expires_at>t and public.account_capacity_subject_key(dimension,subject_key)=canonical),0),0);
  if exists(select 1 from public.account_capacity_subjects(a.owner_user_id,t) x where x.dimension=p_dimension and x.subject_key=canonical) then delta:=0; end if;
  if d->>'state'='unavailable' or ((d->>'limit')::integer is not null and (d->>'committed')::bigint+delta>(d->>'limit')::integer) then
    reason := case when d->>'state'='unavailable' then 'capacity_unavailable' else 'capacity_would_exceed' end;
    insert into public.account_capacity_events(billing_account_id,dimension,event_type,quantity,source,metadata)
      values(a.id,p_dimension,'capacity.reservation_denied',p_quantity,p_source,p_metadata || jsonb_build_object('idempotencyHash',h,'reasonCode',reason));
    return jsonb_build_object('granted',false,'reservationId',null,'reasonCode',reason);
  end if;
  insert into public.account_capacity_reservations(billing_account_id,dimension,quantity,idempotency_key,subject_type,subject_key,workspace_id,source,expires_at,metadata)
    values(a.id,p_dimension,p_quantity,p_idempotency_key,p_subject_type,p_subject_key,p_workspace_id,p_source,p_expires_at,p_metadata) returning * into r;
  insert into public.account_capacity_events(billing_account_id,reservation_id,dimension,event_type,quantity,source,metadata)
    values(a.id,r.id,p_dimension,'capacity.reservation_created',p_quantity,p_source,p_metadata);
  return jsonb_build_object('granted',true,'reservationId',r.id,'status',r.status,'expiresAt',r.expires_at);
end;
$$;

create function public.transition_account_capacity_reservation(p_reservation_id uuid,p_status text,p_source text,p_metadata jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r public.account_capacity_reservations%rowtype; a uuid; t timestamptz := transaction_timestamp();
begin
  perform public.validate_account_capacity_metadata(p_source,p_metadata);
  if p_status not in ('consumed','released','expired') or p_status is null then raise exception 'Invalid terminal status.' using errcode='22023'; end if;
  select billing_account_id into a from public.account_capacity_reservations where id=p_reservation_id;
  perform 1 from public.billing_accounts where id=a for update;
  select * into r from public.account_capacity_reservations where id=p_reservation_id for update;
  if not found then raise exception 'Unknown reservation.' using errcode='22023'; end if;
  if r.status=p_status then return jsonb_build_object('reservationId',r.id,'status',r.status,'transitioned',false); end if;
  if r.status<>'active' or (p_status='consumed' and r.expires_at<=t) or (p_status='expired' and r.expires_at>t) then raise exception 'Conflicting reservation state.' using errcode='22023'; end if;
  update public.account_capacity_reservations set status=p_status,
    consumed_at=case when p_status='consumed' then t end,released_at=case when p_status='released' then t end,expired_at=case when p_status='expired' then t end where id=r.id;
  insert into public.account_capacity_events(billing_account_id,reservation_id,dimension,event_type,quantity,source,metadata)
    values(r.billing_account_id,r.id,r.dimension,'capacity.reservation_' || p_status,r.quantity,p_source,p_metadata);
  return jsonb_build_object('reservationId',r.id,'status',p_status,'transitioned',true);
end;
$$;
create function public.consume_account_capacity_reservation(p_reservation_id uuid,p_source text,p_metadata jsonb default '{}')
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$ select public.transition_account_capacity_reservation(p_reservation_id,'consumed',p_source,p_metadata); $$;
create function public.release_account_capacity_reservation(p_reservation_id uuid,p_source text,p_metadata jsonb default '{}')
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$ select public.transition_account_capacity_reservation(p_reservation_id,'released',p_source,p_metadata); $$;
create function public.reconcile_account_capacity_reservations()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r record; n integer := 0; result jsonb;
begin
  -- Consistent account order and the same account-before-reservation lock order.
  for r in select id,billing_account_id from public.account_capacity_reservations where status='active' and expires_at<=transaction_timestamp() order by billing_account_id,id loop
    perform 1 from public.billing_accounts where id=r.billing_account_id for update;
    if exists(select 1 from public.account_capacity_reservations where id=r.id and status='active' and expires_at<=transaction_timestamp()) then
      result := public.transition_account_capacity_reservation(r.id,'expired','reconciliation','{}');
      if (result->>'transitioned')::boolean then n:=n+1; end if;
    end if;
  end loop;
  return jsonb_build_object('transitions',n,'computedAt',transaction_timestamp());
end;
$$;

alter table public.account_capacity_reservations enable row level security;
alter table public.account_capacity_events enable row level security;
revoke all on table public.account_capacity_reservations,public.account_capacity_events from public,anon,authenticated,service_role;
revoke all on function public.protect_account_capacity_history() from public,anon,authenticated,service_role;
revoke all on function public.account_capacity_email_key(text) from public,anon,authenticated,service_role;
revoke all on function public.account_capacity_subject_key(text,text) from public,anon,authenticated,service_role;
revoke all on function public.account_capacity_subjects(uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.account_capacity_dimension(text,bigint,bigint,bigint,integer,boolean,boolean,integer) from public,anon,authenticated,service_role;
revoke all on function public.resolve_account_capacity(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_my_account_capacity_snapshot() from public,anon,authenticated,service_role;
revoke all on function public.evaluate_my_capacity_change(text,integer) from public,anon,authenticated,service_role;
revoke all on function public.validate_account_capacity_metadata(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.reserve_account_capacity(uuid,text,integer,text,text,text,uuid,text,timestamptz,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.transition_account_capacity_reservation(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.consume_account_capacity_reservation(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.release_account_capacity_reservation(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.reconcile_account_capacity_reservations() from public,anon,authenticated,service_role;
grant execute on function public.get_my_account_capacity_snapshot(),public.evaluate_my_capacity_change(text,integer) to authenticated;
grant execute on function public.reserve_account_capacity(uuid,text,integer,text,text,text,uuid,text,timestamptz,jsonb),public.consume_account_capacity_reservation(uuid,text,jsonb),public.release_account_capacity_reservation(uuid,text,jsonb),public.reconcile_account_capacity_reservations() to service_role;
commit;
