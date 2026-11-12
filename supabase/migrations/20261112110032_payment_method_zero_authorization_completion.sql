-- Paddle records card verification as one zero-dollar authorized attempt.
-- This is nonfinancial completion only; all identity, totals, captured-value,
-- item, receipt and payment-application checks remain in the existing function.
begin;
do $patch$
declare definition text;
 old_attempt text := 'or jsonb_array_length(o#>''{financial,payments}'')<>0';
 old_return text := 'return jsonb_build_object(''status'',''completed'');';
begin
 definition:=pg_get_functiondef('public.reconcile_billing_payment_method_preparation_v1(uuid)'::regprocedure);
 if encode(extensions.digest(definition,'sha256'),'hex')<>'b45fa6dc58922407232bcac5a6039f825154487431fddbc40a15e1966089758d'
 then raise exception 'PAYMENT_METHOD_ZERO_AUTH_SCHEMA_DRIFT';end if;
 if (length(definition)-length(replace(definition,old_attempt,'')))/length(old_attempt)<>1
 or (length(definition)-length(replace(definition,old_return,'')))/length(old_return)<>1
 then raise exception 'PAYMENT_METHOD_ZERO_AUTH_SCHEMA_DRIFT';end if;
 definition:=replace(definition,old_attempt,$replacement$
or jsonb_array_length(o#>'{financial,payments}')>1
   or exists(select 1 from jsonb_array_elements(o#>'{financial,payments}') attempt
     where attempt->>'status' is distinct from 'authorized'
      or attempt->>'amount' is distinct from '0'
      or coalesce(attempt->>'attemptReference','')='')$replacement$);
 definition:=replace(definition,old_return,$replacement$
if row.mode='update_only' then
  update public.billing_webhook_events_v2 set processing_status='processed',
    processed_at=coalesce(processed_at,clock_timestamp()),last_error_code=null
   where id=p_event and provider=row.provider and environment=row.environment;
 end if;
 return jsonb_build_object('status','completed');$replacement$);
 execute definition;
end $patch$;
commit;
