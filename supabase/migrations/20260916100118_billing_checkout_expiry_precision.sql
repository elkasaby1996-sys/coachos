-- Provider normalization may change fractional seconds, never the expiry second.
alter table public.billing_checkout_attempts
  drop constraint billing_checkout_attempts_check6,
  add constraint billing_checkout_attempts_check6 check (
    status <> 'ready' or (
      provider_checkout_id is not null
      and provider_expires_at is not null
      and floor(extract(epoch from provider_expires_at)) =
          floor(extract(epoch from expected_expires_at))
    )
  );

-- CREATE OR REPLACE preserves the existing service-only grants. Keep all lease,
-- environment and status checks; record the actual provider timestamp unchanged.
create or replace function public.complete_billing_checkout_attempt(
  p_attempt uuid, p_environment text, p_lease timestamptz,
  p_checkout_id text, p_url text, p_expires_at timestamptz
)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update public.billing_checkout_attempts
    set status='ready', provider_checkout_id=p_checkout_id,
        provider_checkout_url=p_url, provider_expires_at=p_expires_at, updated_at=now()
    where id=p_attempt and environment=p_environment and status='creating'
      and creation_lease_expires_at=p_lease and creation_lease_expires_at>now()
      and floor(extract(epoch from expected_expires_at)) =
          floor(extract(epoch from p_expires_at));
  if not found then raise exception 'BILLING_CHECKOUT_CREATION_AMBIGUOUS'; end if;
end $$;
