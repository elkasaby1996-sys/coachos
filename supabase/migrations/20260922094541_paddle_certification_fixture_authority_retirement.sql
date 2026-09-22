-- PADDLE-CERT-FIXTURE-02: remove temporary authority, retain audit evidence.
begin;

-- Serialize the precondition with any in-flight fixture writes. A timeout or
-- unexpected open fixture blocks deployment; never repair evidence here.
set local lock_timeout = '10s';
lock table public.billing_paddle_checkout_certification_fixtures in access exclusive mode;
do $$
begin
  if exists (
    select 1 from public.billing_paddle_checkout_certification_fixtures
    where closed_at is null
  ) then
    raise exception 'PADDLE_CERTIFICATION_OPEN_FIXTURE_BLOCKS_RETIREMENT';
  end if;
end
$$;

drop function public.create_paddle_checkout_certification_fixture_v1(uuid,text,text,integer,uuid);
drop function public.close_paddle_checkout_certification_fixture_v1(uuid);
drop function public.billing_paddle_certification_gate_v1(uuid);

-- No table, row, trigger, RLS, ACL, policy, or Auth metadata changes.
commit;
