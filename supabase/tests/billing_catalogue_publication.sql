begin;
select no_plan();
set local client_min_messages=warning;
\ir fixtures/billing_catalogue_fixture.psql
\ir fixtures/billing_v2_legacy_seed.psql
\ir fixtures/billing_cross_ledger_helpers.psql

create function pg_temp.structural_catalogue() returns boolean language plpgsql as $$
begin
  perform pg_temp.mapping(k,c,'test','synthetic/structural/'||k||'/'||c)
  from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
  return public.validate_paddle_catalogue_v1('test');
end $$;
select throws_ok($$select pg_temp.structural_catalogue()$$,'P0001','BILLING_CATALOGUE_EVIDENCE_REQUIRED','even eight active structural mappings cannot satisfy verified completeness');

create temp table catalogue_before as select
  (select jsonb_agg(to_jsonb(s) order by id) from account_subscriptions s) canonical,
  (select jsonb_agg(to_jsonb(s) order by id) from billing_provider_subscriptions s) legacy,
  (select jsonb_agg(resolve_account_entitlements(id)-'computedAt' order by id) from billing_accounts) entitlements,
  (select to_jsonb(p) from billing_runtime_policy p) policy;
create temp table catalogue_cases as select k,cad,pg_temp.catalogue(k,cad) proof
from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) cad;
create temp table catalogue_results(k text,cad text,e jsonb,m uuid);
grant select on catalogue_cases,catalogue_vector to service_role;
grant select,insert on catalogue_results to service_role;

select throws_ok($$select validate_paddle_catalogue_v1('test')$$,'P0001','BILLING_CATALOGUE_INCOMPLETE','empty catalogue is incomplete');
select throws_ok($$select validate_paddle_catalogue_v1('live')$$,'P0001','BILLING_CATALOGUE_ENVIRONMENT','live publication is unavailable');
set local role service_role;
insert into catalogue_results(k,cad,e) select k,cad,record_verified_paddle_catalogue_v1(proof) from catalogue_cases;
reset role;
select is((select count(*) from billing_catalogue_evidence_v1),8::bigint,'eight distinct verified prices retained');
select ok((select bool_and(not payment_authority) from billing_catalogue_evidence_v1),'catalogue never payment authority');
select is(record_verified_paddle_catalogue_v1(pg_temp.catalogue())->>'reused','true','same verified observation deduplicates');
select throws_ok($$select record_verified_paddle_catalogue_v1(jsonb_set(pg_temp.catalogue(),'{catalogue,unitAmountMinor}','1901'))$$,
 'P0001','BILLING_CATALOGUE_REPLAY_CONFLICT','conflicting duplicate cannot replace evidence');
select lives_ok($$select record_verified_paddle_catalogue_v1(pg_temp.catalogue('launch','monthly','live'))$$,'live evidence retention is isolated');
select is((select count(*) from billing_catalogue_evidence_v1 where environment='live'),1::bigint,'same price/reference live has independent replay identity');
select throws_ok($$select pg_temp.catalogue_draft(pg_temp.catalogue('launch','monthly','live'))$$,'P0001','BILLING_CATALOGUE_ENVIRONMENT','live evidence cannot publish sandbox mapping');

-- Every adverse vector gets a separate observation identity, to reach the
-- publication validator rather than merely trip replay conflict protection.
create function pg_temp.bad_catalogue(patch jsonb) returns uuid language plpgsql as $$
declare p jsonb:=pg_temp.catalogue();
begin
  p:=p||jsonb_build_object('verificationRef','synthetic/adverse/'||gen_random_uuid(),
    'catalogue',(p->'catalogue')||patch);
  return pg_temp.catalogue_draft(p);
