-- Forward-only correction: subscription state remains positive; authenticated
-- immediate plan settlements may describe source removal plus target addition.
-- Patch only these effective functions, retaining their OIDs, ACLs, security
-- mode and search_path. Every replacement asserts the expected prior shape.
begin;
do $migration$
declare body text; needle text; replacement text;
begin
 body := replace(pg_get_functiondef('public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)'::regprocedure), chr(13), '');
 needle := 'supersede boolean:=false; old_cid uuid; old_sid uuid; transition_at timestamptz;';
 if (length(body)-length(replace(body,needle,'')))/length(needle) <> 1 then raise exception 'PADDLE_PRORATION_MIGRATION_SHAPE'; end if;
 body := replace(body,needle,needle || E'\n plan_delta boolean:=false;');

 needle := 'if public.billing_v2_proof_money(item->''quantity'') not between 1 and 2147483647';
 replacement := $patch$if (case when kind='transaction.completed' and o ? 'planChangeOperationId' and o->>'origin'='subscription_update' then
    -- Structural retention only: no zero, fractions, strings or unbounded values.
    jsonb_typeof(item->'quantity') is distinct from 'number'
    or (item->>'quantity') !~ '^-?[1-9][0-9]{0,9}$'
    or abs((item->>'quantity')::numeric)>2147483647
   else public.billing_v2_proof_money(item->'quantity') not between 1 and 2147483647 end)$patch$;
 if (length(body)-length(replace(body,needle,'')))/length(needle) <> 1 then raise exception 'PADDLE_PRORATION_MIGRATION_SHAPE'; end if;
 body := replace(body,needle,replacement);

 needle := '-- Unknown/mismatched items are retained as manual-review evidence only.';
 replacement := $patch$-- Only an existing same-account/subscription operation admits multiple plan
 -- mappings at retention. Initial checkouts never enter this branch. Signs and
 -- exact source/target membership are independently checked by settlement SQL.
 plan_delta := coalesce(kind='transaction.completed' and o->>'origin'='subscription_update'
  and o ? 'planChangeOperationId' and not found_checkout and exists (
   select 1 from public.billing_operations_v2 op
   where op.operation_id::text=o->>'planChangeOperationId'
    and op.provider='paddle' and op.environment='test' and op.operation_kind='plan_change'
    and op.billing_account_id=account and op.subscription_id=sub.id
    and op.effective_timing='immediate' and op.source_cadence=op.target_cadence
    and op.source_additional_seats=0 and op.target_additional_seats=0),false);
 -- Unknown/mismatched items are retained as manual-review evidence only.$patch$;
 if (length(body)-length(replace(body,needle,'')))/length(needle) <> 1 then raise exception 'PADDLE_PRORATION_MIGRATION_SHAPE'; end if;
 body := replace(body,needle,replacement);

 needle := 'or mapping.identity_kind=any(roles)';
 if (length(body)-length(replace(body,needle,'')))/length(needle) <> 1 then raise exception 'PADDLE_PRORATION_MIGRATION_SHAPE'; end if;
 body := replace(body,needle,'or (mapping.identity_kind=any(roles) and not (plan_delta and mapping.identity_kind=''plan''))');
 needle := 'or (mapping.identity_kind=''plan'' and (item->>''quantity'')::int<>1)';
 replacement := $patch$or (mapping.identity_kind='plan' and not plan_delta and (item->>'quantity')::int<>1)
   or (plan_delta and (mapping.identity_kind<>'plan' or item->>'productRef' is distinct from mapping.provider_product_ref::text))$patch$;
 if (length(body)-length(replace(body,needle,'')))/length(needle) <> 1 then raise exception 'PADDLE_PRORATION_MIGRATION_SHAPE'; end if;
 body := replace(body,needle,replacement);
 execute body;

 body := replace(pg_get_functiondef('public.billing_paddle_plan_facts_v1(uuid,uuid,uuid)'::regprocedure), chr(13), '');
 needle := 'm public.billing_price_mappings%rowtype;';
 if (length(body)-length(replace(body,needle,'')))/length(needle) <> 1 then raise exception 'PADDLE_PRORATION_MIGRATION_SHAPE'; end if;
 body := replace(body,needle,needle || ' source_mapping public.billing_price_mappings%rowtype; source_item jsonb;');
 needle := 'if p_transaction_event is not null then';
 replacement := $patch$if p_transaction_event is not null then
  select * into source_mapping from public.billing_price_mappings where id=op.source_base_mapping_id for share;
  if source_mapping.id is null or source_mapping.id=m.id
   or source_mapping.provider<>'paddle' or source_mapping.environment<>'test'
   or source_mapping.identity_kind<>'plan' or source_mapping.status not in ('active','retired')
   or source_mapping.catalogue_evidence_id is null or source_mapping.verification_sha256 is null
   or source_mapping.cadence<>op.source_cadence or source_mapping.currency_code<>'USD'
   or source_mapping.plan_version_id is distinct from a.plan_version_id
   or op.effective_timing<>'immediate' or m.unit_amount_minor<=source_mapping.unit_amount_minor
  then raise exception 'PADDLE_PLAN_PAYMENT'; end if;
  source_item := jsonb_build_object('priceRef',source_mapping.provider_price_ref,
   'productRef',source_mapping.provider_product_ref,'quantity',-1,
   'unitPrice',jsonb_build_object('amount',source_mapping.unit_amount_minor::text,'currency','USD'));$patch$;
 if (length(body)-length(replace(body,needle,'')))/length(needle) <> 1 then raise exception 'PADDLE_PRORATION_MIGRATION_SHAPE'; end if;
 body := replace(body,needle,replacement);
 needle := 'or tx->''items'' is distinct from jsonb_build_array(row_item-''status'')';
 replacement := $patch$-- Provider transaction delta differs from the current subscription item.
  -- Exact objects, two distinct mappings and length two enforce multiplicity;
  -- containment is order independent and rejects extra or duplicated lines.
  or jsonb_typeof(tx->'items') is distinct from 'array'
  or jsonb_array_length(tx->'items')<>2
  or (tx->'items' @> jsonb_build_array(row_item-'status',source_item)) is not true$patch$;
 if (length(body)-length(replace(body,needle,'')))/length(needle) <> 1 then raise exception 'PADDLE_PRORATION_MIGRATION_SHAPE'; end if;
 body := replace(body,needle,replacement);
 execute body;
end $migration$;
commit;
