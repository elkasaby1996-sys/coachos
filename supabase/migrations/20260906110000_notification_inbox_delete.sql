-- Delete only the signed-in recipient's in-app delivery; retain shared events
-- and email/push delivery history.
create policy "Users delete own in-app notifications"
  on public.notification_deliveries
  for delete
  to authenticated
  using ((select auth.uid()) = recipient_user_id and channel = 'in_app');

grant delete on public.notification_deliveries to authenticated;
