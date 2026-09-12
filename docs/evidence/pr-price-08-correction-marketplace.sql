begin;
create temp table market_fixture as select gen_random_uuid() owner_id,g from generate_series(1,2500) g;
insert into auth.users(id,email) select owner_id,owner_id||'@market-plan.test' from market_fixture;
insert into public.pt_profiles(user_id,full_name) select owner_id,'Market coach '||g from market_fixture;
do $$ declare r record; begin for r in select owner_id from market_fixture loop perform public.ensure_commercial_billing_account(r.owner_id,'manual'); end loop; end $$;
insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
select a.id,p.id,'complimentary','active','legacy_beta_backfill' from market_fixture f join public.billing_accounts a on a.owner_user_id=f.owner_id cross join public.commercial_plan_versions p where p.plan_key='scale' and p.status='active';
insert into public.workspaces(owner_user_id,name) select owner_id,'Market workspace '||g from market_fixture;
insert into public.pt_hub_profiles(user_id,slug,is_published,marketplace_visible,published_at) select owner_id,'market-plan-'||g,g%10<>0,g%5<>0,now()-g*interval '1 hour' from market_fixture;
insert into public.pt_hub_settings(user_id,profile_visibility) select owner_id,case when g%7=0 then 'private' else 'listed' end from market_fixture;
update public.account_subscriptions s set status='restricted',restricted_at=now() from public.billing_accounts a join market_fixture f on f.owner_id=a.owner_user_id where s.billing_account_id=a.id and f.g%4=0;
analyze public.pt_hub_profiles; analyze public.pt_hub_settings; analyze public.billing_accounts; analyze public.account_subscriptions; analyze public.workspaces;
explain (analyze,buffers,verbose) select * from public.get_public_commercial_coach_profiles();
explain (analyze,buffers,verbose) select p.* from public.pt_hub_profiles p join public.pt_hub_settings s on s.user_id=p.user_id where p.is_published and s.profile_visibility='listed' and p.slug is not null and btrim(p.slug)<>'' and p.marketplace_visible and public.is_coach_accepting_applications(p.user_id) order by p.published_at desc nulls last,p.updated_at desc,p.id;
explain (analyze,buffers,verbose) select * from public.get_public_commercial_coach_profiles('market-plan-1');
rollback;
