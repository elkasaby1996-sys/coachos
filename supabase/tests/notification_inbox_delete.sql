begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(4);
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
('00000000-0000-4000-8000-000000000981', 'authenticated', 'authenticated', 'notification-delete-owner@example.test', 'x', now(), now(), now()),
('00000000-0000-4000-8000-000000000982', 'authenticated', 'authenticated', 'notification-delete-other@example.test', 'x', now(), now(), now());
insert into public.notification_events (id, recipient_user_id, actor_type, type, title, body, idempotency_key) values
('00000000-0000-4000-8000-000000000983', '00000000-0000-4000-8000-000000000981', 'system', 'system', 'Deletion policy test', 'Temporary test event', 'notification-delete-rls-event');
insert into public.notification_deliveries (id, event_id, recipient_user_id, channel, status, idempotency_key) values
('00000000-0000-4000-8000-000000000984', '00000000-0000-4000-8000-000000000983', '00000000-0000-4000-8000-000000000981', 'in_app', 'delivered', 'notification-delete-own'),
('00000000-0000-4000-8000-000000000985', '00000000-0000-4000-8000-000000000983', '00000000-0000-4000-8000-000000000982', 'in_app', 'delivered', 'notification-delete-other'),
('00000000-0000-4000-8000-000000000986', '00000000-0000-4000-8000-000000000983', '00000000-0000-4000-8000-000000000981', 'email', 'delivered', 'notification-delete-email');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000981","role":"authenticated"}', true);
with deleted as (delete from public.notification_deliveries where id in ('00000000-0000-4000-8000-000000000984','00000000-0000-4000-8000-000000000985','00000000-0000-4000-8000-000000000986') returning id)
select is((select count(*)::int from deleted), 1, 'Recipient deletes only their in-app delivery');
reset role;
select is((select count(*)::int from public.notification_deliveries where id = '00000000-0000-4000-8000-000000000985'), 1, 'Other recipient delivery survives');
select is((select count(*)::int from public.notification_deliveries where id = '00000000-0000-4000-8000-000000000986'), 1, 'Email delivery history survives');
select is((select count(*)::int from public.notification_events where id = '00000000-0000-4000-8000-000000000983'), 1, 'Shared event survives');
select * from finish();
rollback;
