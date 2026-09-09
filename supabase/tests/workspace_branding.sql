begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(10);
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
('00000000-0000-4000-8000-000000000971', 'authenticated', 'authenticated', 'branding-owner@example.test', 'x', now(), now(), now()),
('00000000-0000-4000-8000-000000000972', 'authenticated', 'authenticated', 'branding-other@example.test', 'x', now(), now(), now());
insert into public.workspaces (id, name, owner_user_id, slug, accent_color, invite_sender_name, client_welcome_title)
values ('00000000-0000-4000-8000-000000000973', 'Branding test', '00000000-0000-4000-8000-000000000971', 'branding-regression-test', '#007f86', 'Test coach', 'Welcome aboard');
insert into public.invites (workspace_id, created_by_user_id, code, token, role, max_uses, uses, expires_at)
values ('00000000-0000-4000-8000-000000000973', '00000000-0000-4000-8000-000000000971', 'BRANDTEST', 'branding-test-token', 'client', 1, 0, now() + interval '1 day');

select throws_ok($$update public.workspaces set accent_color = 'red; background: black' where id = '00000000-0000-4000-8000-000000000973'$$, '23514', null, 'Invalid accent is rejected by database');
select throws_ok($$update public.workspaces set invite_sender_name = E'Coach\nBcc: test' where id = '00000000-0000-4000-8000-000000000973'$$, '23514', null, 'Sender header injection is rejected');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000972","role":"authenticated"}', true);
with changed as (update public.workspaces set accent_color = '#ff0000' where id = '00000000-0000-4000-8000-000000000973' returning id)
select is((select count(*)::int from changed), 0, 'Another account cannot change workspace branding');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('workspace_branding', '00000000-0000-4000-8000-000000000973/blocked.png')$$, '42501', null, 'Another account cannot upload this workspace logo');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000971","role":"authenticated"}', true);
select lives_ok($$insert into storage.objects (bucket_id, name) values ('workspace_branding', '00000000-0000-4000-8000-000000000973/allowed.png')$$, 'Owner can upload a workspace logo');
with changed as (update public.workspaces set accent_color = '#112233' where id = '00000000-0000-4000-8000-000000000973' returning id)
select is((select count(*)::int from changed), 1, 'Owner can update branding');
reset role;
set local role anon;
select is(public.workspace_invite_branding('branding-test-token')->>'invite_sender_name', 'Test coach', 'Valid invite exposes sender identity');
select is(public.workspace_invite_branding('missing-branding-token'), null::jsonb, 'Invalid invite exposes no branding');
reset role;
update public.invites set expires_at = now() - interval '1 hour' where token = 'branding-test-token';
select is(public.workspace_invite_branding('branding-test-token'), null::jsonb, 'Expired invite exposes no branding');
insert into public.workspace_team_email_deliveries (workspace_id, recipient_email, notification_type, template_key, idempotency_key)
values ('00000000-0000-4000-8000-000000000973', 'test@example.test', 'team_invite_received', 'workspace_team_invite', 'branding-test-email');
select is((select template_model->>'senderName' || ':' || (template_model->>'senderMode') from public.workspace_team_email_deliveries where idempotency_key = 'branding-test-email'), 'Test coach:platform_no_reply', 'Queued invitations snapshot the custom name and no-reply mode');
select * from finish();
rollback;
