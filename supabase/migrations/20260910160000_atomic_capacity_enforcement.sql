-- PR-PRICE-04. All domain admission and consumption share the writer transaction.
begin;

-- Private transaction provenance extends the existing reservation model. It is
-- immutable under protect_account_capacity_history, including after consumption.
alter table public.account_capacity_reservations add column admission_transaction_id xid8;

-- Batch identity resolution in the existing canonical helper. This avoids one
-- full auth-user scan per pending invite, without modifying Supabase-owned auth
-- indexes or introducing a mirrored identity table.
create or replace function public.account_capacity_subjects(p_owner uuid,p_at timestamptz)
returns table(dimension text,subject_key text,pending boolean,data_quality_issue boolean)
language sql stable security definer set search_path = pg_catalog, public
as $$
  with owned as (select id from public.workspaces where owner_user_id=p_owner),
  staff as (
    select p_owner user_id union select m.user_id from public.workspace_members m join owned w on w.id=m.workspace_id
    where m.status='active' and m.role::text in ('owner','admin','coach','assistant_coach','viewer','pt_owner','pt_coach','pt')
  ), pending_invites as materialized (
    select lower(btrim(i.email)) email from public.workspace_member_invites i join owned w on w.id=i.workspace_id
    where i.status='pending' and i.expires_at>p_at and i.accepted_at is null and i.accepted_by_user_id is null
      and btrim(i.email)<>'' and position('@' in i.email)>1
  ), identities as materialized (
    select lower(btrim(u.email)) email,min(u.id::text) user_id from auth.users u
    where lower(btrim(u.email)) in (select email from pending_invites) group by lower(btrim(u.email))
  ), staff_emails as materialized (
    select lower(btrim(u.email)) email from staff s join auth.users u on u.id=s.user_id
  )
  select 'counted_clients',coalesce('user:' || c.user_id,'client:' || c.id),false,
    c.lifecycle_state is null or c.lifecycle_state not in ('invited','onboarding','active','paused','completed','churned')
  from public.clients c join owned w on w.id=c.workspace_id
  where coalesce(c.relationship_status,'active')='active' and (c.lifecycle_state is null or c.lifecycle_state not in ('completed','churned'))
  union all select 'coach_seats','user:' || user_id,false,false from staff where user_id is not null
  union all select 'coach_seats',coalesce('user:' || u.user_id,public.account_capacity_email_key(i.email)),true,false
    from pending_invites i left join identities u on u.email=i.email
    where not exists(select 1 from staff_emails s where s.email=i.email)
  union all select 'active_workspaces','workspace:' || id,false,false from owned
  union all select 'published_packages','package:' || id,false,false from public.pt_packages
    where pt_user_id=p_owner and status='active' and is_public=true;
$$;