end $$;
select throws_like($$select pg_temp.bad_catalogue('{"unitAmountMinor":1901}')$$,'BILLING_%','wrong amount rejected');
select throws_like($$select pg_temp.bad_catalogue('{"currency":"EUR"}')$$,'BILLING_%','wrong currency rejected');
select throws_like($$select pg_temp.bad_catalogue('{"cadence":"annual"}')$$,'BILLING_%','wrong cadence rejected');
select throws_like($$select pg_temp.bad_catalogue('{"recurrenceCount":2}')$$,'BILLING_%','wrong recurrence rejected');
select throws_like($$select pg_temp.bad_catalogue('{"trial":{"unit":"day","count":7}}')$$,'BILLING_%','trial rejected');
select throws_like($$select pg_temp.bad_catalogue('{"priceStatus":"archived"}')$$,'BILLING_%','archived price rejected');
select throws_like($$select pg_temp.bad_catalogue('{"productStatus":"archived"}')$$,'BILLING_%','archived product rejected');
select throws_like($$select pg_temp.bad_catalogue('{"quantity":{"minimum":2,"maximum":10}}')$$,'BILLING_%','quantity cannot require extra base units or offset seats');
select throws_like($$select pg_temp.bad_catalogue('{"identityKind":"addon"}')$$,'query returned no rows','plan version cannot be used as addon');
select throws_like($$select pg_temp.catalogue_draft(jsonb_set(pg_temp.catalogue('coach-seat'),'{catalogue,identityKind}','"plan"'))$$,'BILLING_%','addon cannot masquerade as plan');
select throws_ok($$select draft_paddle_catalogue_mapping_v1(gen_random_uuid(),repeat('0',64))$$,'P0001','BILLING_CATALOGUE_EVIDENCE_REQUIRED','unknown evidence rejected');
select throws_ok($$select draft_paddle_catalogue_mapping_v1((select (e->>'id')::uuid from catalogue_results limit 1),repeat('0',64))$$,'P0001','BILLING_CATALOGUE_EVIDENCE_REQUIRED','wrong digest rejected');
select throws_ok($$select record_verified_paddle_catalogue_v1(pg_temp.catalogue()||'{"rawPayload":{}}')$$,'P0001','BILLING_PROOF_INVALID','unknown top-level field rejected');
select throws_ok($$select record_verified_paddle_catalogue_v1(jsonb_set(pg_temp.catalogue(),'{catalogue,extra}','true'))$$,'P0001','BILLING_PROOF_INVALID','unknown nested field rejected');
select throws_ok($$select record_verified_paddle_catalogue_v1(pg_temp.catalogue()-'verificationRef')$$,'P0001','BILLING_PROOF_INVALID','missing identity rejected');
select throws_ok($$select record_verified_paddle_catalogue_v1(jsonb_set(pg_temp.catalogue(),'{validator}','"structure-only-v1"'))$$,'P0001','BILLING_CATALOGUE_INVALID','structural evidence cannot become verified catalogue');
select throws_ok($$select record_verified_paddle_catalogue_v1(jsonb_set(pg_temp.catalogue(),'{provider}','"lemon_squeezy"'))$$,'P0001','BILLING_CATALOGUE_INVALID','wrong provider rejected');

-- Service can execute each narrow function but cannot inspect or mutate tables.
set local role service_role;
select lives_ok($$select draft_paddle_catalogue_mapping_v1((e->>'id')::uuid,e->>'digest') from catalogue_results$$,'service creates all eight drafts');
select throws_ok($$select * from billing_catalogue_evidence_v1$$,'42501','permission denied for table billing_catalogue_evidence_v1','service has no generic evidence table access');
select throws_ok($$update billing_price_mappings set status='active'$$,'42501','permission denied for table billing_price_mappings','service cannot bypass publication via direct DML');
reset role;
update catalogue_results r set m=b.id from billing_price_mappings b where b.canonical_key=r.k and b.cadence=r.cad;
select lives_ok($$select draft_paddle_catalogue_mapping_v1((e->>'id')::uuid,e->>'digest') from catalogue_results$$,'same draft refresh is idempotent');
select throws_ok($$select pg_temp.bad_catalogue('{"productRef":"synthetic/other-product"}')$$,'P0001','BILLING_CATALOGUE_PRICE_CLAIMED','product mismatch cannot repurpose price');
select throws_ok($$select pg_temp.catalogue_draft(jsonb_set(pg_temp.catalogue('growth')||'{"verificationRef":"synthetic/duplicate-price"}', '{catalogue,priceRef}','"synthetic/price/launch/monthly"'))$$,
 'P0001','BILLING_CATALOGUE_PRICE_CLAIMED','duplicate price cannot be assigned to another canonical pair');
