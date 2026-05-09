grant select on public.notification_events to authenticated;
grant all on public.notification_events to service_role;

grant select on public.notification_deliveries to authenticated;
grant all on public.notification_deliveries to service_role;

grant select, insert, update on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