create or replace function public.resolve_account_capacity(p_owner uuid,p_account uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare e jsonb := public.resolve_account_entitlements(p_account); t timestamptz := transaction_timestamp(); dims jsonb;
begin
  with subjects as materialized (
    select dimension,subject_key,bool_and(pending) pending,bool_or(data_quality_issue) quality
    from public.account_capacity_subjects(p_owner,t) group by dimension,subject_key
  ), raw_reservations as materialized (
    select * from public.account_capacity_reservations where billing_account_id=p_account and status='active' and expires_at>t
  ), email_identities as materialized (
    select public.account_capacity_email_key(u.email) email_key,min(u.id::text) user_id from auth.users u
    where exists(select 1 from raw_reservations where left(subject_key,6)='email:')
    group by public.account_capacity_email_key(u.email)
  ), reservations as (
    select r.dimension,coalesce('user:' || e.user_id,'user:' || c.user_id,r.subject_key) subject_key,max(r.quantity) quantity
    from raw_reservations r
    left join email_identities e on e.email_key=r.subject_key and r.dimension in ('counted_clients','coach_seats')
    left join public.clients c on c.id=case when left(r.subject_key,7)='client:' and r.dimension='counted_clients' then substring(r.subject_key from 8)::uuid end
    group by r.dimension,coalesce('user:' || e.user_id,'user:' || c.user_id,r.subject_key)
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

create function public.account_capacity_mutation_error(p_code text, p_dimension text)
returns void language plpgsql set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = 'P0001', message = 'Account capacity admission failed.',
    detail = jsonb_build_object('code', p_code, 'dimension', p_dimension)::text;
end;
$$;

-- Resolve every account before taking any account lock; UUID order is universal.
create function public.lock_capacity_owners(p_owners uuid[])
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  perform a.id from public.billing_accounts a
    where a.owner_user_id = any(p_owners) order by a.id for update;
end;
$$;

create function public.admit_account_capacity_subject(p_owner uuid, p_dimension text, p_subject text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  a uuid; e jsonb; r jsonb; existing uuid; operation_id uuid := gen_random_uuid();
  t timestamptz := transaction_timestamp();
begin
  select id into a from public.billing_accounts where owner_user_id = p_owner for update;
  -- Domain identity, never a browser quantity, determines the delta under the lock.
  if exists(select 1 from public.account_capacity_subjects(p_owner,t) s
      where s.dimension=p_dimension and s.subject_key=p_subject) then return null; end if;
  if a is null then
    perform public.account_capacity_mutation_error('ACCOUNT_CAPACITY_UNAVAILABLE',p_dimension);
  end if;
  -- Reuse only this transaction's private, actor-bound domain admission. No GUC,
  -- request header, browser field, or historical granted response is authority.
  select id into existing from public.account_capacity_reservations
    where billing_account_id=a and dimension=p_dimension and subject_key=p_subject
      and source='domain.admission' and status='active' and expires_at>t
      and created_at=t and admission_transaction_id=pg_current_xact_id()
      and created_by_user_id is not distinct from auth.uid();
  if existing is not null then return existing; end if;
  e := public.resolve_account_entitlements(a);
  if e#>>'{subscription,accessMode}' is distinct from 'full' then
    perform public.account_capacity_mutation_error('ACCOUNT_CAPACITY_GROWTH_NOT_ALLOWED',p_dimension);
  end if;
  r := public.reserve_account_capacity(a,p_dimension,1,operation_id::text,
    split_part(p_subject,':',1),p_subject,null,'domain.admission',t+interval '30 seconds',
    jsonb_build_object('operationId',operation_id));
  if not coalesce((r->>'granted')::boolean,false) then
    perform public.account_capacity_mutation_error(case when r->>'reasonCode'='capacity_unavailable'
      then 'ACCOUNT_CAPACITY_UNAVAILABLE' else 'ACCOUNT_CAPACITY_LIMIT_REACHED' end,p_dimension);
  end if;
  if r->>'status' is distinct from 'active' then
    perform public.account_capacity_mutation_error('ACCOUNT_CAPACITY_RESERVATION_CONFLICT',p_dimension);
  end if;
  if (r->>'expiresAt')::timestamptz<=t then
    perform public.account_capacity_mutation_error('ACCOUNT_CAPACITY_OPERATION_EXPIRED',p_dimension);
  end if;
  return (r->>'reservationId')::uuid;
end;
$$;

-- Canonical per-row subjects. The account aggregate remains PR-PRICE-03's helper.
create function public.capacity_row_subjects(p_table text,p_row jsonb)
returns table(owner_id uuid,dimension text,subject_key text)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare w uuid := (p_row->>'workspace_id')::uuid; o uuid; k text;
begin
  if p_row is null then return; end if;
  if p_table='workspaces' then
    owner_id := (p_row->>'owner_user_id')::uuid;
    dimension := 'active_workspaces'; subject_key := 'workspace:' || (p_row->>'id');
    if owner_id is not null then return next; end if;
    -- Ownership moves the workspace's existing people as well as the workspace.
    return query select (p_row->>'owner_user_id')::uuid,s.dimension,s.subject_key
      from public.clients c cross join lateral public.capacity_row_subjects('clients',to_jsonb(c)) s
      where c.workspace_id=(p_row->>'id')::uuid;
    return query select (p_row->>'owner_user_id')::uuid,s.dimension,s.subject_key
      from public.workspace_members m cross join lateral public.capacity_row_subjects('workspace_members',to_jsonb(m)) s
      where m.workspace_id=(p_row->>'id')::uuid;
    return query select (p_row->>'owner_user_id')::uuid,s.dimension,s.subject_key
      from public.workspace_member_invites i cross join lateral public.capacity_row_subjects('workspace_member_invites',to_jsonb(i)) s
      where i.workspace_id=(p_row->>'id')::uuid;
    return;
  end if;
  if p_table='pt_packages' then
    if p_row->>'status'='active' and (p_row->>'is_public')::boolean then
      return query select (p_row->>'pt_user_id')::uuid,'published_packages'::text,'package:' || (p_row->>'id');
    end if;
    return;
  end if;
  select owner_user_id into o from public.workspaces where id=w;
  if o is null then return; end if;
  if p_table='clients' and coalesce(p_row->>'relationship_status','active')='active'
    and coalesce(p_row->>'lifecycle_state','unknown') not in ('completed','churned') then
    return query select o,'counted_clients'::text,coalesce('user:' || (p_row->>'user_id'),'client:' || (p_row->>'id'));
  elsif p_table='workspace_members' and p_row->>'status'='active'
    and p_row->>'role' in ('owner','admin','coach','assistant_coach','viewer','pt_owner','pt_coach','pt') then
    return query select o,'coach_seats'::text,'user:' || (p_row->>'user_id');
  elsif p_table='workspace_member_invites' and p_row->>'status'='pending'
    and (p_row->>'expires_at')::timestamptz>transaction_timestamp()
    and p_row->>'accepted_at' is null and p_row->>'accepted_by_user_id' is null
    and position('@' in btrim(p_row->>'email'))>1 then
    select 'user:' || u.id into k from auth.users u
      where lower(btrim(u.email))=lower(btrim(p_row->>'email')) order by u.id limit 1;
    return query select o,'coach_seats'::text,coalesce(k,public.account_capacity_email_key(p_row->>'email'));
  end if;
end;
$$;

create function public.guard_capacity_domain_write()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare n jsonb; b jsonb; owners uuid[]; s record; a uuid; lost integer;
begin
  if tg_op<>'DELETE' then n:=to_jsonb(new); end if;
  if tg_op<>'INSERT' then b:=to_jsonb(old); end if;
  if tg_op='UPDATE' and not exists (
    (select * from public.capacity_row_subjects(tg_table_name,n)
     except select * from public.capacity_row_subjects(tg_table_name,b))
    union all
    (select * from public.capacity_row_subjects(tg_table_name,b)
     except select * from public.capacity_row_subjects(tg_table_name,n))
  ) then return new; end if;
  if tg_table_name='workspaces' and tg_op<>'DELETE'
    and (tg_op='INSERT' or (n->>'owner_user_id') is distinct from (b->>'owner_user_id')) then
    -- Account creation does not itself start a trial. Resolve both accounts first.
    a:=public.ensure_commercial_billing_account((n->>'owner_user_id')::uuid,
      case when tg_op='INSERT' then 'first_workspace' else 'workspace_transfer' end);
  end if;
  select array_agg(distinct x.owner_id) into owners from (
    select owner_id from public.capacity_row_subjects(tg_table_name,n)
    union select owner_id from public.capacity_row_subjects(tg_table_name,b)
    union select (n->>'owner_user_id')::uuid where tg_table_name='workspaces'
    union select (b->>'owner_user_id')::uuid where tg_table_name='workspaces'
  ) x;
  perform public.lock_capacity_owners(owners);
  if tg_table_name='workspaces' and tg_op<>'DELETE'
    and (tg_op='INSERT' or (n->>'owner_user_id') is distinct from (b->>'owner_user_id')) then
    perform public.start_account_trial_for_owner((n->>'owner_user_id')::uuid,
      case when tg_op='INSERT' then 'first_workspace' else 'workspace_transfer' end);
  end if;
  for s in select distinct * from public.capacity_row_subjects(tg_table_name,n)
    order by owner_id,dimension,subject_key
  loop
    -- Identity replacement within one account is neutral when the old identity
    -- has no other commitment. Duplicates in the canonical set remain counted.
    lost:=0;
    if tg_table_name='clients' and tg_op='UPDATE' then
      select count(*) into lost from public.capacity_row_subjects(tg_table_name,b) old_s
        where old_s.owner_id=s.owner_id and old_s.dimension=s.dimension
          and old_s.subject_key<>s.subject_key
          and (select count(*) from public.account_capacity_subjects(s.owner_id,transaction_timestamp()) x
            where x.dimension=s.dimension and x.subject_key=old_s.subject_key)=1;
    end if;
    if lost=0 then
      perform public.admit_account_capacity_subject(s.owner_id,s.dimension,s.subject_key);
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create function public.consume_capacity_domain_write()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_reservation record;
begin
  -- Only private admissions created in this exact transaction can be consumed.
  -- The canonical result must now exist. AFTER failures roll back the row too.
  for v_reservation in select r.id,r.dimension,r.expires_at from public.account_capacity_reservations r
    join public.billing_accounts a on a.id=r.billing_account_id
    where r.source='domain.admission' and r.status='active'
      and r.created_at=transaction_timestamp() and r.admission_transaction_id=pg_current_xact_id()
      and r.created_by_user_id is not distinct from auth.uid()
      and exists(select 1 from public.account_capacity_subjects(a.owner_user_id,transaction_timestamp()) s
        where s.dimension=r.dimension and s.subject_key=r.subject_key)
    order by r.billing_account_id,r.id
  loop
    if v_reservation.expires_at<=clock_timestamp() then
      perform public.account_capacity_mutation_error('ACCOUNT_CAPACITY_OPERATION_EXPIRED',v_reservation.dimension);
    end if;
    perform public.consume_account_capacity_reservation(v_reservation.id,'domain.admission');
  end loop;
  return new;
end;
$$;

-- Run after existing BEFORE normalizers, before any domain row is written.
create trigger zz_capacity_admission before insert or update or delete on public.clients
  for each row execute function public.guard_capacity_domain_write();
create trigger zz_capacity_admission before insert or update or delete on public.workspaces
  for each row execute function public.guard_capacity_domain_write();
create trigger zz_capacity_admission before insert or update or delete on public.workspace_members
  for each row execute function public.guard_capacity_domain_write();
create trigger zz_capacity_admission before insert or update or delete on public.workspace_member_invites
  for each row execute function public.guard_capacity_domain_write();
create trigger zz_capacity_admission before insert or update or delete on public.pt_packages
  for each row execute function public.guard_capacity_domain_write();
create trigger zz_capacity_consumption after insert or update on public.clients
  for each row execute function public.consume_capacity_domain_write();
create trigger zz_capacity_consumption after insert or update on public.workspaces
  for each row execute function public.consume_capacity_domain_write();
create trigger zz_capacity_consumption after insert or update on public.workspace_members
  for each row execute function public.consume_capacity_domain_write();
create trigger zz_capacity_consumption after insert or update on public.workspace_member_invites
  for each row execute function public.consume_capacity_domain_write();
create trigger zz_capacity_consumption after insert or update on public.pt_packages
  for each row execute function public.consume_capacity_domain_write();


create or replace function public.reserve_account_capacity(p_billing_account_id uuid,p_dimension text,p_quantity integer,p_idempotency_key text,p_subject_type text,p_subject_key text,p_workspace_id uuid default null,p_source text default null,p_expires_at timestamptz default null,p_metadata jsonb default '{}')
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
  -- Match aliases to the one requested identity, rather than re-hashing every
  -- auth user for every existing email reservation.
  delta := greatest(p_quantity-coalesce((select max(held.quantity) from public.account_capacity_reservations held
    where held.billing_account_id=a.id and held.dimension=p_dimension and held.status='active' and held.expires_at>t
      and (held.subject_key=canonical or (left(canonical,5)='user:' and (
        held.subject_key=(select public.account_capacity_email_key(u.email) from auth.users u
          where u.id=case when left(canonical,5)='user:' then substring(canonical from 6)::uuid end)
        or (p_dimension='counted_clients' and held.subject_type='client' and exists(
          select 1 from public.clients c where 'client:' || c.id=held.subject_key and 'user:' || c.user_id=canonical))
      )))),0),0);
  if exists(select 1 from public.account_capacity_subjects(a.owner_user_id,t) x where x.dimension=p_dimension and x.subject_key=canonical) then delta:=0; end if;
  if d->>'state'='unavailable' or ((d->>'limit')::integer is not null and (d->>'committed')::bigint+delta>(d->>'limit')::integer) then
    reason := case when d->>'state'='unavailable' then 'capacity_unavailable' else 'capacity_would_exceed' end;
    insert into public.account_capacity_events(billing_account_id,dimension,event_type,quantity,source,metadata)
      values(a.id,p_dimension,'capacity.reservation_denied',p_quantity,p_source,p_metadata || jsonb_build_object('idempotencyHash',h,'reasonCode',reason));
    return jsonb_build_object('granted',false,'reservationId',null,'reasonCode',reason);
  end if;
  insert into public.account_capacity_reservations(billing_account_id,dimension,quantity,idempotency_key,subject_type,subject_key,workspace_id,source,expires_at,metadata,created_by_user_id,admission_transaction_id)
    values(a.id,p_dimension,p_quantity,p_idempotency_key,p_subject_type,p_subject_key,p_workspace_id,p_source,p_expires_at,p_metadata,auth.uid(),case when p_source='domain.admission' then pg_current_xact_id() end) returning * into r;
  insert into public.account_capacity_events(billing_account_id,reservation_id,dimension,event_type,quantity,source,metadata)
    values(a.id,r.id,p_dimension,'capacity.reservation_created',p_quantity,p_source,p_metadata);
  return jsonb_build_object('granted',true,'reservationId',r.id,'status',r.status,'expiresAt',r.expires_at);
end;
$$;

create or replace function public.create_workspace(p_name text)
returns table(workspace_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_variable
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_name text;
  v_member_id uuid;
  v_profile_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.enforce_rate_limit(
    'workspace_create_burst',
    1,
    60,
    v_user_id,
    null,
    null,
    'Please wait a minute before creating another workspace.'
  );

  perform public.enforce_rate_limit(
    'workspace_create_daily',
    3,
    86400,
    v_user_id,
    null,
    null,
    'You have reached the workspace creation limit for today.'
  );

  v_name := nullif(trim(p_name), '');
  if v_name is null then
    raise exception 'Workspace name is required';
  end if;

  if not exists(select 1 from public.pt_profiles where user_id=v_user_id) then
    raise exception 'PT authentication required.' using errcode='42501';
  end if;

  insert into public.workspaces (name, owner_user_id)
  values (v_name, v_user_id)
  returning id into v_workspace_id;

  select wm.id
  into v_member_id
  from public.workspace_members wm
  where wm.workspace_id = v_workspace_id
    and wm.user_id = v_user_id
  limit 1
  for update;

  if v_member_id is null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, v_user_id, 'pt_owner');
  else
    update public.workspace_members wm
    set role = 'pt_owner'
    where wm.id = v_member_id;
  end if;

  select pp.id
  into v_profile_id
  from public.pt_profiles pp
  where pp.user_id = v_user_id
    and pp.workspace_id = v_workspace_id
  limit 1
  for update;

  if v_profile_id is null then
    insert into public.pt_profiles (user_id, workspace_id)
    values (v_user_id, v_workspace_id);
  end if;

  workspace_id := v_workspace_id;
  return next;
end;
$$;

create or replace function public.reactivate_removed_client_relationship_internal(
  p_client_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_relationship_status text;
begin
  if p_client_id is null then
    raise exception 'Client relationship is required';
  end if;

  select c.relationship_status
  into v_relationship_status
  from public.clients c
  where c.id = p_client_id
  for update;

  if not found then
    raise exception 'Client relationship not found';
  end if;

  if coalesce(v_relationship_status, 'active') = 'transferred_out' then
    raise exception
      using
        errcode = 'P0001',
        message = 'Transferred client relationships require the transfer flow',
        detail = 'CLIENT_RELATIONSHIP_TRANSFERRED_OUT',
        hint = 'Use the dedicated transfer flow to reactivate a transferred client relationship.';
  end if;

  update public.clients c
  set
    relationship_status = 'active',
    removed_at = null,
    removed_by_user_id = null,
    updated_at = now()
  where c.id = p_client_id
    and coalesce(c.relationship_status, 'active') <> 'active';

  return p_client_id;
end;
$$;

create or replace function public.reactivate_removed_client_relationship(p_client_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.can_access_client(p_client_id,'clients.edit') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  return public.reactivate_removed_client_relationship_internal(p_client_id);
end;
$$;

create or replace function public.accept_invite(p_token text)
returns table(workspace_id uuid, client_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_variable
declare
  v_user_id uuid;
  v_user_email text;
  v_invite public.invites%rowtype;
  v_client_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_user_email := nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), '');
  if v_user_email is null then
    select nullif(lower(btrim(u.email)), '')
    into v_user_email
    from auth.users u
    where u.id = v_user_id;
  end if;

  select i.*
  into v_invite
  from public.invites i
  where i.token = p_token
     or i.code = p_token
  order by i.created_at desc
  limit 1
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found';
  end if;

  if v_invite.role is distinct from 'client' then
    raise exception 'Invite role not supported';
  end if;

  if v_invite.used_at is not null then
    raise exception 'Invite already used';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'Invite expired';
  end if;

  if v_invite.max_uses is not null and coalesce(v_invite.uses, 0) >= v_invite.max_uses then
    raise exception 'Invite max uses reached';
  end if;

  select c.id
  into v_client_id
  from public.clients c
  where c.workspace_id = v_invite.workspace_id
    and c.user_id = v_user_id
  limit 1
  for update;

  if v_client_id is not null then
    perform public.reactivate_removed_client_relationship_internal(v_client_id);
  end if;

  if v_client_id is null and v_user_email is not null then
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id = v_invite.workspace_id
      and nullif(lower(btrim(coalesce(c.email, ''))), '') = v_user_email
      and coalesce(c.relationship_status, 'active') in ('removed', 'transferred_out')
    order by c.removed_at desc nulls last, c.created_at desc
    limit 1
    for update;

    if v_client_id is not null then
      update public.clients set user_id=auth.uid() where id=v_client_id;
      perform public.reactivate_removed_client_relationship_internal(v_client_id);

      update public.clients c
      set
        user_id = v_user_id,
        status = 'active',
        email = coalesce(nullif(lower(btrim(c.email)), ''), v_user_email),
        updated_at = now()
      where c.id = v_client_id
        and coalesce(c.relationship_status, 'active') = 'active'
      returning c.id into v_client_id;
    end if;
  end if;

  if v_client_id is null then
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id is null
      and c.user_id = v_user_id
    limit 1
    for update;
  end if;

  if v_client_id is null then
    insert into public.clients (
      workspace_id,
      user_id,
      status,
      relationship_status,
      display_name,
      email
    )
    values (v_invite.workspace_id, v_user_id, 'active', 'active', null, v_user_email)
    returning id into v_client_id;
  else
    update public.clients c
    set
      workspace_id = v_invite.workspace_id,
      status = 'active',
      user_id = v_user_id,
      relationship_status = 'active',
      removed_at = null,
      removed_by_user_id = null,
      email = coalesce(nullif(lower(btrim(c.email)), ''), v_user_email)
    where c.id = v_client_id
      and coalesce(c.relationship_status, 'active') <> 'transferred_out'
    returning id into v_client_id;
  end if;

  perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite');

  update public.invites
  set
    used_at = now(),
    uses = coalesce(uses, 0) + 1
  where id = v_invite.id;

  workspace_id := v_invite.workspace_id;
  client_id := v_client_id;
  return next;
end;
$$;

create or replace function public.accept_invite(
  p_code text,
  p_display_name text default null
)
returns table(workspace_id uuid, client_id uuid)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $$
declare
  v_inv public.invites%rowtype;
  v_client_id uuid;
  v_name text;
  v_user_email text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to accept an invite';
  end if;

  v_user_email := nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), '');
  if v_user_email is null then
    select nullif(lower(btrim(u.email)), '')
    into v_user_email
    from auth.users u
    where u.id = auth.uid();
  end if;

  select *
  into v_inv
  from public.invites
  where code = p_code
  for update;

  if not found then
    raise exception 'Invalid invite code';
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception 'Invite expired';
  end if;

  if v_inv.uses >= v_inv.max_uses then
    raise exception 'Invite already used';
  end if;

  select c.id
  into v_client_id
  from public.clients c
  where c.workspace_id = v_inv.workspace_id
    and c.user_id = auth.uid()
  limit 1
  for update;

  if v_client_id is not null then
    perform public.reactivate_removed_client_relationship_internal(v_client_id);
  end if;

  if v_client_id is null and v_user_email is not null then
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id = v_inv.workspace_id
      and nullif(lower(btrim(coalesce(c.email, ''))), '') = v_user_email
      and coalesce(c.relationship_status, 'active') in ('removed', 'transferred_out')
    order by c.removed_at desc nulls last, c.created_at desc
    limit 1
    for update;

    if v_client_id is not null then
      update public.clients set user_id=auth.uid() where id=v_client_id;
      perform public.reactivate_removed_client_relationship_internal(v_client_id);

      update public.clients c
      set
        user_id = auth.uid(),
        status = 'active',
        email = coalesce(nullif(lower(btrim(c.email)), ''), v_user_email),
        updated_at = now()
      where c.id = v_client_id
        and coalesce(c.relationship_status, 'active') = 'active'
      returning c.id into v_client_id;
    end if;
  end if;

  if v_client_id is null then
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id is null
      and c.user_id = auth.uid()
    limit 1
    for update;
  end if;

  if v_client_id is null then
    v_name := coalesce(
      nullif(trim(p_display_name), ''),
      split_part(coalesce(v_user_email, auth.jwt() ->> 'email'), '@', 1),
      'Client'
    );

    insert into public.clients (
      workspace_id,
      user_id,
      display_name,
      full_name,
      status,
      relationship_status,
      email
    )
    values (v_inv.workspace_id, auth.uid(), v_name, v_name, 'active', 'active', v_user_email)
    returning id into v_client_id;
  else
    update public.clients
    set
      workspace_id = v_inv.workspace_id,
      status = 'active',
      relationship_status = 'active',
      removed_at = null,
      removed_by_user_id = null,
      email = coalesce(nullif(lower(btrim(email)), ''), v_user_email),
      display_name = coalesce(display_name, nullif(trim(p_display_name), '')),
      full_name = coalesce(full_name, nullif(trim(p_display_name), ''))
    where id = v_client_id
      and coalesce(relationship_status, 'active') <> 'transferred_out';
  end if;

  perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite');

  update public.invites
  set uses = uses + 1
  where id = v_inv.id;

  return query select v_inv.workspace_id, v_client_id;
end;
$$;

create or replace function public.pt_update_client_lifecycle(
  p_client_id uuid,
  p_lifecycle_state text,
  p_reason text default null
)
returns table(
  id uuid,
  status text,
  lifecycle_state text,
  lifecycle_changed_at timestamptz,
  paused_reason text,
  churn_reason text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.can_access_client(p_client_id, 'clients.lifecycle.update') then
    raise exception 'Not authorized';
  end if;

  return query
  update public.clients c
  set
    lifecycle_state = trim(coalesce(p_lifecycle_state, '')),
    paused_reason = case when trim(coalesce(p_lifecycle_state, '')) = 'paused' then v_reason else null end,
    churn_reason = case when trim(coalesce(p_lifecycle_state, '')) = 'churned' then v_reason else null end,
    updated_at = now()
  where c.id = p_client_id
  returning
    c.id,
    c.status::text,
    c.lifecycle_state,
    c.lifecycle_changed_at,
    c.paused_reason,
    c.churn_reason;
end;
$$;

create or replace function public.pt_archive_client_relationship(
  p_client_id uuid
)
returns table (
  id uuid,
  relationship_status text,
  removed_at timestamptz,
  removed_by_user_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_client record;
begin
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select c.id, c.workspace_id, c.relationship_status
  into v_client
  from public.clients c
  where c.id = p_client_id
  for update;

  if not found or v_client.workspace_id is null then
    raise exception 'Client relationship not found';
  end if;

  if not public.can_access_client(p_client_id, 'clients.edit') then
    raise exception 'Not authorized';
  end if;

  return query
  update public.clients c
  set
    relationship_status = 'removed',
    removed_at = coalesce(c.removed_at, now()),
    removed_by_user_id = coalesce(c.removed_by_user_id, v_actor_user_id),
    updated_at = now()
  where c.id = p_client_id
  returning
    c.id,
    c.relationship_status,
    c.removed_at,
    c.removed_by_user_id;
end;
$$;

create or replace function public.pt_transfer_client_relationship(
  p_source_client_id uuid,
  p_target_workspace_id uuid
)
returns table (
  source_client_id uuid,
  target_client_id uuid,
  source_workspace_id uuid,
  target_workspace_id uuid,
  target_client_url_key text,
  target_workspace_slug text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_source public.clients%rowtype;
  v_source_context record;
  v_target_context record;
  v_has_source_context boolean := false;
  v_has_target_context boolean := false;
  v_target_client_id uuid;
  v_target_relationship_status text;
  v_target_client_url_key text;
  v_target_workspace_slug text;
begin
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_source_client_id is null then
    raise exception 'Source client relationship is required';
  end if;

  if p_target_workspace_id is null then
    raise exception 'Target workspace is required';
  end if;

  select c.*
  into v_source
  from public.clients c
  where c.id = p_source_client_id
;

  if not found or v_source.workspace_id is null then
    raise exception 'Source client relationship not found';
  end if;

  if v_source.workspace_id = p_target_workspace_id then
    raise exception
      using
        errcode = 'P0001',
        message = 'Source and target workspaces must be different',
        detail = 'CLIENT_TRANSFER_SAME_WORKSPACE';
  end if;

  if coalesce(v_source.relationship_status, 'active') <> 'active' then
    raise exception
      using
        errcode = 'P0001',
        message = 'Only active client relationships can be transferred',
        detail = 'SOURCE_RELATIONSHIP_NOT_ACTIVE';
  end if;

  select *
  into v_source_context
  from public.workspace_access_context(v_source.workspace_id)
  limit 1;
  v_has_source_context := found;

  select *
  into v_target_context
  from public.workspace_access_context(p_target_workspace_id)
  limit 1;
  v_has_target_context := found;

  if not v_has_source_context
     or not v_has_target_context
     or v_source_context.role not in ('owner', 'admin')
     or v_target_context.role not in ('owner', 'admin') then
    raise exception
      using
        errcode = 'P0001',
        message = 'Not authorized to transfer this client relationship',
        detail = 'CLIENT_TRANSFER_PERMISSION_DENIED',
        hint = 'Transfer requires owner or admin access to both source and target workspaces.';
  end if;

  perform public.lock_capacity_owners(array(
    select owner_user_id from public.workspaces
      where id in (v_source.workspace_id,p_target_workspace_id)));
  select c.* into v_source from public.clients c where c.id=p_source_client_id for update;
  if v_source.workspace_id is distinct from v_source_context.workspace_id
    or coalesce(v_source.relationship_status,'active')<>'active' then
    raise exception 'Source relationship changed; retry transfer.' using errcode='40001';
  end if;

  select w.slug
  into v_target_workspace_slug
  from public.workspaces w
  where w.id = p_target_workspace_id;

  select c.id, c.relationship_status
  into v_target_client_id, v_target_relationship_status
  from public.clients c
  where c.workspace_id = p_target_workspace_id
    and c.user_id = v_source.user_id
  order by
    case coalesce(c.relationship_status, 'active')
      when 'active' then 0
      when 'removed' then 1
      when 'transferred_out' then 2
      else 3
    end,
    c.created_at asc
  limit 1
  for update;

  if v_target_client_id is null then
    insert into public.clients (
      workspace_id,
      user_id,
      status,
      relationship_status,
      lifecycle_state,
      lifecycle_changed_at,
      paused_reason,
      churn_reason,
      display_name,
      full_name,
      email,
      phone,
      account_onboarding_completed_at,
      avatar_url,
      photo_url
    )
    values (
      p_target_workspace_id,
      v_source.user_id,
      'active',
      'active',
      'active',
      now(),
      null,
      null,
      v_source.display_name,
      v_source.full_name,
      v_source.email,
      v_source.phone,
      v_source.account_onboarding_completed_at,
      v_source.avatar_url,
      v_source.photo_url
    )
    returning id into v_target_client_id;
  else
    if coalesce(v_target_relationship_status, 'active') = 'transferred_out' then
      null;
    elsif coalesce(v_target_relationship_status, 'active') = 'removed' then
      perform public.reactivate_removed_client_relationship_internal(v_target_client_id);
    end if;

    update public.clients c
    set
      status = 'active',
      relationship_status = 'active',
      removed_at = null,
      removed_by_user_id = null,
      lifecycle_state = 'active',
      lifecycle_changed_at = now(),
      paused_reason = null,
      churn_reason = null,
      display_name = coalesce(c.display_name, v_source.display_name),
      full_name = coalesce(c.full_name, v_source.full_name),
      email = coalesce(c.email, v_source.email),
      phone = coalesce(c.phone, v_source.phone),
      account_onboarding_completed_at = coalesce(
        c.account_onboarding_completed_at,
        v_source.account_onboarding_completed_at
      ),
      avatar_url = coalesce(c.avatar_url, v_source.avatar_url),
      photo_url = coalesce(c.photo_url, v_source.photo_url),
      updated_at = now()
    where c.id = v_target_client_id;
  end if;

  update public.clients c
  set
    url_key = coalesce(
      nullif(btrim(c.url_key), ''),
      'c-' || lower(substr(replace(v_target_client_id::text, '-', ''), 1, 8))
    ),
    updated_at = now()
  where c.id = v_target_client_id
    returning c.url_key into v_target_client_url_key;

  update public.clients c
  set
    relationship_status = 'transferred_out',
    removed_at = coalesce(c.removed_at, now()),
    removed_by_user_id = coalesce(c.removed_by_user_id, v_actor_user_id),
    updated_at = now()
  where c.id = v_source.id;

  perform public.sync_client_account_profile_fields(v_target_client_id);
  perform public.copy_client_universal_baseline_data(v_source.id, v_target_client_id);
  perform public.copy_client_universal_onboarding_data(v_source.id, v_target_client_id);

  return query
  select
    v_source.id,
    v_target_client_id,
    v_source.workspace_id,
    p_target_workspace_id,
    v_target_client_url_key,
    v_target_workspace_slug;
end;
$$;

create or replace function public.pt_hub_approve_lead(
  p_lead_id uuid,
  p_workspace_id uuid default null,
  p_workspace_name text default null,
  p_allow_transfer boolean default false
)
returns table(
  lead_id uuid,
  status text,
  workspace_id uuid,
  client_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid;
  v_lead public.pt_hub_leads%rowtype;
  v_target_workspace_id uuid;
  v_target_client_id uuid;
  v_workspace_name text;
  v_was_converted boolean := false;
  v_transfer_requested boolean := false;
  v_new_workspace boolean := false;
begin
  v_actor_user_id := auth.uid();
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_lead_id is null then
    raise exception 'Lead is required';
  end if;

  select *
  into v_lead
  from public.pt_hub_leads lead
  where lead.id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found';
  end if;

  if v_lead.user_id <> v_actor_user_id then
    raise exception 'Not allowed to update this lead';
  end if;

  if v_lead.status = 'declined' then
    raise exception 'Declined leads cannot be approved';
  end if;

  v_workspace_name := nullif(btrim(coalesce(p_workspace_name, '')), '');
  v_was_converted :=
    v_lead.status = 'converted'
    and v_lead.converted_workspace_id is not null
    and v_lead.converted_client_id is not null;

  if v_was_converted then
    if p_workspace_id is null and v_workspace_name is null then
      return query
      select
        v_lead.id,
        'converted'::text,
        v_lead.converted_workspace_id,
        v_lead.converted_client_id;
      return;
    end if;

    if p_workspace_id is not null
       and p_workspace_id = v_lead.converted_workspace_id then
      return query
      select
        v_lead.id,
        'converted'::text,
        v_lead.converted_workspace_id,
        v_lead.converted_client_id;
      return;
    end if;

    v_transfer_requested :=
      (p_workspace_id is not null and p_workspace_id <> v_lead.converted_workspace_id)
      or v_workspace_name is not null;
  end if;

  if p_workspace_id is not null then
    select workspace.id
    into v_target_workspace_id
    from public.workspaces workspace
    where workspace.id = p_workspace_id
      and workspace.owner_user_id = v_actor_user_id
    limit 1;

    if v_target_workspace_id is null then
      raise exception 'Workspace not found';
    end if;
  elsif v_workspace_name is not null then
    if not exists(select 1 from public.pt_profiles where user_id=v_actor_user_id) then
      raise exception 'PT authentication required.' using errcode='42501';
    end if;
    v_new_workspace := true;
    v_target_workspace_id := gen_random_uuid();
    perform public.start_account_trial_for_owner(v_actor_user_id,'first_workspace');
    perform public.lock_capacity_owners(array[v_actor_user_id]);
    perform public.admit_account_capacity_subject(v_actor_user_id,'active_workspaces','workspace:' || v_target_workspace_id);
    if v_lead.applicant_user_id is not null then
      perform public.admit_account_capacity_subject(v_actor_user_id,'counted_clients','user:' || v_lead.applicant_user_id);
    end if;
    insert into public.workspaces (id, name, owner_user_id)
    values (v_target_workspace_id, v_workspace_name, v_actor_user_id)
    returning id into v_target_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_target_workspace_id, v_actor_user_id, 'pt_owner')
    on conflict on constraint workspace_members_workspace_id_user_id_key
    do update
      set role = 'pt_owner';
  else
    update public.pt_hub_leads lead
    set
      status = 'approved_pending_workspace',
      converted_at = null,
      converted_workspace_id = null,
      converted_client_id = null
    where lead.id = v_lead.id;

    return query
    select v_lead.id, 'approved_pending_workspace'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_lead.applicant_user_id is null then
    update public.pt_hub_leads lead
    set
      status = 'approved_pending_workspace',
      converted_workspace_id = v_target_workspace_id,
      converted_client_id = null
    where lead.id = v_lead.id;

    return query
    select
      v_lead.id,
      'approved_pending_workspace'::text,
      v_target_workspace_id,
      null::uuid;
    return;
  end if;

  if v_transfer_requested then
    if not coalesce(p_allow_transfer, false) then
      raise exception
        using
          errcode = 'P0001',
          message = 'Lead transfer requires confirmation',
          detail = 'LEAD_TRANSFER_REQUIRES_CONFIRMATION',
          hint = 'Transfer keeps previous workspace history preserved and does not copy assignments automatically.';
    end if;

    select transferred.target_client_id into v_target_client_id
    from public.pt_transfer_client_relationship(
      v_lead.converted_client_id,
      v_target_workspace_id
    ) transferred;

    perform public.ensure_workspace_client_onboarding(
      v_target_client_id,
      'converted_lead'
    );

    update public.pt_hub_leads lead
    set
      status = 'converted',
      converted_at = coalesce(lead.converted_at, now()),
      converted_workspace_id = v_target_workspace_id,
      converted_client_id = v_target_client_id
    where lead.id = v_lead.id;

    return query
    select
      v_lead.id,
      'converted'::text,
      v_target_workspace_id,
      v_target_client_id;
    return;
  end if;

  begin
    select c.id
    into v_target_client_id
    from public.clients c
    where c.workspace_id = v_target_workspace_id
      and c.user_id = v_lead.applicant_user_id
    limit 1
    for update;

    if v_target_client_id is not null then
      perform public.reactivate_removed_client_relationship_internal(v_target_client_id);
    end if;

    if v_target_client_id is null
       and v_lead.converted_client_id is not null then
      select c.id
      into v_target_client_id
      from public.clients c
      where c.id = v_lead.converted_client_id
        and c.user_id = v_lead.applicant_user_id
      limit 1
      for update;

      if v_target_client_id is not null then
        perform public.reactivate_removed_client_relationship_internal(v_target_client_id);
      end if;
    end if;

    if v_target_client_id is null then
      select c.id
      into v_target_client_id
      from public.clients c
      where c.workspace_id is null
        and c.user_id = v_lead.applicant_user_id
      order by c.created_at asc
      limit 1
      for update;

      if v_target_client_id is not null then
        perform public.reactivate_removed_client_relationship_internal(v_target_client_id);
      end if;
    end if;

    if v_target_client_id is null then
      insert into public.clients (
        workspace_id,
        user_id,
        status,
        relationship_status,
        lifecycle_state,
        lifecycle_changed_at,
        paused_reason,
        churn_reason,
        display_name,
        full_name,
        email,
        phone
      )
      values (
        v_target_workspace_id,
        v_lead.applicant_user_id,
        'active',
        'active',
        'active',
        now(),
        null,
        null,
        nullif(btrim(v_lead.full_name), ''),
        nullif(btrim(v_lead.full_name), ''),
        nullif(lower(btrim(coalesce(v_lead.email, ''))), ''),
        nullif(btrim(coalesce(v_lead.phone, '')), '')
      )
      returning id into v_target_client_id;
    else
      update public.clients c
      set
        workspace_id = v_target_workspace_id,
        status = 'active',
        relationship_status = 'active',
        removed_at = null,
        removed_by_user_id = null,
        lifecycle_state = 'active',
        lifecycle_changed_at = now(),
        paused_reason = null,
        churn_reason = null,
        display_name = coalesce(
          c.display_name,
          nullif(btrim(v_lead.full_name), '')
        ),
        full_name = coalesce(
          c.full_name,
          nullif(btrim(v_lead.full_name), '')
        ),
        email = coalesce(
          c.email,
          nullif(lower(btrim(coalesce(v_lead.email, ''))), '')
        ),
        phone = coalesce(
          c.phone,
          nullif(btrim(coalesce(v_lead.phone, '')), '')
        )
      where c.id = v_target_client_id
        and coalesce(c.relationship_status, 'active') <> 'transferred_out';
    end if;

    perform public.ensure_workspace_client_onboarding(
      v_target_client_id,
      'converted_lead'
    );

    update public.pt_hub_leads lead
    set
      status = 'converted',
      converted_at = coalesce(lead.converted_at, now()),
      converted_workspace_id = v_target_workspace_id,
      converted_client_id = v_target_client_id
    where lead.id = v_lead.id;

    return query
    select
      v_lead.id,
      'converted'::text,
      v_target_workspace_id,
      v_target_client_id;
    return;
  exception
    when others then
      -- SQL exceptions roll back reservation events too. Never swallow admission
      -- failures, or keep a new workspace when its client conversion failed.
      if v_new_workspace or sqlerrm='Account capacity admission failed.' then raise; end if;
      perform public.log_lead_chat_event(
        v_lead.id,
        null,
        v_actor_user_id,
        'lead_workspace_assignment_failed',
        jsonb_build_object(
          'workspace_id', v_target_workspace_id,
          'error', sqlerrm
        )
      );

      if v_was_converted then
        return query
        select
          v_lead.id,
          'converted'::text,
          v_lead.converted_workspace_id,
          v_lead.converted_client_id;
        return;
      end if;

      update public.pt_hub_leads lead
      set
        status = 'approved_pending_workspace',
        converted_workspace_id = v_target_workspace_id,
        converted_client_id = null
      where lead.id = v_lead.id;

      return query
      select
        v_lead.id,
        'approved_pending_workspace'::text,
        v_target_workspace_id,
        null::uuid;
      return;
  end;
end;
$$;

create or replace function public.create_workspace_team_invite(
  p_workspace_id uuid,
  p_email text,
  p_role text default 'assistant_coach',
  p_client_access_mode text default 'assigned_clients_only',
  p_client_ids uuid[] default '{}'::uuid[],
  p_base_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := trim(coalesce(p_role, ''));
  v_client_access_mode text := trim(coalesce(p_client_access_mode, ''));
  v_client_ids uuid[] := coalesce(p_client_ids, '{}'::uuid[]);
  v_distinct_client_ids uuid[];
  v_valid_client_count int;
  v_token text;
  v_token_hash text;
  v_invite public.workspace_member_invites%rowtype;
  v_workspace_name text;
  v_owner_name text;
  v_base_url text := nullif(regexp_replace(trim(coalesce(p_base_url, '')), '/+$', ''), '');
  v_accept_url text;
begin
  if v_actor_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if not public.can_manage_workspace_team(p_workspace_id) then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  if (
    select count(*)
    from public.workspace_member_invites wmi
    where wmi.workspace_id = p_workspace_id
      and wmi.invited_by_user_id = v_actor_user_id
      and wmi.created_at > now() - interval '15 minutes'
  ) >= 20 then
    perform public.workspace_team_operational_error('RATE_LIMITED');
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    perform public.workspace_team_invite_error('INVALID_INVITE_EMAIL');
  end if;

  if v_role not in ('admin', 'coach', 'assistant_coach', 'viewer') then
    perform public.workspace_team_invite_error('INVALID_INVITE_ROLE');
  end if;

  if v_client_access_mode not in ('all_clients', 'assigned_clients_only') then
    perform public.workspace_team_invite_error('INVALID_CLIENT_ACCESS_MODE');
  end if;

  if exists (
    select 1
    from public.workspace_member_invites wmi
    where wmi.workspace_id = p_workspace_id
      and lower(wmi.email) = v_email
      and wmi.status = 'pending'
  ) then
    perform public.record_workspace_team_audit_event(
      p_workspace_id,
      v_actor_user_id,
      'team.duplicate_pending_invite_attempt',
      'workspace_member_invite',
      null,
      v_email,
      jsonb_build_object('role', v_role)
    );
    perform public.workspace_team_invite_error('DUPLICATE_PENDING_INVITE');
  end if;

  if exists (
    select 1
    from auth.users u
    join public.workspace_members wm
      on wm.user_id = u.id
    where wm.workspace_id = p_workspace_id
      and wm.status = 'active'
      and lower(u.email) = v_email
  ) then
    perform public.workspace_team_invite_error('USER_ALREADY_WORKSPACE_MEMBER');
  end if;

  select coalesce(array_agg(distinct client_id), '{}'::uuid[])
  into v_distinct_client_ids
  from unnest(v_client_ids) as client_id
  where client_id is not null;

  if cardinality(v_distinct_client_ids) > 0 then
    select count(*)
    into v_valid_client_count
    from public.clients c
    where c.workspace_id = p_workspace_id
      and c.id = any(v_distinct_client_ids);

    if v_valid_client_count is distinct from cardinality(v_distinct_client_ids) then
      perform public.workspace_team_invite_error('INVALID_CLIENT_ASSIGNMENT');
    end if;
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := public.hash_workspace_team_invite_token(v_token);

  insert into public.workspace_member_invites (
    workspace_id,
    email,
    role,
    client_access_mode,
    token_hash,
    status,
    invited_by_user_id,
    expires_at
  )
  values (
    p_workspace_id,
    v_email,
    v_role,
    v_client_access_mode,
    v_token_hash,
    'pending',
    v_actor_user_id,
    now() + interval '14 days'
  )
  returning * into v_invite;

  insert into public.workspace_invite_client_assignments (
    invite_id,
    workspace_id,
    client_id,
    assigned_by_user_id
  )
  select
    v_invite.id,
    p_workspace_id,
    client_id,
    v_actor_user_id
  from unnest(v_distinct_client_ids) as client_id
  on conflict (invite_id, client_id) do nothing;

  select w.name
  into v_workspace_name
  from public.workspaces w
  where w.id = p_workspace_id;

  select coalesce(pp.display_name, pp.full_name, u.email)
  into v_owner_name
  from auth.users u
  left join public.pt_profiles pp
    on pp.user_id = u.id
  where u.id = v_actor_user_id
  order by pp.updated_at desc nulls last
  limit 1;

  v_accept_url := coalesce(v_base_url, '') || '/team-invites/' || v_token;

  perform public.set_workspace_team_invite_notification_route(
    v_invite.id,
    v_token
  );

  perform public.queue_workspace_team_email(
    p_workspace_id,
    v_invite.id,
    v_email,
    'team_invite_received',
    'workspace_team_invite',
    jsonb_build_object(
      'workspaceName', v_workspace_name,
      'ownerName', v_owner_name,
      'role', v_role,
      'expiresAt', v_invite.expires_at,
      'mustUseEmail', v_email
    ),
    'workspace-team-invite:' || v_invite.id::text || ':created'
  );

  perform public.record_workspace_team_audit_event(
    p_workspace_id,
    v_actor_user_id,
    'team.invite_created',
    'workspace_member_invite',
    v_invite.id,
    v_email,
    jsonb_build_object(
      'role', v_role,
      'clientAccessMode', v_client_access_mode,
      'clientIds', v_distinct_client_ids,
      'clientCount', cardinality(v_distinct_client_ids),
      'expiresAt', v_invite.expires_at,
      'emailQueued', true
    )
  );

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'workspaceId', p_workspace_id,
    'workspaceName', v_workspace_name,
    'invitedEmail', v_email,
    'role', v_role,
    'clientAccessMode', v_client_access_mode,
    'status', v_invite.status,
    'expiresAt', v_invite.expires_at,
    'acceptUrl', v_accept_url,
    'email', jsonb_build_object(
      'to', v_email,
      'subject', coalesce(v_owner_name, 'A coach') || ' invited you to join ' || coalesce(v_workspace_name, 'a RepSync workspace'),
      'text', concat_ws(E'\n\n',
        coalesce(v_owner_name, 'A coach') || ' invited you to join ' || coalesce(v_workspace_name, 'a RepSync workspace') || ' on RepSync as ' || v_role || '.',
        'Accept invite: ' || v_accept_url,
        'This invite expires on ' || v_invite.expires_at::text || '.',
        'You must sign in or create a RepSync account with ' || v_email || ' to accept.'
      )
    )
  );
end;
$$;

create or replace function public.accept_workspace_team_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_token_hash text;
  v_invite public.workspace_member_invites%rowtype;
  v_membership public.workspace_members%rowtype;
  v_owner_user_id uuid;
  v_workspace_name text;
  v_assigned_count integer;
  v_recipient uuid;
begin
  if v_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if nullif(trim(coalesce(p_token, '')), '') is null then
    perform public.workspace_team_invite_error('INVITE_NOT_FOUND');
  end if;

  select lower(email), email_confirmed_at
  into v_user_email, v_email_confirmed_at
  from auth.users
  where id = v_user_id;

  if v_user_email is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if v_email_confirmed_at is null then
    perform public.workspace_team_invite_error('AUTHENTICATED_EMAIL_NOT_VERIFIED');
  end if;

  v_token_hash := public.hash_workspace_team_invite_token(p_token);

  select *
  into v_invite
  from public.workspace_member_invites wmi
  where wmi.token_hash = v_token_hash
  for update;

  if not found then
    perform public.workspace_team_invite_error('INVITE_NOT_FOUND');
  end if;

  if v_invite.status = 'revoked' then
    perform public.record_workspace_team_audit_event(
      v_invite.workspace_id,
      v_user_id,
      'team.invite_revoked_access_attempt',
      'workspace_member_invite',
      v_invite.id,
      v_invite.email,
      '{}'::jsonb
    );
    perform public.workspace_team_invite_error('INVITE_REVOKED');
  end if;

  if v_invite.status <> 'pending' then
    perform public.workspace_team_invite_error('INVITE_NOT_PENDING');
  end if;

  if v_invite.expires_at <= now() then
    update public.workspace_member_invites
    set status = 'expired'
    where id = v_invite.id;

    perform public.record_workspace_team_audit_event(
      v_invite.workspace_id,
      v_user_id,
      'team.invite_expired_access_attempt',
      'workspace_member_invite',
      v_invite.id,
      v_invite.email,
      jsonb_build_object('expiresAt', v_invite.expires_at)
    );
    perform public.workspace_team_invite_error('INVITE_EXPIRED');
  end if;

  if lower(v_invite.email) <> v_user_email then
    if (
      select count(*)
      from public.workspace_audit_events wae
      where wae.workspace_id = v_invite.workspace_id
        and wae.actor_user_id = v_user_id
        and wae.event_type = 'team.invite_email_mismatch_attempt'
        and wae.target_id = v_invite.id
        and wae.created_at > now() - interval '10 minutes'
    ) >= 5 then
      perform public.workspace_team_operational_error('RATE_LIMITED');
    end if;

    perform public.record_workspace_team_audit_event(
      v_invite.workspace_id,
      v_user_id,
      'team.invite_email_mismatch_attempt',
      'workspace_member_invite',
      v_invite.id,
      v_invite.email,
      jsonb_build_object('authenticatedEmail', v_user_email)
    );

    perform public.workspace_team_invite_error('INVITE_EMAIL_MISMATCH');
  end if;

  if exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_invite.workspace_id
      and wm.user_id = v_user_id
      and wm.status = 'active'
  ) then
    perform public.workspace_team_invite_error('USER_ALREADY_WORKSPACE_MEMBER');
  end if;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    status,
    client_access_mode,
    source_invite_id,
    invited_by_user_id,
    joined_at
  )
  values (
    v_invite.workspace_id,
    v_user_id,
    v_invite.role::public.workspace_role,
    'active',
    v_invite.client_access_mode,
    v_invite.id,
    v_invite.invited_by_user_id,
    now()
  )
  on conflict (workspace_id, user_id) do update
  set role = excluded.role,
      status = 'active',
      client_access_mode = excluded.client_access_mode,
      source_invite_id = excluded.source_invite_id,
      invited_by_user_id = excluded.invited_by_user_id,
      joined_at = excluded.joined_at,
      updated_at = now()
  where workspace_members.status <> 'active'
  returning * into v_membership;

  if v_membership.id is null then
    perform public.workspace_team_invite_error('USER_ALREADY_WORKSPACE_MEMBER');
  end if;

  delete from public.workspace_member_client_assignments wmca
  where wmca.workspace_id = v_invite.workspace_id
    and wmca.member_id = v_membership.id;

  insert into public.workspace_member_client_assignments (
    workspace_id,
    member_id,
    client_id,
    assigned_by_user_id
  )
  select
    wica.workspace_id,
    v_membership.id,
    wica.client_id,
    wica.assigned_by_user_id
  from public.workspace_invite_client_assignments wica
  join public.clients c
    on c.id = wica.client_id
   and c.workspace_id = wica.workspace_id
  where wica.invite_id = v_invite.id
  on conflict (workspace_id, member_id, client_id) do nothing;

  get diagnostics v_assigned_count = row_count;

  update public.workspace_member_invites
  set status = 'accepted',
      accepted_by_user_id = v_user_id,
      accepted_at = now()
  where id = v_invite.id;

  select w.owner_user_id, w.name
  into v_owner_user_id, v_workspace_name
  from public.workspaces w
  where w.id = v_invite.workspace_id;

  perform public.record_workspace_team_audit_event(
    v_invite.workspace_id,
    v_user_id,
    'team.invite_accepted',
    'workspace_member',
    v_membership.id,
    v_invite.email,
    jsonb_build_object(
      'inviteId', v_invite.id,
      'role', v_invite.role,
      'clientAccessMode', v_invite.client_access_mode,
      'assignedClientCount', coalesce(v_assigned_count, 0)
    )
  );

  for v_recipient in
    select distinct recipient_id
    from (
      values (v_owner_user_id), (v_invite.invited_by_user_id)
    ) as recipients(recipient_id)
    where recipient_id is not null
      and recipient_id is distinct from v_user_id
  loop
    perform public.notify_workspace_team_user(
      v_invite.workspace_id,
      v_recipient,
      'team_invite_accepted',
      'Workspace invite accepted',
      v_invite.email || ' accepted access to ' || coalesce(v_workspace_name, 'your workspace') || '.',
      '/workspace/' || v_invite.workspace_id::text || '/settings/team',
      'workspace_member',
      v_membership.id,
      jsonb_build_object('role', v_invite.role)
    );
  end loop;

  return jsonb_build_object(
    'workspaceId', v_invite.workspace_id,
    'membershipId', v_membership.id,
    'relation', 'shared',
    'role', v_invite.role,
    'redirectTo', '/pt-hub/workspaces?acceptedWorkspace=' || v_invite.workspace_id::text
  );
end;
$$;

create or replace function public.accept_workspace_team_invite_by_id(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_invite public.workspace_member_invites%rowtype;
  v_membership public.workspace_members%rowtype;
  v_owner_user_id uuid;
  v_workspace_name text;
  v_assigned_count integer;
  v_recipient uuid;
begin
  if v_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  select lower(email), email_confirmed_at
  into v_user_email, v_email_confirmed_at
  from auth.users
  where id = v_user_id;

  if v_user_email is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if v_email_confirmed_at is null then
    perform public.workspace_team_invite_error('AUTHENTICATED_EMAIL_NOT_VERIFIED');
  end if;

  select *
  into v_invite
  from public.workspace_member_invites wmi
  where wmi.id = p_invite_id
  for update;

  if not found then
    perform public.workspace_team_invite_error('INVITE_NOT_FOUND');
  end if;

  if v_invite.status = 'revoked' then
    perform public.workspace_team_invite_error('INVITE_REVOKED');
  end if;

  if v_invite.status <> 'pending' then
    perform public.workspace_team_invite_error('INVITE_NOT_PENDING');
  end if;

  if v_invite.expires_at <= now() then
    update public.workspace_member_invites
    set status = 'expired'
    where id = v_invite.id;
    perform public.workspace_team_invite_error('INVITE_EXPIRED');
  end if;

  if lower(v_invite.email) <> v_user_email then
    perform public.record_workspace_team_audit_event(
      v_invite.workspace_id,
      v_user_id,
      'team.invite_email_mismatch_attempt',
      'workspace_member_invite',
      v_invite.id,
      v_invite.email,
      jsonb_build_object('authenticatedEmail', v_user_email)
    );
    perform public.workspace_team_invite_error('INVITE_EMAIL_MISMATCH');
  end if;

  if exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_invite.workspace_id
      and wm.user_id = v_user_id
      and wm.status = 'active'
  ) then
    perform public.workspace_team_invite_error('USER_ALREADY_WORKSPACE_MEMBER');
  end if;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    status,
    client_access_mode,
    source_invite_id,
    invited_by_user_id,
    joined_at
  )
  values (
    v_invite.workspace_id,
    v_user_id,
    v_invite.role::public.workspace_role,
    'active',
    v_invite.client_access_mode,
    v_invite.id,
    v_invite.invited_by_user_id,
    now()
  )
  on conflict (workspace_id, user_id) do update
  set role = excluded.role,
      status = 'active',
      client_access_mode = excluded.client_access_mode,
      source_invite_id = excluded.source_invite_id,
      invited_by_user_id = excluded.invited_by_user_id,
      joined_at = excluded.joined_at,
      updated_at = now()
  where workspace_members.status <> 'active'
  returning * into v_membership;

  if v_membership.id is null then
    perform public.workspace_team_invite_error('USER_ALREADY_WORKSPACE_MEMBER');
  end if;

  delete from public.workspace_member_client_assignments wmca
  where wmca.workspace_id = v_invite.workspace_id
    and wmca.member_id = v_membership.id;

  insert into public.workspace_member_client_assignments (
    workspace_id,
    member_id,
    client_id,
    assigned_by_user_id
  )
  select
    wica.workspace_id,
    v_membership.id,
    wica.client_id,
    wica.assigned_by_user_id
  from public.workspace_invite_client_assignments wica
  join public.clients c
    on c.id = wica.client_id
   and c.workspace_id = wica.workspace_id
  where wica.invite_id = v_invite.id
  on conflict (workspace_id, member_id, client_id) do nothing;

  get diagnostics v_assigned_count = row_count;

  update public.workspace_member_invites
  set status = 'accepted',
      accepted_by_user_id = v_user_id,
      accepted_at = now()
  where id = v_invite.id;

  select w.owner_user_id, w.name
  into v_owner_user_id, v_workspace_name
  from public.workspaces w
  where w.id = v_invite.workspace_id;

  perform public.record_workspace_team_audit_event(
    v_invite.workspace_id,
    v_user_id,
    'team.invite_accepted',
    'workspace_member',
    v_membership.id,
    v_invite.email,
    jsonb_build_object(
      'inviteId', v_invite.id,
      'role', v_invite.role,
      'clientAccessMode', v_invite.client_access_mode,
      'assignedClientCount', coalesce(v_assigned_count, 0)
    )
  );

  for v_recipient in
    select distinct recipient_id
    from (
      values (v_owner_user_id), (v_invite.invited_by_user_id)
    ) as recipients(recipient_id)
    where recipient_id is not null
      and recipient_id is distinct from v_user_id
  loop
    perform public.notify_workspace_team_user(
      v_invite.workspace_id,
      v_recipient,
      'team_invite_accepted',
      'Workspace invite accepted',
      v_invite.email || ' accepted access to ' || coalesce(v_workspace_name, 'your workspace') || '.',
      '/workspace/' || v_invite.workspace_id::text || '/settings/team',
      'workspace_member',
      v_membership.id,
      jsonb_build_object('role', v_invite.role)
    );
  end loop;

  return jsonb_build_object(
    'workspaceId', v_invite.workspace_id,
    'membershipId', v_membership.id,
    'relation', 'shared',
    'role', v_invite.role,
    'redirectTo', '/pt-hub/workspaces?acceptedWorkspace=' || v_invite.workspace_id::text
  );
end;
$$;

create or replace function public.update_workspace_team_member_status(
  p_workspace_id uuid,
  p_member_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_member public.workspace_members%rowtype;
  v_previous_status text;
  v_next_status text := trim(coalesce(p_status, ''));
  v_event_type text;
  v_notification_type text;
begin
  if v_actor_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if not public.can_manage_workspace_team(p_workspace_id) then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  if v_next_status not in ('active', 'suspended', 'removed') then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  select *
  into v_member
  from public.workspace_members wm
  where wm.id = p_member_id
    and wm.workspace_id = p_workspace_id
  for update;

  if not found then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  if public.normalize_workspace_role(v_member.role::text) = 'owner' then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  v_previous_status := coalesce(v_member.status, 'active');

  if v_previous_status = v_next_status then
    return jsonb_build_object(
      'memberId', p_member_id,
      'workspaceId', p_workspace_id,
      'status', v_next_status
    );
  end if;

  update public.workspace_members
  set status = v_next_status,
      updated_at = now()
  where id = p_member_id
  returning * into v_member;

  v_event_type := case
    when v_next_status = 'suspended' then 'team.member_suspended'
    when v_next_status = 'removed' then 'team.member_removed'
    else 'team.member_reactivated'
  end;
  v_notification_type := case
    when v_next_status = 'suspended' then 'team_member_suspended'
    when v_next_status = 'removed' then 'team_member_removed'
    else 'team_member_reactivated'
  end;

  perform public.record_workspace_team_audit_event(
    p_workspace_id,
    v_actor_user_id,
    v_event_type,
    'workspace_member',
    p_member_id,
    null,
    jsonb_build_object('previousStatus', v_previous_status, 'nextStatus', v_next_status)
  );

  perform public.notify_workspace_team_user(
    p_workspace_id,
    v_member.user_id,
    v_notification_type,
    'Workspace access updated',
    case
      when v_next_status = 'active' then 'Your workspace access is active again.'
      else 'Your access to this workspace is no longer active. Contact the workspace owner if this looks incorrect.'
    end,
    '/pt-hub/workspaces',
    'workspace_member',
    p_member_id,
    jsonb_build_object('previousStatus', v_previous_status, 'nextStatus', v_next_status)
  );

  return jsonb_build_object(
    'memberId', p_member_id,
    'workspaceId', p_workspace_id,
    'status', v_next_status
  );
end;
$$;

revoke insert, update on public.clients from public, anon, authenticated;
grant update (display_name, goal, injuries, equipment, height_cm, dob, tags, created_at, phone, email, location, timezone, unit_preference, gender, training_type, gym_name, photo_url, limitations, updated_at, location_country, days_per_week, current_weight, checkin_template_id, checkin_frequency, checkin_start_date, lifecycle_changed_at, paused_reason, churn_reason, full_name, avatar_url, date_of_birth, sex, height_value, height_unit, weight_value_current, weight_unit, account_onboarding_completed_at, manual_risk_flag, url_key) on public.clients to authenticated;

revoke insert, update on public.workspaces from public, anon, authenticated;
grant update (name, created_at, default_checkin_template_id, logo_url, updated_at, timezone, unit_preference, week_start_day, client_welcome_message, slug, accent_color, client_welcome_title, invite_sender_name) on public.workspaces to authenticated;

revoke insert, update on public.workspace_members from public, anon, authenticated;
grant update (created_at, updated_at, theme_preference, compact_density, client_access_mode, source_invite_id, invited_by_user_id, joined_at) on public.workspace_members to authenticated;

revoke insert, update on public.pt_packages from public, anon, authenticated;
revoke insert, update on public.workspace_member_invites from public, anon, authenticated;

create function public.create_my_pt_package(p_input jsonb)
returns public.pt_packages language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r public.pt_packages;
begin
  if auth.uid() is null or not exists(select 1 from public.pt_profiles where user_id=auth.uid()) then
    raise exception 'PT authentication required.' using errcode='42501';
  end if;
  insert into public.pt_packages(pt_user_id,title,subtitle,description,price_label,currency_code,
    billing_cadence_label,cta_label,features,status,is_public,sort_order)
  values(auth.uid(),p_input->>'title',p_input->>'subtitle',p_input->>'description',p_input->>'price_label',
    p_input->>'currency_code',p_input->>'billing_cadence_label',p_input->>'cta_label',p_input->'features',
    coalesce(p_input->>'status','draft'),coalesce((p_input->>'is_public')::boolean,false),
    coalesce((p_input->>'sort_order')::integer,0)) returning * into r;
  return r;
end;
$$;

create function public.update_my_pt_package(p_package_id uuid,p_input jsonb)
returns public.pt_packages language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r public.pt_packages; patch jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  perform public.lock_capacity_owners(array[auth.uid()]);
  select * into r from public.pt_packages where id=p_package_id and pt_user_id=auth.uid() for update;
  if not found then raise exception 'Package not found' using errcode='42501'; end if;
  -- Explicit allowlist: owner, ID, timestamps and reservation context are never inputs.
  patch:=to_jsonb(r) || coalesce(p_input,'{}'::jsonb);
  update public.pt_packages set title=patch->>'title',subtitle=patch->>'subtitle',
    description=patch->>'description',price_label=patch->>'price_label',currency_code=patch->>'currency_code',
    billing_cadence_label=patch->>'billing_cadence_label',cta_label=patch->>'cta_label',features=patch->'features',
    status=patch->>'status',is_public=(patch->>'is_public')::boolean,sort_order=(patch->>'sort_order')::integer
    where id=r.id returning * into r;
  return r;
end;
$$;

create or replace function public.resend_workspace_team_invite(
  p_workspace_id uuid,
  p_invite_id uuid,
  p_base_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_invite public.workspace_member_invites%rowtype;
  v_token text;
  v_token_hash text;
  v_base_url text := nullif(regexp_replace(trim(coalesce(p_base_url, '')), '/+$', ''), '');
  v_accept_url text;
begin
  if v_actor_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if not public.can_manage_workspace_team(p_workspace_id) then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  select *
  into v_invite
  from public.workspace_member_invites wmi
  where wmi.id = p_invite_id
    and wmi.workspace_id = p_workspace_id
  for update;

  if not found then
    perform public.workspace_team_invite_error('INVITE_NOT_FOUND');
  end if;

  if v_invite.expires_at<=transaction_timestamp() or v_invite.status='expired' then
    perform public.workspace_team_invite_error('INVITE_EXPIRED');
  end if;

  if v_invite.status <> 'pending' then
    perform public.workspace_team_invite_error('INVITE_NOT_PENDING');
  end if;

  if exists (
    select 1
    from public.workspace_team_email_deliveries wted
    where wted.invite_id = v_invite.id
      and wted.notification_type = 'team_invite_received'
      and wted.created_at > now() - interval '1 minute'
  ) then
    perform public.workspace_team_operational_error('RATE_LIMITED');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := public.hash_workspace_team_invite_token(v_token);

  update public.workspace_member_invites
  set token_hash = v_token_hash,
      status = 'pending',
      expires_at = now() + interval '14 days'
  where id = v_invite.id
  returning * into v_invite;

  v_accept_url := coalesce(v_base_url, '') || '/team-invites/' || v_token;

  perform public.set_workspace_team_invite_notification_route(
    v_invite.id,
    v_token
  );

  perform public.queue_workspace_team_email(
    p_workspace_id,
    v_invite.id,
    v_invite.email,
    'team_invite_received',
    'workspace_team_invite',
    jsonb_build_object(
      'expiresAt', v_invite.expires_at,
      'mustUseEmail', v_invite.email
    ),
    'workspace-team-invite:' || v_invite.id::text || ':resent:' || extract(epoch from v_invite.updated_at)::text
  );

  perform public.record_workspace_team_audit_event(
    p_workspace_id,
    v_actor_user_id,
    'team.invite_resent',
    'workspace_member_invite',
    v_invite.id,
    v_invite.email,
    jsonb_build_object('expiresAt', v_invite.expires_at, 'emailQueued', true)
  );

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'workspaceId', p_workspace_id,
    'email', v_invite.email,
    'status', v_invite.status,
    'expiresAt', v_invite.expires_at,
    'acceptUrl', v_accept_url
  );
end;
$$;

revoke all on function public.account_capacity_mutation_error(text,text) from public,anon,authenticated;
revoke all on function public.lock_capacity_owners(uuid[]) from public,anon,authenticated;
revoke all on function public.admit_account_capacity_subject(uuid,text,text) from public,anon,authenticated;
revoke all on function public.capacity_row_subjects(text,jsonb) from public,anon,authenticated;
revoke all on function public.guard_capacity_domain_write() from public,anon,authenticated;
revoke all on function public.consume_capacity_domain_write() from public,anon,authenticated;
revoke all on function public.reactivate_removed_client_relationship_internal(uuid) from public,anon,authenticated;
revoke all on function public.reactivate_removed_client_relationship(uuid) from public,anon;
grant execute on function public.reactivate_removed_client_relationship(uuid) to authenticated;
revoke all on function public.create_workspace(text) from public,anon;
grant execute on function public.create_workspace(text) to authenticated;
revoke all on function public.accept_invite(text) from public,anon;
revoke all on function public.accept_invite(text,text) from public,anon;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.accept_invite(text,text) to authenticated;
revoke all on function public.pt_update_client_lifecycle(uuid,text,text) from public,anon;
revoke all on function public.pt_archive_client_relationship(uuid) from public,anon;
revoke all on function public.pt_transfer_client_relationship(uuid,uuid) from public,anon;
revoke all on function public.pt_hub_approve_lead(uuid,uuid,text,boolean) from public,anon;
revoke all on function public.create_workspace_team_invite(uuid,text,text,text,uuid[],text) from public,anon;
revoke all on function public.accept_workspace_team_invite(text) from public,anon;
revoke all on function public.accept_workspace_team_invite_by_id(uuid) from public,anon;
revoke all on function public.update_workspace_team_member_status(uuid,uuid,text) from public,anon;
revoke all on function public.create_my_pt_package(jsonb) from public,anon;
revoke all on function public.update_my_pt_package(uuid,jsonb) from public,anon;
grant execute on function public.create_my_pt_package(jsonb) to authenticated;
grant execute on function public.update_my_pt_package(uuid,jsonb) to authenticated;

revoke all on function public.account_capacity_subjects(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.resolve_account_capacity(uuid,uuid) from public,anon,authenticated;
revoke all on function public.resend_workspace_team_invite(uuid,uuid,text) from public,anon;
grant execute on function public.resend_workspace_team_invite(uuid,uuid,text) to authenticated;
commit;
