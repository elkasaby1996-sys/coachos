// Positive, source-bound database profiles. Unknown platform versions fail closed.
// No DDL, provider access, or automatic profile enrollment is permitted here.
import { readFileSync } from "node:fs";
import { ensure } from "./staging-release-artifacts.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";

// Include extension-owned objects and every application/platform namespace.
// Definitions and type labels matter: schema names alone are not boundaries.
// The exact managed startup/Storage tables below exclude ONLY generated UUIDs/time.
// Internal RI trigger OID names normalize to the constraint/table/event identity;
// their definitions, multiplicity and enabled state remain bound.
// Natural tenant relationships, row multiplicity, versions, all configuration
// (including opaque credentials) and every other platform row field are retained.
export const BOOTSTRAP_CATALOG_QUERY = `with ns as (
 select oid,nspname from pg_namespace where nspname !~ '^pg_' and nspname != 'information_schema'
), objects as (
 select 'namespace' kind,nspname::text name,jsonb_build_array(nspname,pg_get_userbyid(nspowner),nspacl::text) definition
 from pg_namespace where oid in(select oid from ns)
 union all select 'relation',n.nspname||'.'||c.relname,
 jsonb_build_array(c.relkind,c.relpersistence,pg_get_userbyid(c.relowner),c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,
 case when c.relkind in('v','m') then pg_get_viewdef(c.oid,true) when c.relkind='i' then pg_get_indexdef(c.oid) else null end,
 (select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid),a.attacl::text) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))
 from pg_class c join ns n on n.oid=c.relnamespace
 union all select 'routine',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 jsonb_build_array(p.prokind,pg_get_userbyid(p.proowner),p.proacl::text,p.proconfig,p.prosecdef,
 case when p.prokind!='a' then pg_get_functiondef(p.oid) else p.prosrc end)
 from pg_proc p join ns n on n.oid=p.pronamespace
 union all select 'type',n.nspname||'.'||t.typname,
 jsonb_build_array(t.typtype,pg_get_userbyid(t.typowner),t.typacl::text,format_type(t.typbasetype,t.typtypmod),t.typnotnull,t.typdefault,
 (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid),
 (select jsonb_agg(jsonb_build_array(format_type(r.rngsubtype,null),r.rngcanonical::regproc::text,r.rngsubdiff::regproc::text)) from pg_range r where r.rngtypid=t.oid))
 from pg_type t join ns n on n.oid=t.typnamespace
 union all select 'constraint',n.nspname||'.'||coalesce(c.conrelid::regclass::text,c.contypid::regtype::text)||'.'||c.conname,
 jsonb_build_array(pg_get_constraintdef(c.oid,true),c.convalidated,c.condeferrable,c.condeferred)
 from pg_constraint c join ns n on n.oid=c.connamespace
 union all select 'trigger',n.nspname||'.'||c.relname||'.'||case when t.tgisinternal and t.tgname ~ '^RI_ConstraintTrigger_[ac]_[0-9]+$' then rc.conrelid::regclass::text||'.'||rc.conname||'.'||t.tgtype::text else t.tgname end,
 jsonb_build_array(case when t.tgisinternal and t.tgname ~ '^RI_ConstraintTrigger_[ac]_[0-9]+$' then replace(pg_get_triggerdef(t.oid,true),quote_ident(t.tgname),'"RI_ConstraintTrigger_auto"') else pg_get_triggerdef(t.oid,true) end,t.tgenabled)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join ns n on n.oid=c.relnamespace left join pg_constraint rc on rc.oid=t.tgconstraint
 union all select 'policy',n.nspname||'.'||c.relname||'.'||p.polname,
 jsonb_build_array(p.polcmd,p.polpermissive,(select jsonb_agg(case when role=0 then 'public' else pg_get_userbyid(role) end order by role) from unnest(p.polroles) role),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))
 from pg_policy p join pg_class c on c.oid=p.polrelid join ns n on n.oid=c.relnamespace
 union all select 'extension',e.extname,jsonb_build_array(e.extversion,n.nspname,e.extrelocatable,pg_get_userbyid(e.extowner)) from pg_extension e join pg_namespace n on n.oid=e.extnamespace
 union all select 'event_trigger',evtname,jsonb_build_array(evtevent,evtenabled,evtfoid::regproc::text,evttags) from pg_event_trigger
 union all select 'default_acl',pg_get_userbyid(d.defaclrole)||'.'||coalesce(n.nspname,'*')||'.'||d.defaclobjtype::text,to_jsonb(d.defaclacl::text)
 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 union all select 'sequence',n.nspname||'.'||c.relname,to_jsonb(s)-'seqrelid' from pg_sequence s join pg_class c on c.oid=s.seqrelid join ns n on n.oid=c.relnamespace
 union all select 'operator',n.nspname||'.'||o.oprname||'('||format_type(o.oprleft,null)||','||format_type(o.oprright,null)||')',jsonb_build_array(o.oprcode::regproc::text,o.oprrest::regproc::text,o.oprjoin::regproc::text,format_type(o.oprresult,null),o.oprcanmerge,o.oprcanhash) from pg_operator o join ns n on n.oid=o.oprnamespace
 union all select 'collation',n.nspname||'.'||c.collname,to_jsonb(c)-array['oid','collnamespace','collowner'] from pg_collation c join ns n on n.oid=c.collnamespace
 union all select 'conversion',n.nspname||'.'||c.conname,jsonb_build_array(c.conforencoding,c.contoencoding,c.conproc::regproc::text,c.condefault) from pg_conversion c join ns n on n.oid=c.connamespace
 union all select 'opclass',n.nspname||'.'||c.opcname,jsonb_build_array(a.amname,pg_get_userbyid(c.opcowner),f.opfname,format_type(c.opcintype,null),format_type(c.opckeytype,null),c.opcdefault) from pg_opclass c join ns n on n.oid=c.opcnamespace join pg_am a on a.oid=c.opcmethod join pg_opfamily f on f.oid=c.opcfamily
 union all select 'opfamily',n.nspname||'.'||f.opfname,jsonb_build_array(a.amname,pg_get_userbyid(f.opfowner),
 (select jsonb_agg(jsonb_build_array(format_type(o.amoplefttype,null),format_type(o.amoprighttype,null),o.amopstrategy,o.amoppurpose,o.amopopr::regoperator::text) order by o.amopstrategy,o.amopopr::regoperator::text) from pg_amop o where o.amopfamily=f.oid),
 (select jsonb_agg(jsonb_build_array(format_type(p.amproclefttype,null),format_type(p.amprocrighttype,null),p.amprocnum,p.amproc::regprocedure::text) order by p.amprocnum,p.amproc::regprocedure::text) from pg_amproc p where p.amprocfamily=f.oid))
 from pg_opfamily f join ns n on n.oid=f.opfnamespace join pg_am a on a.oid=f.opfmethod
 union all select 'ts_parser',n.nspname||'.'||p.prsname,jsonb_build_array(p.prsstart::regproc::text,p.prstoken::regproc::text,p.prsend::regproc::text,p.prsheadline::regproc::text,p.prslextype::regproc::text) from pg_ts_parser p join ns n on n.oid=p.prsnamespace
 union all select 'ts_template',n.nspname||'.'||t.tmplname,jsonb_build_array(t.tmplinit::regproc::text,t.tmpllexize::regproc::text) from pg_ts_template t join ns n on n.oid=t.tmplnamespace
 union all select 'ts_dictionary',n.nspname||'.'||d.dictname,jsonb_build_array(pg_get_userbyid(d.dictowner),tn.nspname,t.tmplname,d.dictinitoption) from pg_ts_dict d join ns n on n.oid=d.dictnamespace join pg_ts_template t on t.oid=d.dicttemplate join pg_namespace tn on tn.oid=t.tmplnamespace
 union all select 'ts_configuration',n.nspname||'.'||c.cfgname,jsonb_build_array(pg_get_userbyid(c.cfgowner),pn.nspname,p.prsname,
 (select jsonb_agg(jsonb_build_array(m.maptokentype,m.mapseqno,dn.nspname,d.dictname) order by m.maptokentype,m.mapseqno) from pg_ts_config_map m join pg_ts_dict d on d.oid=m.mapdict join pg_namespace dn on dn.oid=d.dictnamespace where m.mapcfg=c.oid))
 from pg_ts_config c join ns n on n.oid=c.cfgnamespace join pg_ts_parser p on p.oid=c.cfgparser join pg_namespace pn on pn.oid=p.prsnamespace
 union all select 'foreign_wrapper',f.fdwname,jsonb_build_array(pg_get_userbyid(f.fdwowner),f.fdwhandler::regproc::text,f.fdwvalidator::regproc::text,f.fdwacl::text,f.fdwoptions) from pg_foreign_data_wrapper f
 union all select 'foreign_server',s.srvname,jsonb_build_array(pg_get_userbyid(s.srvowner),f.fdwname,s.srvtype,s.srvversion,s.srvacl::text,s.srvoptions) from pg_foreign_server s join pg_foreign_data_wrapper f on f.oid=s.srvfdw
 union all select 'foreign_table',n.nspname||'.'||c.relname,jsonb_build_array(s.srvname,t.ftoptions) from pg_foreign_table t join pg_class c on c.oid=t.ftrelid join ns n on n.oid=c.relnamespace join pg_foreign_server s on s.oid=t.ftserver
 union all select 'publication',pubname,jsonb_build_array(pg_get_userbyid(pubowner),puballtables,pubinsert,pubupdate,pubdelete,pubtruncate,pubviaroot) from pg_publication
 union all select 'publication_relation',p.pubname||'.'||r.prrelid::regclass::text,jsonb_build_array(r.prattrs::text,pg_get_expr(r.prqual,r.prrelid)) from pg_publication_rel r join pg_publication p on p.oid=r.prpubid
 union all select 'subscription_count','*',to_jsonb(count(*)) from pg_subscription
 union all select 'cast',format_type(c.castsource,null)||'->'||format_type(c.casttarget,null),
 jsonb_build_array(c.castcontext,c.castmethod,c.castfunc::regprocedure::text) from pg_cast c
 union all select 'dependency',pg_describe_object(d.classid,d.objid,d.objsubid),
 jsonb_build_array(d.deptype,pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid))
 from pg_depend d where
 (d.classid='pg_class'::regclass and d.objid in(select c.oid from pg_class c join ns n on n.oid=c.relnamespace)) or
 (d.classid='pg_proc'::regclass and d.objid in(select p.oid from pg_proc p join ns n on n.oid=p.pronamespace)) or
 (d.classid='pg_type'::regclass and d.objid in(select t.oid from pg_type t join ns n on n.oid=t.typnamespace)) or
 d.classid='pg_cast'::regclass
), platform as (
 select n.nspname||'.'||c.relname name,
 (xpath('/table/row/count/text()',x))[1]::text::bigint count,
 (xpath('/table/row/digest/text()',x))[1]::text digest
 from pg_class c join ns n on n.oid=c.relnamespace
 cross join lateral (select case
   when n.nspname='_realtime' and c.relname in('tenants','extensions') then 'to_jsonb(r)-array[''id'',''inserted_at'',''updated_at'']'
   when (n.nspname,c.relname) in (('_realtime','schema_migrations'),('realtime','schema_migrations'),('supabase_functions','migrations')) then 'to_jsonb(r)-''inserted_at'''
   when n.nspname='storage' and c.relname='migrations' then 'to_jsonb(r)-''executed_at'''
   when n.nspname='storage' and c.relname='buckets' then 'to_jsonb(r)-array[''created_at'',''updated_at'']'
   else 'to_jsonb(r)' end row_expression) normalized
 cross join lateral (select query_to_xml(format('select count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(%s order by (%s)::text),''[]''::jsonb)::text,''UTF8'')),''hex'') digest from %I.%I r',row_expression,row_expression,n.nspname,c.relname),false,false,'') x) q
 where (n.nspname!='public' or exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')) and c.relkind in('r','p','m')
)
select jsonb_build_object('catalogDigest',encode(sha256(convert_to(coalesce((select jsonb_agg(jsonb_build_array(kind,name,definition) order by kind,name,definition::text) from objects),'[]'::jsonb)::text,'UTF8')),'hex'),
 'platformComplete',coalesce((select bool_and(count is not null and digest is not null and digest ~ '^[a-f0-9]{64}$') from platform),true),
 'platformDigest',encode(sha256(convert_to(coalesce((select jsonb_agg(to_jsonb(p) order by name) from platform p),'[]'::jsonb)::text,'UTF8')),'hex')) proof;`;

