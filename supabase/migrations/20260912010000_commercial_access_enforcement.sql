begin;

-- Commercial decisions never replace role/domain authorization. All clocks use
-- the transaction timestamp through the existing canonical entitlement resolver.
create function public.is_commercial_action_allowed(p_mode text, p_action text)
returns boolean language plpgsql immutable set search_path=pg_catalog,public as $$
begin
  if p_action is null or p_action <> all(array['billing_manage','account_security','data_export','remediation','workspace_read','delivery_write','business_configuration_write','acquisition_write','capacity_growth','client_self_service','client_coached_read','client_coached_write']) then
    raise exception 'ACCOUNT_ACCESS_ACTION_NOT_ALLOWED' using errcode='22023';
  end if;
  if p_mode is null or p_mode <> all(array['onboarding','full','existing_delivery_only','read_only','none']) then return false; end if;
  if p_action=any(array['billing_manage','account_security','data_export','remediation','client_self_service','client_coached_read']) then return true; end if;
  if p_mode='full' then return true; end if;
  if p_action='workspace_read' then return p_mode in ('existing_delivery_only','read_only'); end if;
  return p_mode='existing_delivery_only' and p_action in ('delivery_write','client_coached_write');
end $$;

create function public.resolve_account_commercial_access(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare a uuid; s jsonb; m text; reason text; until_at timestamptz; actions jsonb;
begin
  select id into a from public.billing_accounts where owner_user_id=p_owner;
  s:=public.resolve_account_entitlements(a)->'subscription';
  m:=s->>'accessMode'; reason:=s->>'effectiveStatus';
  if m is null or m not in ('onboarding','full','existing_delivery_only','read_only','none')
    or (m='onboarding' and exists(select 1 from public.workspaces where owner_user_id=p_owner)) then
    m:='read_only'; reason:='owner_recovery_required';
  end if;
  until_at:=case reason when 'trialing' then (s->>'trialEndsAt')::timestamptz
    when 'trial_recovery' then (s->>'trialRecoveryEndsAt')::timestamptz
    else (s->>'currentPeriodEndsAt')::timestamptz end;
  select jsonb_object_agg(k,public.is_commercial_action_allowed(m,k)) into actions
  from unnest(array['billing_manage','account_security','data_export','remediation','workspace_read','delivery_write','business_configuration_write','acquisition_write','capacity_growth','client_self_service','client_coached_read','client_coached_write']) k;
  return jsonb_build_object('schemaVersion',1,'accessMode',m,'reason',reason,'effectiveUntil',until_at,
    'actions',actions,'canManageBilling',true,'recoveryRequired',m<>'full' or reason='past_due',
    'recoveryAction',case when reason='owner_recovery_required' then 'contact_support' when m='full' and reason<>'past_due' then 'none' when m='onboarding' then 'start_trial' else 'review_billing' end,
    'recoveryPath',case when reason='owner_recovery_required' then '/contact' else '/pt-hub/settings/billing' end,'computedAt',transaction_timestamp());
end $$;

create function public.assert_commercial_action_allowed(p_owner uuid,p_action text,p_workspace uuid default null,p_client uuid default null)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare r jsonb; code text; audience text;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  -- Resolve audience only after a domain access check; never disclose a foreign
  -- owner's subscription to an unauthorized caller.
  if p_client is not null and exists(select 1 from public.clients where id=p_client and user_id=auth.uid()) then audience:='client';
  elsif p_owner=auth.uid() then audience:='owner';
  elsif p_workspace is not null and public.can_access_workspace(p_workspace) then audience:='team';
  else raise exception 'Access denied.' using errcode='42501'; end if;
  r:=public.resolve_account_commercial_access(p_owner);
  if public.is_commercial_action_allowed(r->>'accessMode',p_action) then return; end if;
  code:=case audience when 'client' then 'CLIENT_COACHING_INTERACTION_UNAVAILABLE' when 'team' then 'WORKSPACE_COMMERCIAL_ACCESS_UNAVAILABLE'
    else case when r->>'reason'='owner_recovery_required' then 'ACCOUNT_ACCESS_OWNER_RECOVERY_REQUIRED'
      when r->>'accessMode'='existing_delivery_only' then 'ACCOUNT_ACCESS_EXISTING_DELIVERY_ONLY'
      when r->>'accessMode'='read_only' then 'ACCOUNT_ACCESS_READ_ONLY'
      when r->>'accessMode'='none' then 'ACCOUNT_ACCESS_EXPIRED'
      when r->>'accessMode'='onboarding' then 'ACCOUNT_ACCESS_ONBOARDING_ONLY'
      else 'ACCOUNT_ACCESS_ACTION_NOT_ALLOWED' end end;
  raise exception '%',code using errcode='42501',detail=(jsonb_build_object('code',code,'audience',audience)
    || case when audience='owner' then jsonb_build_object('accessMode',r->'accessMode','effectiveUntil',r->'effectiveUntil','recoveryPath',r->'recoveryPath','recoveryAction',r->'recoveryAction') else '{}'::jsonb end)::text;
end $$;

create function public.get_my_commercial_access_summary()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null or not exists(select 1 from public.pt_profiles where user_id=auth.uid()) then raise exception 'PT authentication required.' using errcode='42501'; end if;
  return public.resolve_account_commercial_access(auth.uid());
end $$;

create function public.get_workspace_commercial_access(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o uuid; r jsonb;
begin
  if auth.uid() is null or not public.can_access_workspace(p_workspace_id) then raise exception 'Workspace access denied.' using errcode='42501'; end if;
  select owner_user_id into o from public.workspaces where id=p_workspace_id;
  r:=public.resolve_account_commercial_access(o);
  return jsonb_build_object('schemaVersion',1,'workspaceId',p_workspace_id,'billingOwnerUserId',o,'accessMode',r->'accessMode',
    'canReadWorkspace',r#>'{actions,workspace_read}','canWriteExistingDelivery',r#>'{actions,delivery_write}',
    'canWriteBusinessConfiguration',r#>'{actions,business_configuration_write}','canGrowCapacity',r#>'{actions,capacity_growth}',
    'canManageBilling',o=auth.uid(),'recoveryRequired',r->'recoveryRequired','computedAt',transaction_timestamp());
end $$;

create function public.get_client_coaching_access(p_client_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.clients%rowtype; o uuid; r jsonb; m text; interactive boolean;
begin
  select * into c from public.clients where id=p_client_id;
  if auth.uid() is null or c.id is null or not (c.user_id=auth.uid() or public.can_access_client(c.id,'clients.view')) then raise exception 'Client access denied.' using errcode='42501'; end if;
  select owner_user_id into o from public.workspaces where id=c.workspace_id;
  r:=public.resolve_account_commercial_access(o);
  m:=case when o is null or c.relationship_status<>'active' then 'unavailable' when r->>'accessMode'='full' then 'interactive'
    when r->>'accessMode'='existing_delivery_only' then 'existing_delivery' when r->>'accessMode'='read_only' then 'read_only' else 'unavailable' end;
  interactive:=m in ('interactive','existing_delivery');
  return jsonb_build_object('schemaVersion',1,'clientId',c.id,'serviceMode',m,'canReadCoachedContent',true,
    'canLogWorkout',interactive,'canSubmitCheckin',interactive,'canSubmitHabitProgress',interactive,'canMessageRelationship',interactive,
    'canUseIndependentSelfService',true,'canBrowseMarketplace',true,'computedAt',transaction_timestamp());
end $$;

create function public.is_coach_accepting_applications(p_owner uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce((public.resolve_account_commercial_access(p_owner)->>'accessMode')='full',false);
$$;

revoke all on function public.is_commercial_action_allowed(text,text),public.resolve_account_commercial_access(uuid),public.assert_commercial_action_allowed(uuid,text,uuid,uuid),public.get_my_commercial_access_summary(),public.get_workspace_commercial_access(uuid),public.get_client_coaching_access(uuid),public.is_coach_accepting_applications(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_commercial_access_summary(),public.get_workspace_commercial_access(uuid),public.get_client_coaching_access(uuid) to authenticated;
grant execute on function public.is_coach_accepting_applications(uuid) to anon,authenticated;

-- Remaining guards and public-policy changes are appended below in this same
-- forward transaction. No domain or commercial rows are updated by migration.

create function public.commercial_row_scope(p_table text,p_row jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare w uuid; o uuid; c uuid; parent jsonb;
begin
  if p_row is null then return null; end if;
  case p_table
  when 'assigned_workout_exercises' then select to_jsonb(x) into parent from public.assigned_workouts x where id=(p_row->>'assigned_workout_id')::uuid; return public.commercial_row_scope('assigned_workouts',parent);
  when 'workout_set_logs' then select to_jsonb(x) into parent from public.workout_sessions x where id=(p_row->>'workout_session_id')::uuid; return public.commercial_row_scope('workout_sessions',parent);
  when 'workout_template_exercises' then select to_jsonb(x) into parent from public.workout_templates x where id=(p_row->>'workout_template_id')::uuid; return public.commercial_row_scope('workout_templates',parent);
  when 'program_template_days' then select to_jsonb(x) into parent from public.program_templates x where id=(p_row->>'program_template_id')::uuid; return public.commercial_row_scope('program_templates',parent);
  when 'client_program_overrides' then select to_jsonb(x) into parent from public.client_programs x where id=(p_row->>'client_program_id')::uuid; return public.commercial_row_scope('client_programs',parent);
  when 'checkin_questions' then select to_jsonb(x) into parent from public.checkin_templates x where id=(p_row->>'template_id')::uuid; return public.commercial_row_scope('checkin_templates',parent);
  when 'checkin_answers' then select to_jsonb(x) into parent from public.checkins x where id=(p_row->>'checkin_id')::uuid; return public.commercial_row_scope('checkins',parent);
  when 'checkin_photos' then select to_jsonb(x) into parent from public.checkins x where id=(p_row->>'checkin_id')::uuid; return public.commercial_row_scope('checkins',parent);
  when 'baseline_marker_values' then select to_jsonb(x) into parent from public.baseline_entries x where id=(p_row->>'baseline_id')::uuid; return public.commercial_row_scope('baseline_entries',parent);
  when 'baseline_metrics' then select to_jsonb(x) into parent from public.baseline_entries x where id=(p_row->>'baseline_id')::uuid; return public.commercial_row_scope('baseline_entries',parent);
  when 'baseline_photos' then select to_jsonb(x) into parent from public.baseline_entries x where id=(p_row->>'baseline_id')::uuid; return public.commercial_row_scope('baseline_entries',parent);
  when 'baseline_entry_marker_templates' then select to_jsonb(x) into parent from public.baseline_entries x where id=(p_row->>'baseline_id')::uuid; return public.commercial_row_scope('baseline_entries',parent);
  when 'assigned_nutrition_days' then select to_jsonb(x) into parent from public.assigned_nutrition_plans x where id=(p_row->>'assigned_nutrition_plan_id')::uuid; return public.commercial_row_scope('assigned_nutrition_plans',parent);
  when 'assigned_nutrition_meals' then select to_jsonb(x) into parent from public.assigned_nutrition_days x where id=(p_row->>'assigned_nutrition_day_id')::uuid; return public.commercial_row_scope('assigned_nutrition_days',parent);
  when 'assigned_nutrition_meal_components' then select to_jsonb(x) into parent from public.assigned_nutrition_meals x where id=(p_row->>'assigned_nutrition_meal_id')::uuid; return public.commercial_row_scope('assigned_nutrition_meals',parent);
  when 'nutrition_meal_logs' then select to_jsonb(x) into parent from public.assigned_nutrition_meals x where id=(p_row->>'assigned_nutrition_meal_id')::uuid; return public.commercial_row_scope('assigned_nutrition_meals',parent);
  when 'nutrition_template_days' then select to_jsonb(x) into parent from public.nutrition_templates x where id=(p_row->>'nutrition_template_id')::uuid; return public.commercial_row_scope('nutrition_templates',parent);
  when 'nutrition_template_meals' then select to_jsonb(x) into parent from public.nutrition_template_days x where id=(p_row->>'nutrition_template_day_id')::uuid; return public.commercial_row_scope('nutrition_template_days',parent);
  when 'nutrition_template_meal_components' then select to_jsonb(x) into parent from public.nutrition_template_meals x where id=(p_row->>'nutrition_template_meal_id')::uuid; return public.commercial_row_scope('nutrition_template_meals',parent);
  when 'nutrition_template_meal_items' then select to_jsonb(x) into parent from public.nutrition_template_meals x where id=(p_row->>'nutrition_template_meal_id')::uuid; return public.commercial_row_scope('nutrition_template_meals',parent);
  when 'messages' then select to_jsonb(x) into parent from public.conversations x where id=(p_row->>'conversation_id')::uuid; return public.commercial_row_scope('conversations',parent);
  when 'message_typing' then select to_jsonb(x) into parent from public.conversations x where id=(p_row->>'conversation_id')::uuid; return public.commercial_row_scope('conversations',parent);
  when 'lead_messages' then select to_jsonb(x) into parent from public.lead_conversations x where id=(p_row->>'conversation_id')::uuid; return public.commercial_row_scope('lead_conversations',parent);
  when 'pt_hub_lead_notes' then select to_jsonb(x) into parent from public.pt_hub_leads x where id=(p_row->>'lead_id')::uuid; return public.commercial_row_scope('pt_hub_leads',parent);
  when 'assigned_workouts' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'workout_sessions' then select to_jsonb(x) into parent from public.assigned_workouts x where id=(p_row->>'assigned_workout_id')::uuid; return public.commercial_row_scope('assigned_workouts',parent);
  when 'workout_logs' then
    if p_row->>'assigned_workout_id' is not null then select to_jsonb(x) into parent from public.assigned_workouts x where id=(p_row->>'assigned_workout_id')::uuid; return public.commercial_row_scope('assigned_workouts',parent); end if;
    select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'baseline_entries' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'checkins' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'client_coach_tasks' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'client_macro_targets' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'client_medical_documents' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'client_medical_records' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'client_program_assignments' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'client_programs' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'client_targets' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'habit_logs' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'nutrition_day_logs' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'workspace_client_onboardings' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'conversations' then select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid; return public.commercial_row_scope('clients',parent);
  when 'workout_templates' then w:=(p_row->>'workspace_id')::uuid;
  when 'program_templates' then w:=(p_row->>'workspace_id')::uuid;
  when 'checkin_templates' then w:=(p_row->>'workspace_id')::uuid;
  when 'coach_activity_log' then w:=(p_row->>'workspace_id')::uuid;
  when 'coach_calendar_events' then w:=(p_row->>'workspace_id')::uuid;
  when 'coach_todos' then w:=(p_row->>'workspace_id')::uuid;
  when 'invites' then w:=(p_row->>'workspace_id')::uuid;
  when 'workspace_members' then w:=(p_row->>'workspace_id')::uuid;
  when 'workspace_member_invites' then w:=(p_row->>'workspace_id')::uuid;
  when 'workspace_member_client_assignments' then w:=(p_row->>'workspace_id')::uuid;
  when 'workspace_invite_client_assignments' then w:=(p_row->>'workspace_id')::uuid;
  when 'workspace_wearable_settings' then w:=(p_row->>'workspace_id')::uuid;
  when 'pt_hub_profiles' then o:=(p_row->>'user_id')::uuid;
  when 'pt_hub_settings' then o:=(p_row->>'user_id')::uuid;
  when 'pt_profiles' then o:=(p_row->>'user_id')::uuid;
  when 'pt_packages' then o:=(p_row->>'pt_user_id')::uuid;
  when 'pt_hub_leads' then o:=(p_row->>'user_id')::uuid;
  when 'lead_conversations' then o:=(p_row->>'pt_user_id')::uuid;
  when 'clients' then c:=(p_row->>'id')::uuid; w:=(p_row->>'workspace_id')::uuid;
    if w is null then return jsonb_build_object('independent',true,'client',c); end if;
  when 'workspaces' then w:=(p_row->>'id')::uuid; o:=(p_row->>'owner_user_id')::uuid;
  when 'nutrition_templates' then
    if p_row->>'owner_client_id' is not null then return jsonb_build_object('independent',true,'client',p_row->'owner_client_id'); end if;
    w:=(p_row->>'workspace_id')::uuid;
  when 'assigned_nutrition_plans' then
    if exists(select 1 from public.nutrition_templates where id=(p_row->>'nutrition_template_id')::uuid and owner_client_id is not null) then
      return jsonb_build_object('independent',true,'client',p_row->'client_id'); end if;
    select to_jsonb(x) into parent from public.clients x where id=(p_row->>'client_id')::uuid;
    return public.commercial_row_scope('clients',parent);
  when 'exercises','baseline_marker_templates' then
    w:=(p_row->>'workspace_id')::uuid; o:=(p_row->>'owner_user_id')::uuid;
    if w is null and o=auth.uid() and not exists(select 1 from public.pt_profiles where user_id=o) then return jsonb_build_object('independent',true); end if;
  else raise exception 'Unclassified commercial write.' using errcode='42501';
  end case;
  if o is null then select owner_user_id into o from public.workspaces where id=w; end if;
  if o is null then return null; end if;
  return jsonb_build_object('owner',o,'workspace',w,'client',c,'independent',false);
end $$;

create function public.guard_commercial_domain_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare n jsonb; b jsonb; row_data jsonb; scope jsonb; action text; o uuid; w uuid; c uuid; k text;
begin
  -- Unauthenticated service/migration writers retain existing privileges. This
  -- is not a browser-controlled bypass; anonymous runtime writes are denied.
  if current_setting('role',true) in ('none','postgres','service_role') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if auth.uid() is null then
    if current_setting('role',true) in ('anon','authenticated') then raise exception 'Authentication required.' using errcode='42501'; end if;
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op<>'DELETE' then n:=to_jsonb(new); end if;
  if tg_op<>'INSERT' then b:=to_jsonb(old); end if;
  if tg_op='UPDATE' and n=b then return new; end if;
  action:='delivery_write';
  if tg_table_name in ('pt_hub_profiles','pt_hub_leads','pt_hub_lead_notes','lead_messages','lead_conversations','invites') then action:='acquisition_write'; end if;
  if tg_table_name in ('workspaces','workspace_wearable_settings','pt_hub_settings','pt_packages','workspace_members','workspace_member_invites') then action:='business_configuration_write'; end if;
  if tg_table_name='workspaces' and tg_op='INSERT' then
    o:=(n->>'owner_user_id')::uuid;
    if o=auth.uid() and not exists(select 1 from public.workspaces where owner_user_id=o)
       and public.resolve_account_commercial_access(o)->>'accessMode'='onboarding' then return new; end if;
    action:='capacity_growth';
  end if;
  -- Explicit reducing transitions only: accompanying unrelated edits remain
  -- subject to their ordinary class. No blanket DELETE exemption for delivery.
  if tg_op='DELETE' and tg_table_name in ('clients','workspaces','workspace_members','workspace_member_invites','invites','pt_packages','workspace_member_client_assignments','workspace_invite_client_assignments') then action:='remediation'; end if;
  if tg_op='UPDATE' then
    if tg_table_name='invites' and (n-'expires_at')=(b-'expires_at') and (n->>'expires_at')::timestamptz<=transaction_timestamp() then action:='remediation'; end if;
    if tg_table_name='clients' and (n-array['lifecycle_state','lifecycle_changed_at','status','paused_reason','churn_reason','relationship_status','removed_at','removed_by_user_id','updated_at'])=(b-array['lifecycle_state','lifecycle_changed_at','status','paused_reason','churn_reason','relationship_status','removed_at','removed_by_user_id','updated_at'])
      and (n->>'lifecycle_state' in ('completed','churned') or n->>'relationship_status' in ('removed','transferred_out')) then action:='remediation'; end if;
    if tg_table_name='workspace_members' and (n-array['status','updated_at'])=(b-array['status','updated_at']) and n->>'status' in ('suspended','removed') then action:='remediation'; end if;
    if tg_table_name='workspace_member_invites' and (n-array['status','updated_at'])=(b-array['status','updated_at']) and n->>'status' in ('revoked','declined','expired') then action:='remediation'; end if;
    if tg_table_name='pt_packages' and (n-array['status','is_public','archived_at','updated_at'])=(b-array['status','is_public','archived_at','updated_at']) and (n->>'is_public'='false' or n->>'status'='archived') then action:='remediation'; end if;
    if tg_table_name='pt_hub_profiles' and (n-array['is_published','marketplace_visible','published_at','updated_at'])=(b-array['is_published','marketplace_visible','published_at','updated_at']) and n->>'is_published'='false' then action:='remediation'; end if;
    if tg_table_name='workspaces' and (n-array['owner_user_id','updated_at'])=(b-array['owner_user_id','updated_at']) and n->>'owner_user_id' is distinct from b->>'owner_user_id' then action:='remediation'; end if;
    if tg_table_name='workspace_members' and (n-array['theme_preference','compact_density','updated_at'])=(b-array['theme_preference','compact_density','updated_at']) then action:='account_security'; end if;
    if tg_table_name='messages' and (n-'unread')=(b-'unread') then action:='account_security'; end if;
    if tg_table_name='clients' and n->>'user_id'=auth.uid()::text and (n-array['display_name','full_name','avatar_url','phone','email','location','timezone','unit_preference','gender','photo_url','location_country','height_cm','dob','date_of_birth','sex','height_value','height_unit','weight_value_current','weight_unit','account_onboarding_completed_at','updated_at'])=(b-array['display_name','full_name','avatar_url','phone','email','location','timezone','unit_preference','gender','photo_url','location_country','height_cm','dob','date_of_birth','sex','height_value','height_unit','weight_value_current','weight_unit','account_onboarding_completed_at','updated_at']) then action:='client_self_service'; end if;
  end if;
  -- Personal account identity remains editable independently of public business
  -- publication. Existing RLS and account RPCs still authorize these writes.
  if tg_table_name='pt_profiles' then
    action:='business_configuration_write';
    if tg_op='DELETE' or (tg_op='UPDATE' and (n-array['id','user_id','workspace_id','display_name','full_name','phone','avatar_url','location_country','location_city','onboarding_completed_at','created_at','updated_at'])=(b-array['id','user_id','workspace_id','display_name','full_name','phone','avatar_url','location_country','location_city','onboarding_completed_at','created_at','updated_at']))
      or (tg_op='INSERT' and jsonb_strip_nulls(n-array['id','user_id','workspace_id','display_name','full_name','phone','avatar_url','location_country','location_city','onboarding_completed_at','created_at','updated_at']) <@ '{"languages":[],"specialties":[]}'::jsonb) then action:='account_security'; end if;
  end if;
  if tg_op='INSERT' and tg_table_name='pt_hub_settings' and n->>'profile_visibility'='draft' and n->>'subscription_plan' is null and n->>'subscription_status' is null then action:='account_security'; end if;
  if tg_op='INSERT' and tg_table_name='pt_hub_profiles' and jsonb_strip_nulls(n-array['id','user_id','full_name','display_name','profile_photo_url','created_at','updated_at']) <@ '{"specialties":[],"certifications":[],"social_links":[],"coaching_modes":[],"availability_modes":[],"marketplace_visible":false,"is_published":false,"testimonials":[],"transformations":[]}'::jsonb then action:='account_security'; end if;
  if tg_table_name='pt_hub_settings' and (coalesce(n,'{}')-array['id','user_id','full_name','contact_email','support_email','phone','timezone','city','country','client_alerts','weekly_digest','product_updates','created_at','updated_at'])=(coalesce(b,'{}')-array['id','user_id','full_name','contact_email','support_email','phone','timezone','city','country','client_alerts','weekly_digest','product_updates','created_at','updated_at']) then action:='account_security'; end if;
  if tg_table_name='pt_hub_profiles' and tg_op='UPDATE' and (n-array['full_name','display_name','profile_photo_url','updated_at'])=(b-array['full_name','display_name','profile_photo_url','updated_at']) then action:='account_security'; end if;
  if tg_table_name in ('clients','workspace_members','workspace_member_invites') and tg_op='INSERT' then action:='capacity_growth'; end if;
  if tg_table_name='pt_packages' and n->>'is_public'='true' then action:='acquisition_write'; end if;
  if tg_table_name='clients' and tg_op='UPDATE' and (n->>'workspace_id' is distinct from b->>'workspace_id' or n->>'user_id' is distinct from b->>'user_id' or (n->>'relationship_status'='active' and b->>'relationship_status'<>'active')) then action:='capacity_growth'; end if;
  if tg_table_name='workspace_invite_client_assignments' and tg_op<>'DELETE' then action:='business_configuration_write'; end if;
  if tg_table_name='workspace_member_client_assignments' and tg_op<>'DELETE' and not exists(
    select 1 from public.workspace_members m join public.clients c on c.workspace_id=m.workspace_id
    where m.id=(n->>'member_id')::uuid and c.id=(n->>'client_id')::uuid and m.status='active' and c.relationship_status='active') then action:='business_configuration_write'; end if;
  -- Check both old and new scope: moving a row cannot escape its source policy.
  foreach row_data in array array[b,n] loop
    if row_data is null then continue; end if;
    if action='account_security' and tg_table_name='workspace_members' and row_data->>'user_id'=auth.uid()::text then continue; end if;
    scope:=public.commercial_row_scope(tg_table_name,row_data);
    if scope is null then
      -- A guarded parent deletion may cascade after that parent is no longer visible.
      if tg_op='DELETE' and pg_trigger_depth()>1 then continue; end if;
      raise exception 'Write scope unavailable.' using errcode='42501';
    end if;
    if (scope->>'independent')::boolean then continue; end if;
    o:=(scope->>'owner')::uuid; w:=(scope->>'workspace')::uuid; c:=(scope->>'client')::uuid;
    -- Invite consumption happens after the capability RPC establishes the
    -- caller's client relationship. Keep its acquisition check and safe audience.
    if tg_table_name='invites' and tg_op='UPDATE' and (n-array['uses','used_at'])=(b-array['uses','used_at'])
      and (n->'used_at'=b->'used_at' or (b->>'used_at' is null and (n->>'used_at')::timestamptz=transaction_timestamp()))
      and (n->>'uses')::integer=(b->>'uses')::integer+1 then
      select id into c from public.clients where workspace_id=w and user_id=auth.uid() and relationship_status='active' limit 1;
    end if;
    if tg_table_name in ('client_medical_records','client_medical_documents') and exists(select 1 from public.clients where id=c and user_id=auth.uid()) then action:='client_self_service'; end if;
    -- These identity/status columns are not directly writable by authenticated
    -- callers. The existing invite/relationship RPC has already authorized the
    -- capability before inserting/reactivating the actor's new membership.
    if (tg_table_name='clients' and n->>'user_id'=auth.uid()::text and action='capacity_growth')
      or (tg_table_name='workspace_members' and n->>'user_id'=auth.uid()::text and n->>'status'='active' and (tg_op='INSERT' or b->>'status'<>'active')) then
      if not public.is_commercial_action_allowed(public.resolve_account_commercial_access(o)->>'accessMode',action) then
        k:=case when tg_table_name='clients' then 'CLIENT_COACHING_INTERACTION_UNAVAILABLE' else 'WORKSPACE_COMMERCIAL_ACCESS_UNAVAILABLE' end;
        raise exception '%',k using errcode='42501',detail=jsonb_build_object('code',k)::text;
      end if;
      continue;
    end if;
    if tg_table_name in ('pt_hub_leads','lead_conversations','lead_messages','pt_hub_lead_notes') and o<>auth.uid() then
      -- The original RPC/RLS authorizes prospects; commercial failure stays
      -- audience-safe even if the authenticated prospect retries a direct call.
      if not public.is_coach_accepting_applications(o) then raise exception 'PUBLIC_COACH_NOT_ACCEPTING_APPLICATIONS' using errcode='42501',detail='{"code":"PUBLIC_COACH_NOT_ACCEPTING_APPLICATIONS","audience":"public"}'; end if;
    else
      perform public.assert_commercial_action_allowed(o,action,w,c);
    end if;
  end loop;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.commercial_row_scope(text,jsonb),public.guard_commercial_domain_write() from public,anon,authenticated,service_role;
create trigger aaa_commercial_access before insert or update or delete on public.assigned_nutrition_days for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.assigned_nutrition_meal_components for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.assigned_nutrition_meals for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.assigned_nutrition_plans for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.assigned_workout_exercises for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.assigned_workouts for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.baseline_entries for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.baseline_entry_marker_templates for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.baseline_marker_templates for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.baseline_marker_values for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.baseline_metrics for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.baseline_photos for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.checkin_answers for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.checkin_photos for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.checkin_questions for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.checkin_templates for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.checkins for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.client_coach_tasks for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.client_macro_targets for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.client_medical_documents for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.client_medical_records for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.client_program_assignments for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.client_program_overrides for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.client_programs for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.client_targets for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.clients for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.coach_activity_log for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.coach_calendar_events for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.coach_todos for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.conversations for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.exercises for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.habit_logs for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.invites for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.lead_conversations for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.lead_messages for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.message_typing for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.messages for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.nutrition_day_logs for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.nutrition_meal_logs for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.nutrition_template_days for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.nutrition_template_meal_components for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.nutrition_template_meal_items for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.nutrition_template_meals for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.nutrition_templates for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.program_template_days for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.program_templates for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.pt_hub_lead_notes for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.pt_hub_leads for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.pt_hub_profiles for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.pt_hub_settings for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.pt_packages for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.pt_profiles for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.workout_logs for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.workout_sessions for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.workout_set_logs for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.workout_template_exercises for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.workout_templates for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.workspace_client_onboardings for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.workspace_invite_client_assignments for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.workspace_member_client_assignments for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.workspace_member_invites for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.workspace_members for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.workspace_wearable_settings for each row execute function public.guard_commercial_domain_write();
create trigger aaa_commercial_access before insert or update or delete on public.workspaces for each row execute function public.guard_commercial_domain_write();

drop policy pt_hub_profiles_select_access on public.pt_hub_profiles;
drop policy pt_hub_profiles_select_published on public.pt_hub_profiles;
create policy pt_hub_profiles_select_access on public.pt_hub_profiles for select to authenticated using
  (user_id=auth.uid() or (is_published and slug is not null and btrim(slug)<>'' and public.is_coach_accepting_applications(user_id)));
create policy pt_hub_profiles_select_published on public.pt_hub_profiles for select to anon using
  (is_published and slug is not null and btrim(slug)<>'' and public.is_coach_accepting_applications(user_id));
drop policy pt_packages_select_authenticated on public.pt_packages;
drop policy pt_packages_select_public on public.pt_packages;
create policy pt_packages_select_authenticated on public.pt_packages for select to authenticated using
  (pt_user_id=auth.uid() or (status='active' and is_public and public.is_coach_accepting_applications(pt_user_id)));
create policy pt_packages_select_public on public.pt_packages for select to anon using
  (status='active' and is_public and public.is_coach_accepting_applications(pt_user_id));
CREATE OR REPLACE FUNCTION public.ensure_client_checkins(p_client_id uuid, p_range_start date, p_range_end date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_workspace_id uuid;
begin
  if p_client_id is null then
    raise exception 'Client is required';
  end if;

  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;

  if public.is_client_owner(p_client_id)
     or public.can_write_client_delivery(p_client_id) then
    if not coalesce((public.get_client_coaching_access(p_client_id)->>'canSubmitCheckin')::boolean,false) then return; end if;
    perform public.reconcile_client_checkins(
      p_client_id,
      p_range_start,
      p_range_end
    );
    return;
  end if;

  if public.can_access_client(p_client_id, 'clients.view') then
    return;
  end if;

  raise exception 'Not authorized';
end;
$function$;
CREATE OR REPLACE FUNCTION public.client_accessible_conversations_with_ensure()
 RETURNS TABLE(id uuid, client_id uuid, workspace_id uuid, last_message_at timestamp with time zone, last_message_preview text, last_message_sender_name text, last_message_sender_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  relationship record;
  v_conversation public.conversations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  for relationship in
    select
      c.id as client_id,
      c.workspace_id
    from public.clients c
    where c.user_id = v_user_id
      and c.workspace_id is not null
      and c.status = 'active'::public.client_status
    order by c.created_at asc, c.id asc
  loop
    if (public.get_client_coaching_access(relationship.client_id)->>'canMessageRelationship')::boolean then
    insert into public.conversations (workspace_id, client_id)
    values (relationship.workspace_id, relationship.client_id)
    on conflict on constraint conversations_workspace_client_key do nothing;
    end if;

    select conv.*
    into v_conversation
    from public.conversations conv
    where conv.workspace_id = relationship.workspace_id
      and conv.client_id = relationship.client_id
    limit 1;

    if v_conversation.id is not null then
      return query
      select
        v_conversation.id,
        v_conversation.client_id,
        v_conversation.workspace_id,
        v_conversation.last_message_at,
        v_conversation.last_message_preview,
        v_conversation.last_message_sender_name,
        v_conversation.last_message_sender_role;
    end if;
  end loop;
end;
$function$;
CREATE OR REPLACE FUNCTION public.ensure_pt_conversation(p_workspace_id uuid, p_client_id uuid)
 RETURNS TABLE(id uuid, client_id uuid, workspace_id uuid, last_message_at timestamp with time zone, last_message_preview text, last_message_sender_name text, last_message_sender_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_conversation public.conversations%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  if not public.can_access_client(p_client_id, 'clients.message') then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.workspace_id = p_workspace_id
  ) then
    raise exception 'Client not found';
  end if;

  if (public.get_client_coaching_access(p_client_id)->>'canMessageRelationship')::boolean then
  insert into public.conversations (workspace_id, client_id)
  values (p_workspace_id, p_client_id)
  on conflict on constraint conversations_workspace_client_key do nothing
  returning *
  into v_conversation;
  end if;

  if v_conversation.id is null then
    select conv.*
    into v_conversation
    from public.conversations conv
    where conv.workspace_id = p_workspace_id
      and conv.client_id = p_client_id
    limit 1;
  end if;

  return query
  select
    v_conversation.id,
    v_conversation.client_id,
    v_conversation.workspace_id,
    v_conversation.last_message_at,
    v_conversation.last_message_preview,
    v_conversation.last_message_sender_name,
    v_conversation.last_message_sender_role;
end;
$function$;
CREATE OR REPLACE FUNCTION public.submit_public_pt_application(p_slug text, p_full_name text, p_phone text, p_goal_summary text, p_training_experience text, p_package_interest_id uuid DEFAULT NULL::uuid, p_package_interest_label_snapshot text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_profile record;
  v_lead_id uuid;
  v_slug text;
  v_applicant_user_id uuid;
  v_email text;
  v_full_name text;
  v_package_interest_label text;
  v_selected_package record;
  v_latest_lead record;
begin
  v_applicant_user_id := auth.uid();
  if v_applicant_user_id is null then
    raise exception 'Sign in is required before applying.';
  end if;

  v_slug := lower(btrim(coalesce(p_slug, '')));
  if v_slug = '' then
    raise exception 'Profile slug is required';
  end if;

  select
    profile.user_id,
    profile.slug
  into v_profile
  from public.pt_hub_profiles profile
  join public.pt_hub_settings settings
    on settings.user_id = profile.user_id
  where lower(profile.slug) = v_slug
    and profile.is_published = true
    and settings.profile_visibility = 'listed'
  limit 1;

  if not found then
    raise exception 'Published profile not found';
  end if;

  if v_profile.user_id = v_applicant_user_id then
    raise exception 'You cannot apply to your own public profile.';
  end if;

  if not public.is_coach_accepting_applications(v_profile.user_id) then
    raise exception 'PUBLIC_COACH_NOT_ACCEPTING_APPLICATIONS' using errcode='42501',detail='{"code":"PUBLIC_COACH_NOT_ACCEPTING_APPLICATIONS","audience":"public"}';
  end if;

  v_email := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  if v_email is null then
    raise exception 'Your account email is missing.';
  end if;

  v_full_name := coalesce(
    nullif(btrim(coalesce(p_full_name, '')), ''),
    nullif(
      btrim(
        coalesce(
          auth.jwt() -> 'user_metadata' ->> 'full_name',
          auth.jwt() -> 'user_metadata' ->> 'name',
          ''
        )
      ),
      ''
    )
  );

  if v_full_name is null then
    raise exception 'Full name is required';
  end if;

  if coalesce(btrim(p_goal_summary), '') = '' then
    raise exception 'Goal summary is required';
  end if;

  perform public.enforce_rate_limit(
    'public_pt_application_burst',
    1,
    300,
    v_applicant_user_id,
    null,
    public.hash_rate_limit_key(v_slug),
    'You recently submitted an application. Please wait a few minutes before trying again.'
  );

  perform public.enforce_rate_limit(
    'public_pt_application_hourly',
    3,
    3600,
    v_applicant_user_id,
    null,
    null,
    'Too many applications were submitted from this account recently. Please try again later.'
  );

  if p_package_interest_id is not null then
    select
      pkg.id,
      pkg.title
    into v_selected_package
    from public.pt_packages pkg
    where pkg.id = p_package_interest_id
      and pkg.pt_user_id = v_profile.user_id
      and pkg.status = 'active'
      and pkg.is_public = true
    limit 1;

    if not found then
      raise exception 'Selected package is no longer available.';
    end if;

    v_package_interest_label := nullif(
      btrim(coalesce(v_selected_package.title, '')),
      ''
    );

    if v_package_interest_label is null then
      raise exception 'Selected package is no longer available.';
    end if;
  else
    v_package_interest_label := nullif(
      btrim(coalesce(p_package_interest_label_snapshot, '')),
      ''
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    hashtextextended(
      format(
        'public_pt_application:%s:%s',
        v_profile.user_id::text,
        v_applicant_user_id::text
      ),
      0
    )
  );

  select
    lead.id,
    lead.status
  into v_latest_lead
  from public.pt_hub_leads lead
  where lead.user_id = v_profile.user_id
    and lead.applicant_user_id = v_applicant_user_id
  order by lead.submitted_at desc nulls last, lead.id desc
  limit 1
  for update;

  if v_latest_lead.id is not null
     and coalesce(v_latest_lead.status, 'new') <> 'declined' then
    raise exception 'You already have an application with this coach. You can apply again only if they decline it.';
  end if;

  insert into public.pt_hub_leads (
    user_id,
    applicant_user_id,
    full_name,
    email,
    phone,
    goal_summary,
    training_experience,
    budget_interest,
    package_interest,
    package_interest_id,
    package_interest_label_snapshot,
    status,
    submitted_at,
    source,
    source_slug
  )
  values (
    v_profile.user_id,
    v_applicant_user_id,
    v_full_name,
    v_email,
    nullif(btrim(coalesce(p_phone, '')), ''),
    btrim(p_goal_summary),
    nullif(btrim(coalesce(p_training_experience, '')), ''),
    null,
    v_package_interest_label,
    p_package_interest_id,
    v_package_interest_label,
    'new',
    now(),
    'public_profile',
    v_profile.slug
  )
  returning id into v_lead_id;

  return v_lead_id;
end;
$function$;
create function public.get_public_commercial_coach_profiles(p_slug text default null)
returns setof public.pt_hub_profiles language sql stable security definer set search_path=pg_catalog,public as $$
  select p.* from public.pt_hub_profiles p join public.pt_hub_settings s on s.user_id=p.user_id
  where p.is_published and s.profile_visibility='listed' and p.slug is not null and btrim(p.slug)<>''
    and (case when p_slug is null then p.marketplace_visible else lower(p.slug)=lower(btrim(p_slug)) end)
    and public.is_coach_accepting_applications(p.user_id)
  order by p.published_at desc nulls last,p.updated_at desc,p.id;
$$;
revoke all on function public.get_public_commercial_coach_profiles(text) from public,anon,authenticated,service_role;
grant execute on function public.get_public_commercial_coach_profiles(text) to anon,authenticated;

create function public.get_my_commercial_remediation()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid();
begin
  if u is null or not exists(select 1 from public.pt_profiles where user_id=u) then raise exception 'PT authentication required.' using errcode='42501'; end if;
  return jsonb_build_object(
    'clients',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'label',coalesce(c.display_name,'Client'))) from public.clients c join public.workspaces w on w.id=c.workspace_id where w.owner_user_id=u and c.relationship_status='active'),'[]'),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'workspaceId',m.workspace_id,'label','Team member')) from public.workspace_members m join public.workspaces w on w.id=m.workspace_id where w.owner_user_id=u and m.user_id<>u and m.status='active'),'[]'),
    'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'workspaceId',i.workspace_id,'label',i.email)) from public.workspace_member_invites i join public.workspaces w on w.id=i.workspace_id where w.owner_user_id=u and i.status='pending'),'[]'),
    'packages',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'label',p.title)) from public.pt_packages p where p.pt_user_id=u and p.status<>'archived'),'[]'));
