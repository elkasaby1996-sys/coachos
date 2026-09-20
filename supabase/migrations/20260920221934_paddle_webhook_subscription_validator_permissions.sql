-- Deferred constraints run after the ingestion SECURITY DEFINER has returned.
-- Keep the validator trigger-only and retain its read/check body and fixed path.
begin;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid='public.billing_v2_validate_item_set()'::regprocedure
      and r.rolname in ('postgres','supabase_admin')
      and p.proowner=(select proowner from pg_proc
        where oid='public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)'::regprocedure)
  ) then
    raise exception 'BILLING_V2_VALIDATOR_OWNER_UNTRUSTED';
  end if;
end $$;

alter function public.billing_v2_validate_item_set() security definer;
revoke all on function public.billing_v2_validate_item_set() from public,anon,authenticated,service_role;

commit;