select throws_ok($$select activate_paddle_catalogue_mapping_v1(m,null,null) from catalogue_results limit 1$$,'P0001','BILLING_CATALOGUE_EVIDENCE_REQUIRED','activation without evidence rejected');
select throws_ok($$select activate_paddle_catalogue_mapping_v1(m,(e->>'id')::uuid,repeat('0',64)) from catalogue_results limit 1$$,'P0001','BILLING_CATALOGUE_EVIDENCE_REQUIRED','activation digest independently checked');
select throws_ok($$select activate_paddle_catalogue_mapping_v1(m,(select (e->>'id')::uuid from catalogue_results where k='growth' and cad='monthly'),e->>'digest') from catalogue_results where k='launch' and cad='monthly'$$,'P0001','BILLING_CATALOGUE_EVIDENCE_REQUIRED','cross-price evidence identity rejected');
set local role service_role;
select lives_ok($$select activate_paddle_catalogue_mapping_v1(m,(e->>'id')::uuid,e->>'digest') from catalogue_results where not(k='coach-seat' and cad='annual')$$,'first seven exact pairs activate');
select throws_ok($$select validate_paddle_catalogue_v1('test')$$,'P0001','BILLING_CATALOGUE_INCOMPLETE','seven pairs never satisfy completeness');
select lives_ok($$select activate_paddle_catalogue_mapping_v1(m,(e->>'id')::uuid,e->>'digest') from catalogue_results where k='coach-seat' and cad='annual'$$,'eighth exact pair activates');
select is(validate_paddle_catalogue_v1('test'),true,'exactly eight verified pairs complete');
reset role;
select is((select count(*) from billing_price_mappings where status='active'),8::bigint,'exact active cardinality');
select is((select count(distinct provider_price_ref) from billing_price_mappings where status='active'),8::bigint,'no repeated provider price');
select ok((select bool_and(unit_amount_minor=case canonical_key when 'launch' then 1900 when 'growth' then 5900 when 'scale' then 11900 else 1200 end * case cadence when 'annual' then 10 else 1 end) from billing_price_mappings),'all eight amounts exact');
select throws_ok($$update billing_price_mappings set provider_price_ref='synthetic/reassigned' where canonical_key='launch' and cadence='monthly'$$,'P0001','BILLING_V2_MAPPING_IMMUTABLE','active identity immutable');
select throws_ok($$update billing_catalogue_evidence_v1 set proof=proof||'{"changed":true}'$$,'P0001','BILLING_V2_IDENTITY_IMMUTABLE','evidence update denied');
select throws_ok($$delete from billing_catalogue_evidence_v1$$,'P0001','BILLING_V2_HISTORY_IMMUTABLE','evidence deletion denied');
select throws_ok($$truncate billing_catalogue_evidence_v1 cascade$$,'P0001','BILLING_V2_HISTORY_IMMUTABLE','evidence truncation denied');
set local role service_role;
select lives_ok($$select retire_paddle_catalogue_mapping_v1(m) from catalogue_results where k='launch' and cad='monthly'$$,'service retires mapping');
select lives_ok($$select retire_paddle_catalogue_mapping_v1(m) from catalogue_results where k='launch' and cad='monthly'$$,'retirement retry idempotent');
select throws_ok($$select validate_paddle_catalogue_v1('test')$$,'P0001','BILLING_CATALOGUE_INCOMPLETE','retirement removes pair from new-sale completeness');
select throws_ok($$select activate_paddle_catalogue_mapping_v1(m,(e->>'id')::uuid,e->>'digest') from catalogue_results where k='launch' and cad='monthly'$$,'P0001','BILLING_CATALOGUE_NOT_DRAFT','retired mapping cannot reactivate');
select throws_ok($$select draft_paddle_catalogue_mapping_v1((e->>'id')::uuid,e->>'digest') from catalogue_results where k='launch' and cad='monthly'$$,'P0001','BILLING_CATALOGUE_NOT_DRAFT','retired price cannot be reassigned');
reset role;
select lives_ok($$select pg_temp.catalogue_publish(jsonb_set(pg_temp.catalogue(),'{catalogue,priceRef}','"synthetic/replacement/launch-monthly"'))$$,'new verified price can replace retired mapping');
select is(validate_paddle_catalogue_v1('test'),true,'replacement restores eight active pairs');
select is((select count(*) from billing_price_mappings where status='retired'),1::bigint,'retired history retained');
select throws_like($$select pg_temp.catalogue_publish(jsonb_set(pg_temp.catalogue(),'{catalogue,priceRef}','"synthetic/duplicate-active/launch"'))$$,
 'duplicate key value violates unique constraint "billing_v2_active_price"','duplicate active canonical pair rejected');