// UUIDs and migration execution timestamps vary across cold installs. Keep all
// business fields and replace FKs with independently joined natural identities.
export const BOOTSTRAP_SEEDS_QUERY = `with rows as (
 select 'commercial_features' name,to_jsonb(r)-array['created_at','updated_at'] value from public.commercial_features r
 union all select 'billing_runtime_policy',to_jsonb(r)-'updated_at' from public.billing_runtime_policy r
 union all select 'commercial_plan_versions',to_jsonb(r)-array['id','created_at','updated_at'] from public.commercial_plan_versions r
 union all select 'commercial_addon_versions',to_jsonb(r)-array['id','created_at','updated_at'] from public.commercial_addon_versions r
 union all select 'commercial_trial_policy_versions',(to_jsonb(r)-array['id','created_at','updated_at','feature_plan_version_id'])||jsonb_build_object('feature_plan',jsonb_build_array(p.plan_key,p.version))
 from public.commercial_trial_policy_versions r left join public.commercial_plan_versions p on p.id=r.feature_plan_version_id
 union all select 'commercial_plan_feature_entitlements',(to_jsonb(r)-array['created_at','plan_version_id'])||jsonb_build_object('plan',jsonb_build_array(p.plan_key,p.version))
 from public.commercial_plan_feature_entitlements r left join public.commercial_plan_versions p on p.id=r.plan_version_id
)
select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(name,value) order by name,value::text),'[]'::jsonb)::text,'UTF8')),'hex') seeds from rows;`;