end $$;
revoke all on function public.get_my_commercial_remediation() from public,anon,authenticated,service_role;
grant execute on function public.get_my_commercial_remediation() to authenticated;
create function public.commercial_storage_write_allowed(p_bucket text,p_name text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c public.clients%rowtype; o uuid; first_part text:=split_part(p_name,'/',1);
begin
  if p_bucket not in ('baseline_photos','checkin-photos','medical_documents','workspace_branding') then return true; end if;
  if auth.uid() is null then return false; end if;
  if p_bucket='workspace_branding' then
    select owner_user_id into o from public.workspaces where id::text=first_part and public.can_manage_workspace_team(id);
    if o is null then return false; end if;
    return coalesce(public.resolve_account_commercial_access(o)->>'accessMode'='full',false);
  end if;
  select * into c from public.clients where id::text=first_part;
  if c.id is null then return false; end if;
  if not (c.user_id=auth.uid() or public.can_access_client(c.id,'clients.view')) then return false; end if;
  if c.workspace_id is null or p_bucket='medical_documents' and c.user_id=auth.uid() then return c.user_id=auth.uid(); end if;
  select owner_user_id into o from public.workspaces where id=c.workspace_id;
  return public.is_commercial_action_allowed(public.resolve_account_commercial_access(o)->>'accessMode','delivery_write');
end $$;
revoke all on function public.commercial_storage_write_allowed(text,text) from public,anon,authenticated,service_role;
grant execute on function public.commercial_storage_write_allowed(text,text) to authenticated;
create policy commercial_storage_insert on storage.objects as restrictive for insert to authenticated
  with check(public.commercial_storage_write_allowed(bucket_id,name));
create policy commercial_storage_update on storage.objects as restrictive for update to authenticated
  using(public.commercial_storage_write_allowed(bucket_id,name)) with check(public.commercial_storage_write_allowed(bucket_id,name));
CREATE OR REPLACE FUNCTION public.ensure_workspace_checkins(p_workspace_id uuid, p_range_start date, p_range_end date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_client record;
begin
  if p_workspace_id is null then
    raise exception 'Workspace is required';
  end if;

  if not public.can_manage_workspace_delivery(p_workspace_id) then
    if public.can_access_workspace(p_workspace_id) then
      return;
    end if;
    raise exception 'Not authorized';
  end if;

  if not (public.get_workspace_commercial_access(p_workspace_id)->>'canWriteExistingDelivery')::boolean then return; end if;

  for v_client in
    select c.id
    from public.clients c
    where c.workspace_id = p_workspace_id
  loop
    perform public.reconcile_client_checkins(
      v_client.id,
      p_range_start,
      p_range_end
    );
  end loop;
end;
$function$;
CREATE OR REPLACE FUNCTION public.ensure_workspace_client_onboarding(p_client_id uuid, p_source onboarding_source DEFAULT 'direct_invite'::onboarding_source)
 RETURNS workspace_client_onboardings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_client public.clients%rowtype;
  v_row public.workspace_client_onboardings;
  v_baseline public.baseline_entries%rowtype;
  v_program public.client_programs%rowtype;
  v_checkin_submitted_at timestamptz := null;
  v_has_program boolean := false;
  v_has_checkin_setup boolean := false;
  v_legacy_status public.onboarding_status := null;
  v_started_at timestamptz := null;
  v_reviewed_at timestamptz := null;
  v_activated_at timestamptz := null;
  v_completed_at timestamptz := null;
begin
  if p_client_id is null then
    raise exception 'Client is required';
  end if;

  select c.*
  into v_client
  from public.clients c
  where c.id = p_client_id
  limit 1;

  if v_client.id is null or v_client.workspace_id is null then
    raise exception 'Client not found';
  end if;

  if not (
    public.is_client_owner(p_client_id)
    or public.is_pt_workspace_member(v_client.workspace_id)
  ) then
    raise exception 'Not authorized';
  end if;

  select *
  into v_row
  from public.workspace_client_onboardings wco
  where wco.workspace_id = v_client.workspace_id
    and wco.client_id = p_client_id
  limit 1;

  if not public.is_commercial_action_allowed(public.resolve_account_commercial_access((select owner_user_id from public.workspaces where id=v_client.workspace_id))->>'accessMode','delivery_write') then return v_row; end if;

  if v_row.id is null then
    select *
    into v_baseline
    from public.baseline_entries be
    where be.client_id = p_client_id
      and be.status = 'submitted'
    order by coalesce(be.submitted_at, be.created_at) desc
    limit 1;

    select *
    into v_program
    from public.client_programs cp
    where cp.client_id = p_client_id
      and coalesce(cp.is_active, false) = true
    order by coalesce(cp.updated_at, cp.created_at) desc
    limit 1;

    select max(coalesce(ch.submitted_at, ch.created_at))
    into v_checkin_submitted_at
    from public.checkins ch
    where ch.client_id = p_client_id
      and ch.submitted_at is not null;

    v_has_program := v_program.id is not null;
    v_has_checkin_setup := (
      v_client.checkin_template_id is not null
      and v_client.checkin_start_date is not null
    ) or v_checkin_submitted_at is not null;

    if v_baseline.id is not null and v_has_program and v_has_checkin_setup then
      v_legacy_status := 'completed';
    elsif v_baseline.id is not null and (v_has_program or v_has_checkin_setup) then
      v_legacy_status := 'submitted';
    end if;

    if v_legacy_status is not null then
      v_started_at := coalesce(
        v_baseline.created_at,
        v_client.created_at,
        now()
      );
      v_reviewed_at := coalesce(
        v_program.updated_at,
        v_program.created_at,
        v_checkin_submitted_at,
        v_baseline.submitted_at,
        now()
      );
      v_activated_at :=
        case
          when v_legacy_status = 'completed'
            then coalesce(v_program.created_at, v_checkin_submitted_at, v_reviewed_at)
          else null
        end;
      v_completed_at :=
        case
          when v_legacy_status = 'completed'
            then coalesce(v_program.updated_at, v_program.created_at, v_reviewed_at)
          else null
        end;

      insert into public.workspace_client_onboardings (
        workspace_id,
        client_id,
        source,
        status,
        initial_baseline_entry_id,
        first_program_template_id,
        first_program_applied_at,
        first_checkin_template_id,
        first_checkin_date,
        first_checkin_scheduled_at,
        started_at,
        submitted_at,
        reviewed_at,
        activated_at,
        completed_at
      )
      values (
        v_client.workspace_id,
        p_client_id,
        coalesce(p_source, 'direct_invite'),
        v_legacy_status,
        v_baseline.id,
        v_program.program_template_id,
        case
          when v_has_program
            then coalesce(v_program.updated_at, v_program.created_at, now())
          else null
        end,
        v_client.checkin_template_id,
        v_client.checkin_start_date,
        case
          when v_has_checkin_setup
            then coalesce(v_checkin_submitted_at, now())
          else null
        end,
        v_started_at,
        coalesce(v_baseline.submitted_at, v_started_at, now()),
        v_reviewed_at,
        v_activated_at,
        v_completed_at
      )
      returning *
      into v_row;
    else
      insert into public.workspace_client_onboardings (
        workspace_id,
        client_id,
        source,
        status
      )
      values (
        v_client.workspace_id,
        p_client_id,
        coalesce(p_source, 'direct_invite'),
        'invited'
      )
      returning *
      into v_row;
    end if;
  end if;

  return v_row;
end;
$function$;
commit;
