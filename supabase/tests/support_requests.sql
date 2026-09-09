begin;
select plan(8);
set local role anon;
select is(public.submit_support_request('00000000-0000-4000-8000-000000009901', 'Support Test', 'support-regression@example.test', '', 'technical', 'This is a regression test for support submissions.'), '00000000-0000-4000-8000-000000009901'::uuid, 'Signed-out users can submit a support request');
select lives_ok($$select public.submit_support_request('00000000-0000-4000-8000-000000009901', 'Support Test', 'support-regression@example.test', '', 'technical', 'This is a regression test for support submissions.')$$, 'An identical retry succeeds');
select throws_ok($$select public.submit_support_request(gen_random_uuid(), 'Test', 'invalid', '', 'technical', 'This message has enough characters.')$$, '22023', 'Please check the form details and try again.', 'Malformed email is rejected');
select throws_ok($$select * from public.support_requests$$, '42501', null, 'Anonymous users cannot read requests');
set local role authenticated;
select throws_ok($$update public.support_requests set status = 'resolved'$$, '42501', null, 'Signed-in users cannot change support requests');
reset role;
select is((select count(*)::int from public.support_requests where email = 'support-regression@example.test'), 1, 'Retry does not create a duplicate');
set local role anon;
do $$begin
  for i in 1..4 loop
    perform public.submit_support_request(gen_random_uuid(), 'Support Test', 'support-regression@example.test', '', 'other', 'Another request for the rate limit regression test.');
  end loop;
end$$;
select throws_ok($$select public.submit_support_request(gen_random_uuid(), 'Support Test', 'support-regression@example.test', '', 'other', 'This request must exceed the hourly submission limit.')$$, 'P0001', 'Too many support requests. Please try again in an hour.', 'Hourly submission limit is enforced');
set local role service_role;
select is((select count(*)::int from public.support_requests where email = 'support-regression@example.test'), 5, 'Service role can retrieve submissions for support operations');
reset role;
select * from finish();
rollback;