export function bootstrapDatabaseProfiles() {
  return JSON.parse(
    readFileSync(
      new URL("../config/staging-bootstrap-database.json", import.meta.url),
      "utf8",
    ),
  );
}
export function databaseProof(catalog, seeds) {
  ensure(
    /^[a-f0-9]{64}$/.test(catalog?.catalogDigest) &&
      /^[a-f0-9]{64}$/.test(catalog?.platformDigest),
    "BOOTSTRAP_DATABASE_PROOF_INVALID",
  );
  ensure(
    seeds === undefined || /^[a-f0-9]{64}$/.test(seeds),
    "BOOTSTRAP_SEED_PROOF_INVALID",
  );
  ensure(
    catalog.platformComplete === true,
    "BOOTSTRAP_PLATFORM_PROOF_INCOMPLETE",
  );
  return {
    catalogDigest: catalog.catalogDigest,
    platformDigest: catalog.platformDigest,
    ...(seeds === undefined ? {} : { seedDigest: seeds }),
  };
}
export function assertDatabaseProof(
  proof,
  count,
  profiles = bootstrapDatabaseProfiles(),
) {
  const expected = profiles?.checkpoints?.[count];
  ensure(
    profiles?.schemaVersion === 1 &&
      expected &&
      Object.keys(expected).length === (count === 0 ? 2 : 3),
    "BOOTSTRAP_DATABASE_PROFILE_REQUIRED",
  );
  ensure(
    evidenceDigest(proof) === evidenceDigest(expected),
    "BOOTSTRAP_DATABASE_PROFILE_MISMATCH",
  );
}
export async function observeDatabaseProof(query, count) {
  const rows = await query(BOOTSTRAP_CATALOG_QUERY);
  ensure(rows?.length === 1, "BOOTSTRAP_DATABASE_PROOF_INVALID");
  let seeds;
  if (count === 180) {
    const values = await query(BOOTSTRAP_SEEDS_QUERY);
    ensure(
      values?.length === 1 && /^[a-f0-9]{64}$/.test(values[0].seeds),
      "BOOTSTRAP_SEED_PROOF_INVALID",
    );
    seeds = values[0].seeds;
  }
  return databaseProof(rows[0].proof, seeds);
}