set local role anon;
select throws_ok($$select record_verified_paddle_catalogue_v1('{}')$$,'42501','permission denied for function record_verified_paddle_catalogue_v1','anonymous evidence write denied');
select throws_ok($$select validate_paddle_catalogue_v1('test')$$,'42501','permission denied for function validate_paddle_catalogue_v1','anonymous private read denied');
reset role;
set local role authenticated;
select throws_ok($$select draft_paddle_catalogue_mapping_v1(gen_random_uuid(),'x')$$,'42501','permission denied for function draft_paddle_catalogue_mapping_v1','browser publication denied');
select throws_ok($$insert into billing_catalogue_evidence_v1(proof) values('{}')$$,'42501','permission denied for table billing_catalogue_evidence_v1','browser direct evidence DML denied');
reset role;
-- Even accidental EXECUTE exposure cannot replace the independent DB-role check.
grant execute on function public.record_verified_paddle_catalogue_v1(jsonb) to authenticated;
set local role authenticated;
set local request.jwt.claim.role='service_role';
select throws_ok($$select record_verified_paddle_catalogue_v1('{}')$$,'42501','BILLING_CATALOGUE_FORBIDDEN','caller-editable JWT role cannot impersonate service');
reset role;
revoke execute on function public.record_verified_paddle_catalogue_v1(jsonb) from authenticated;
select ok((select relrowsecurity from pg_class where oid='billing_catalogue_evidence_v1'::regclass),'RLS enabled');
select ok((select bool_and(not has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute')) from pg_proc p where proname in ('billing_catalogue_validate_v1','billing_catalogue_authorize_v1','billing_catalogue_assert_mapping_v1','record_verified_paddle_catalogue_v1','draft_paddle_catalogue_mapping_v1','activate_paddle_catalogue_mapping_v1','retire_paddle_catalogue_mapping_v1','validate_paddle_catalogue_v1')),'all helpers and entry points deny clients');
select ok((select bool_and(p.proconfig=array['search_path=pg_catalog, public']) from pg_proc p where proname in ('billing_catalogue_validate_v1','billing_catalogue_authorize_v1','billing_catalogue_assert_mapping_v1','record_verified_paddle_catalogue_v1','draft_paddle_catalogue_mapping_v1','activate_paddle_catalogue_mapping_v1','retire_paddle_catalogue_mapping_v1','validate_paddle_catalogue_v1')),'fixed search paths');
select is((select jsonb_agg(to_jsonb(s) order by id) from account_subscriptions s),(select canonical from catalogue_before),'canonical rows unchanged');
select is((select jsonb_agg(to_jsonb(s) order by id) from billing_provider_subscriptions s),(select legacy from catalogue_before),'LS rows unchanged');
select is((select jsonb_agg(resolve_account_entitlements(id)-'computedAt' order by id) from billing_accounts),(select entitlements from catalogue_before),'canonical entitlement outputs unchanged');
select is((select to_jsonb(p) from billing_runtime_policy p),(select policy from catalogue_before),'Paddle flags and policy unchanged');
select ok((select not paddle_sales_enabled and not paddle_reconciliation_enabled from billing_runtime_policy),'Paddle sales and reconciliation disabled');
select is((select count(*) from billing_payment_applications_v2),0::bigint,'no payment application created');
select is((select count(*) from billing_subscriptions_v2),0::bigint,'no canonical linkage or seat approval possible');
select * from finish();
rollback;
