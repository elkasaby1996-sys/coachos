begin;
-- A browser checkout event is only a prompt to read server-confirmed state.
create function public.get_my_paddle_checkout_status_v1(p_transaction text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare checkout public.billing_checkouts_v2%rowtype;
begin
 if auth.uid() is null then raise exception 'BILLING_FORBIDDEN' using errcode='42501';end if;
 if p_transaction is null or p_transaction !~ '^txn_[a-z0-9]{26}$' then raise exception 'BILLING_INVALID_INPUT';end if;
 select c.* into checkout from public.billing_checkouts_v2 c join public.billing_accounts a on a.id=c.billing_account_id
  where a.owner_user_id=auth.uid() and c.provider='paddle' and c.environment=public.billing_paddle_environment_v1()
   and c.provider_transaction_ref=p_transaction;
 if checkout.id is null then return jsonb_build_object('status','unavailable');end if;
 if checkout.status='completed' and exists (
  select 1 from public.billing_payment_applications_v2 p join public.billing_subscriptions_v2 s on s.id=p.subscription_id
   where p.provider='paddle' and p.environment=checkout.environment and p.provider_transaction_ref=p_transaction
    and p.billing_account_id=checkout.billing_account_id and p.application_kind='initial_purchase'
    and s.account_subscription_id is not null and s.reconciliation_status='processed'
 ) then return jsonb_build_object('status','confirmed');end if;
 return jsonb_build_object('status',case when checkout.status in ('failed','expired') then 'failed' else 'pending' end);
end $$;
revoke all on function public.get_my_paddle_checkout_status_v1(text) from public,anon;
grant execute on function public.get_my_paddle_checkout_status_v1(text) to authenticated;
commit;
