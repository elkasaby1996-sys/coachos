// Complete target-specific baseline comparison; never a hosted-platform allowlist.
import { readFileSync } from "node:fs";
import { ensure } from "./staging-release-artifacts.mjs";
import {
  evidenceDigest,
  evidenceCanonical,
} from "./staging-release-webhook-history.mjs";

// Include extension-owned objects and every application/platform namespace.
// Definitions and type labels matter: schema names alone are not boundaries.
// The exact managed startup/Storage tables below exclude ONLY generated UUIDs/time.
// Internal RI trigger OID names normalize to the constraint/table/event identity;
// their definitions, multiplicity and enabled state remain bound.
// Natural tenant relationships, row multiplicity, versions, all configuration
// (including opaque credentials) and every other platform row field are retained.
export const SQL_CONTEXT = Object.freeze({
  search_path: "pg_catalog, pg_temp",
  TimeZone: "UTC",
  DateStyle: "ISO, YMD",
  IntervalStyle: "postgres",
  extra_float_digits: "3",
  bytea_output: "hex",
});
// The materialized context is a dependency of dynamic parsing/execution, all in
// ONE request. The fixed inner SQL is parsed only after set_config has executed.
// This is not exported as an arbitrary SQL execution capability.
function canonicalQuery(sql, column) {
  const literal = (s) => "'" + s.replaceAll("'", "''") + "'";
  ensure(!sql.includes("$repsync_fixed$"), "BOOTSTRAP_QUERY_CONTRACT");
  return `with context as materialized (select ${Object.entries(SQL_CONTEXT)
    .map(
      ([key, value], i) =>
        `pg_catalog.set_config(${literal(key)},${literal(value)},true) c${i}`,
    )
    .join(",")}), extracted as materialized (
    select pg_catalog.query_to_xml($repsync_fixed$${sql}$repsync_fixed$,false,false,'') x from context
    where ${Object.values(SQL_CONTEXT)
      .map((value, i) => `c${i} OPERATOR(pg_catalog.=) ${literal(value)}`)
      .join(" and ")}
  ) select (pg_catalog.xpath('/table/row/${column}/text()',x))[1]::pg_catalog.text::pg_catalog.jsonb OPERATOR(pg_catalog.||)
    pg_catalog.jsonb_build_object('sqlContext',pg_catalog.jsonb_build_object(${Object.keys(
      SQL_CONTEXT,
    )
      .map(
        (key) => `${literal(key)},pg_catalog.current_setting(${literal(key)})`,
      )
      .join(",")})) ${column}
    from extracted;`;
}
const CATALOG_SQL = `with ns as (
 select oid,nspname from pg_namespace where nspname not in ('pg_catalog','pg_toast','information_schema') and nspname !~ '^pg_(toast_)?temp_[0-9]+$'
), customer_roles as (
 select oid,rolname from pg_roles where rolname in ('anon','authenticated','service_role')
), customer_principals as (
 select r.oid from pg_roles r where exists(select 1 from customer_roles c where pg_has_role(c.oid,r.oid,'MEMBER'))
), customer_acls as (
 select jsonb_build_array('schema',n.nspname) identity,n.nspacl acl,'n'::"char" acltype,n.nspowner owner
 from pg_namespace n join ns on ns.oid=n.oid where n.nspname!='supabase_migrations'
 union all select jsonb_build_array('relation',n.nspname,c.relname),c.relacl,case when c.relkind='S' then 's' else 'r' end::"char",c.relowner
 from pg_class c join ns n on n.oid=c.relnamespace where n.nspname not in ('public','supabase_migrations') and c.relkind in ('r','p','v','m','f','S')
 union all select jsonb_build_array('column',n.nspname,c.relname,a.attname),a.attacl,'c'::"char",c.relowner
 from pg_attribute a join pg_class c on c.oid=a.attrelid join ns n on n.oid=c.relnamespace where n.nspname not in ('public','supabase_migrations') and a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m','f')
 union all select jsonb_build_array('routine',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),p.proacl,'f'::"char",p.proowner
 from pg_proc p join ns n on n.oid=p.pronamespace where n.nspname not in ('public','supabase_migrations')
 union all select jsonb_build_array('type',n.nspname,t.typname),t.typacl,'T'::"char",t.typowner
 from pg_type t join ns n on n.oid=t.typnamespace where n.nspname not in ('public','supabase_migrations')
 union all select jsonb_build_array('default',pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype),d.defaclacl,d.defaclobjtype,d.defaclrole
 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where n.nspname is distinct from 'public' and n.nspname is distinct from 'supabase_migrations'
), customer_security as (
 select jsonb_build_array('acl',c.identity,pg_get_userbyid(a.grantor),case when a.grantee=0 then jsonb_build_array('PUBLIC') else jsonb_build_array('role',pg_get_userbyid(a.grantee)) end,a.privilege_type,a.is_grantable) record
 from customer_acls c cross join lateral aclexplode(coalesce(c.acl,acldefault(c.acltype,c.owner))) a where (a.grantee=0 or a.grantee in(select oid from customer_principals))
 -- PUBLIC USAGE of a type is PostgreSQL's default, not ownership authority.
 -- This one explicit tuple rule is independent of type name/owner provenance.
 -- Every type definition/ACL/owner still participates in exact B + delta.
 and not (c.identity->>0='type' and a.grantee=0 and a.privilege_type='USAGE' and not a.is_grantable and a.grantor=c.owner)
 union all select jsonb_build_array('relation_security',n.nspname,c.relname,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity)
 from pg_class c join ns n on n.oid=c.relnamespace where n.nspname not in ('public','supabase_migrations') and c.relkind in ('r','p','v','m','f','S') and not c.relispartition
 -- Partition identities are variable, but direct customer grants are not
 -- allowed and their owner must equal every parent. Exact B still pins them.
 union all select jsonb_build_array('unsafe_partition',n.nspname,c.relname)
 from pg_class c join ns n on n.oid=c.relnamespace where n.nspname not in ('public','supabase_migrations') and c.relispartition and
 (not exists(select 1 from pg_inherits i where i.inhrelid=c.oid) or exists(select 1 from pg_inherits i join pg_class p on p.oid=i.inhparent where i.inhrelid=c.oid and p.relowner!=c.relowner) or c.relrowsecurity or c.relforcerowsecurity)
 union all select jsonb_build_array('schema_owner',n.nspname,pg_get_userbyid(n.nspowner)) from pg_namespace n join ns on ns.oid=n.oid where n.nspname!='supabase_migrations'
 union all select jsonb_build_array('customer_owner',c.identity,pg_get_userbyid(c.owner)) from customer_acls c where c.owner in(select oid from customer_principals)
 union all select jsonb_build_array('role',r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolbypassrls) from pg_roles r where r.oid in(select oid from customer_roles)
 union all select jsonb_build_array('membership',c.rolname,r.rolname,pg_has_role(c.oid,r.oid,'USAGE'),pg_has_role(c.oid,r.oid,'SET')) from customer_roles c cross join pg_roles r where c.oid!=r.oid and pg_has_role(c.oid,r.oid,'MEMBER')
), objects as (
 select 'namespace' kind,nspname::text name,jsonb_build_array(nspname,pg_get_userbyid(nspowner),nspacl::text) definition
 from pg_namespace where oid in(select oid from ns)
 union all select 'relation',n.nspname||'.'||c.relname,
 jsonb_build_array(c.relkind,c.relpersistence,pg_get_userbyid(c.relowner),c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,
 case when c.relkind in('v','m') then pg_get_viewdef(c.oid,true) when c.relkind in('i','I') then pg_get_indexdef(c.oid) else null end,
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
 union all select 'event_trigger',evtname,jsonb_build_array(evtevent,evtenabled,evtfoid::regproc::text,evttags,pg_get_userbyid(evtowner)) from pg_event_trigger
 union all select 'default_acl',pg_get_userbyid(d.defaclrole)||'.'||coalesce(n.nspname,'*')||'.'||d.defaclobjtype::text,to_jsonb(d.defaclacl::text)
 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 union all select 'sequence',n.nspname||'.'||c.relname,jsonb_build_object('seqtypid',format_type(s.seqtypid,null),'seqstart',s.seqstart::text,'seqincrement',s.seqincrement::text,'seqmax',s.seqmax::text,'seqmin',s.seqmin::text,'seqcache',s.seqcache::text,'seqcycle',s.seqcycle) from pg_sequence s join pg_class c on c.oid=s.seqrelid join ns n on n.oid=c.relnamespace
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
 union all select 'role',rolname::text,to_jsonb(r)-array['oid','rolpassword'] from pg_roles r
 union all select 'role_membership',pg_get_userbyid(roleid)||'.'||pg_get_userbyid(member)||'.'||pg_get_userbyid(grantor),jsonb_build_array(admin_option,inherit_option,set_option) from pg_auth_members
 union all select 'role_setting',jsonb_build_array(case when s.setdatabase=0 then null else d.datname end,case when s.setrole=0 then null else r.rolname end)::text,
 jsonb_build_array(case when s.setdatabase=0 then null else d.datname end,case when s.setrole=0 then null else r.rolname end,(select jsonb_agg(v order by v) from unnest(s.setconfig) v))
 from pg_db_role_setting s left join pg_database d on d.oid=s.setdatabase left join pg_roles r on r.oid=s.setrole
 union all select 'parameter_acl',p.parname,jsonb_build_object('isNull',p.paracl is null,'privileges',coalesce((select jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then jsonb_build_array('PUBLIC') else jsonb_build_array('role',pg_get_userbyid(a.grantee)) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor),a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type,a.is_grantable) from aclexplode(p.paracl) a),'[]'::jsonb)) from pg_parameter_acl p
 union all select 'temporary_object_count','*',to_jsonb(
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname ~ '^pg_(toast_)?temp_[0-9]+$')+
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname ~ '^pg_(toast_)?temp_[0-9]+$')+
 (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname ~ '^pg_(toast_)?temp_[0-9]+$'))
 union all select 'cast',format_type(c.castsource,null)||'->'||format_type(c.casttarget,null),
 jsonb_build_array(c.castcontext,c.castmethod,c.castfunc::regprocedure::text) from pg_cast c
 union all select 'index_security',n.nspname||'.'||c.relname,
 jsonb_build_array(i.indisunique,i.indisprimary,i.indisexclusion,i.indimmediate,i.indisclustered,i.indisvalid,i.indcheckxmin,i.indisready,i.indislive,i.indisreplident,i.indnullsnotdistinct)
 from pg_index i join pg_class c on c.oid=i.indexrelid join ns n on n.oid=c.relnamespace
 union all select 'type_security',n.nspname||'.'||t.typname,
 (to_jsonb(t)-array['oid','typnamespace','typowner','typrelid','typelem','typarray','typbasetype','typinput','typoutput','typreceive','typsend','typmodin','typmodout','typanalyze','typsubscript','typcollation','typdefaultbin'])||
 jsonb_build_object('relation',t.typrelid::regclass::text,'element',format_type(t.typelem,null),'array',format_type(t.typarray,null),'base',format_type(t.typbasetype,t.typtypmod),
 'input',t.typinput::regprocedure::text,'output',t.typoutput::regprocedure::text,'receive',t.typreceive::regprocedure::text,'send',t.typsend::regprocedure::text,'modin',t.typmodin::regprocedure::text,'modout',t.typmodout::regprocedure::text,'analyze',t.typanalyze::regprocedure::text,'subscript',t.typsubscript::regprocedure::text,'collation',t.typcollation::regcollation::text,'default',pg_get_expr(t.typdefaultbin,0))
 from pg_type t join ns n on n.oid=t.typnamespace
 union all select 'constraint_security',n.nspname||'.'||coalesce(c.conrelid::regclass::text,c.contypid::regtype::text)||'.'||c.conname,
 jsonb_build_array(c.conislocal,c.coninhcount,c.connoinherit,c.conindid::regclass::text,c.conrelid::regclass::text,c.confrelid::regclass::text,c.contypid::regtype::text,c.conkey,c.confkey,c.conpfeqop::regoperator[],c.conppeqop::regoperator[],c.conffeqop::regoperator[],case when c.conparentid=0 then null else pg_get_constraintdef(c.conparentid,true) end)
 from pg_constraint c join ns n on n.oid=c.connamespace
 union all select 'aggregate',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 (to_jsonb(a)-array['aggfnoid','aggtransfn','aggfinalfn','aggcombinefn','aggserialfn','aggdeserialfn','aggmtransfn','aggminvtransfn','aggmfinalfn','aggsortop','aggtranstype','aggmtranstype'])||jsonb_build_object('trans',a.aggtransfn::regprocedure::text,'final',a.aggfinalfn::regprocedure::text,'combine',a.aggcombinefn::regprocedure::text,'serial',a.aggserialfn::regprocedure::text,'deserial',a.aggdeserialfn::regprocedure::text,'mtrans',a.aggmtransfn::regprocedure::text,'minverse',a.aggminvtransfn::regprocedure::text,'mfinal',a.aggmfinalfn::regprocedure::text,'sort',a.aggsortop::regoperator::text,'stateType',format_type(a.aggtranstype,null),'mstateType',format_type(a.aggmtranstype,null))
 from pg_aggregate a join pg_proc p on p.oid=a.aggfnoid join ns n on n.oid=p.pronamespace
 union all select 'relation_security',n.nspname||'.'||c.relname,
 jsonb_build_array(c.relreplident,c.relispartition,pg_get_expr(c.relpartbound,c.oid),
 (select jsonb_agg(jsonb_build_array(p.inhparent::regclass::text,p.inhseqno,p.inhdetachpending) order by p.inhseqno) from pg_inherits p where p.inhrelid=c.oid))
 from pg_class c join ns n on n.oid=c.relnamespace
 union all select 'trigger_security',n.nspname||'.'||c.relname||'.'||case when t.tgisinternal and t.tgname ~ '^RI_ConstraintTrigger_[ac]_[0-9]+$' then rc.conrelid::regclass::text||'.'||rc.conname||'.'||t.tgtype::text else t.tgname end,
 jsonb_build_array(t.tgfoid::regprocedure::text,t.tgtype,t.tgisinternal,t.tgdeferrable,t.tginitdeferred,t.tgenabled,rc.conrelid::regclass::text,rc.conname,rc.confrelid::regclass::text)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join ns n on n.oid=c.relnamespace left join pg_constraint rc on rc.oid=t.tgconstraint
 union all select 'object_owner',n.nspname||'.operator.'||o.oprname||'('||format_type(o.oprleft,null)||','||format_type(o.oprright,null)||')',to_jsonb(pg_get_userbyid(o.oprowner)) from pg_operator o join ns n on n.oid=o.oprnamespace
 union all select 'object_owner',n.nspname||'.collation.'||c.collname,to_jsonb(pg_get_userbyid(c.collowner)) from pg_collation c join ns n on n.oid=c.collnamespace
 union all select 'object_owner',n.nspname||'.conversion.'||c.conname,to_jsonb(pg_get_userbyid(c.conowner)) from pg_conversion c join ns n on n.oid=c.connamespace
 union all select 'user_mapping',s.srvname||'.'||case when u.umuser=0 then 'public' else pg_get_userbyid(u.umuser) end,to_jsonb(u.umoptions) from pg_user_mapping u join pg_foreign_server s on s.oid=u.umserver
 union all select 'publication_namespace',p.pubname||'.'||n.nspname,to_jsonb(n.nspname) from pg_publication_namespace pn join pg_publication p on p.oid=pn.pnpubid join pg_namespace n on n.oid=pn.pnnspid
 union all select 'dependency',case when dt.tgisinternal and dt.tgname ~ '^RI_ConstraintTrigger_[ac]_[0-9]+$' then format('RI trigger %s %s %s %s',dc.conrelid::regclass,dc.conname,dt.tgrelid::regclass,dt.tgtype) when dr.relnamespace='pg_toast'::regnamespace and dm.oid is not null then format('%s of %s',case when dr.relkind='i' then 'TOAST index' else 'TOAST table' end,dm.oid::regclass) else pg_describe_object(d.classid,d.objid,d.objsubid) end,
 jsonb_build_array(d.deptype,case when rt.tgisinternal and rt.tgname ~ '^RI_ConstraintTrigger_[ac]_[0-9]+$' then format('RI trigger %s %s %s %s',rc.conrelid::regclass,rc.conname,rt.tgrelid::regclass,rt.tgtype) when rr.relnamespace='pg_toast'::regnamespace and rm.oid is not null then format('%s of %s',case when rr.relkind='i' then 'TOAST index' else 'TOAST table' end,rm.oid::regclass) else pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) end)
 from pg_depend d
 left join pg_trigger dt on d.classid='pg_trigger'::regclass and dt.oid=d.objid left join pg_constraint dc on dc.oid=dt.tgconstraint
 left join pg_trigger rt on d.refclassid='pg_trigger'::regclass and rt.oid=d.refobjid left join pg_constraint rc on rc.oid=rt.tgconstraint
 left join pg_class dr on d.classid='pg_class'::regclass and dr.oid=d.objid left join pg_index di on di.indexrelid=dr.oid left join pg_class dm on dm.reltoastrelid=coalesce(di.indrelid,dr.oid) and dm.reltoastrelid!=0
 left join pg_class rr on d.refclassid='pg_class'::regclass and rr.oid=d.refobjid left join pg_index ri on ri.indexrelid=rr.oid left join pg_class rm on rm.reltoastrelid=coalesce(ri.indrelid,rr.oid) and rm.reltoastrelid!=0
), platform as (
 select n.nspname||'.'||c.relname name,
 (xpath('/table/row/count/text()',x))[1]::text::bigint count,
 (xpath('/table/row/digest/text()',x))[1]::text digest,
 has_table_privilege(c.oid,'SELECT') and (not c.relrowsecurity or (select rolsuper or rolbypassrls from pg_roles where rolname=current_user) or (c.relowner=(select oid from pg_roles where rolname=current_user) and not c.relforcerowsecurity)) unfiltered,
 case when n.nspname='storage' and c.relname='buckets' then (xpath('/table/row/rows/text()',x))[1]::text::jsonb else null end rows
 from pg_class c join ns n on n.oid=c.relnamespace
 cross join lateral (select case
   when n.nspname='_realtime' and c.relname in('tenants','extensions') then 'to_jsonb(r)-array[''id'',''inserted_at'',''updated_at'']'
   when (n.nspname,c.relname) in (('_realtime','schema_migrations'),('realtime','schema_migrations'),('supabase_functions','migrations')) then 'to_jsonb(r)-''inserted_at'''
   when n.nspname='storage' and c.relname='migrations' then 'to_jsonb(r)-''executed_at'''
   when n.nspname='storage' and c.relname='buckets' then 'to_jsonb(r)-array[''created_at'',''updated_at'']'
   else 'to_jsonb(r)' end row_expression) normalized
 cross join lateral (select query_to_xml(format('select count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(%s order by (%s)::text),''[]''::jsonb)::text,''UTF8'')),''hex'') digest,%s rows from %I.%I r',row_expression,row_expression,case when n.nspname='storage' and c.relname='buckets' then 'coalesce(jsonb_agg('||row_expression||' order by ('||row_expression||')::text),''[]''::jsonb)' else 'null::jsonb' end,n.nspname,c.relname),false,false,'') x) q
 where (n.nspname!='public' or exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')) and c.relkind in('r','p','m')
)
select jsonb_build_object('catalog',coalesce((select jsonb_agg(jsonb_build_array(kind,name,definition) order by kind,name,definition::text) from objects),'[]'::jsonb),
 'securityCatalogs',jsonb_build_object('complete',has_table_privilege('pg_catalog.pg_db_role_setting','SELECT') and has_table_privilege('pg_catalog.pg_parameter_acl','SELECT') and
 not exists(select 1 from pg_db_role_setting s left join pg_database d on d.oid=s.setdatabase left join pg_roles r on r.oid=s.setrole where (s.setdatabase!=0 and d.oid is null) or (s.setrole!=0 and r.oid is null) or s.setconfig is null),
 'roleSettings',(select count(*) from pg_db_role_setting),'parameterAcls',(select count(*) from pg_parameter_acl)),
 'customerSecurity',coalesce((select jsonb_agg(record order by record::text) from customer_security),'[]'::jsonb),
 'customerSecurityCount',(select count(*) from customer_security),
 'customerSecurityComplete',(select count(*)=3 from customer_roles),
 'catalogCount',(select count(*) from objects),'platformCount',(select count(*) from platform),
 'sqlCatalogDigest',encode(sha256(convert_to(coalesce((select jsonb_agg(jsonb_build_array(kind,name,definition) order by kind,name,definition::text) from objects),'[]'::jsonb)::text,'UTF8')),'hex'),
 'platform',coalesce((select jsonb_agg(to_jsonb(p) order by name) from platform p),'[]'::jsonb),
 'dataTables',coalesce((select jsonb_agg(n.nspname||'.'||c.relname order by n.nspname,c.relname) from pg_class c join ns n on n.oid=c.relnamespace where (n.nspname!='public' or exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')) and c.relkind in('r','p','m')),'[]'::jsonb),
 'platformComplete',coalesce((select bool_and(count is not null and digest is not null and digest ~ '^[a-f0-9]{64}$' and unfiltered) from platform),false),
 'sqlPlatformDigest',encode(sha256(convert_to(coalesce((select jsonb_agg(to_jsonb(p) order by name) from platform p),'[]'::jsonb)::text,'UTF8')),'hex')) proof;`;
export const BOOTSTRAP_CATALOG_QUERY = canonicalQuery(CATALOG_SQL, "proof");

// UUIDs and migration execution timestamps vary across cold installs. Keep all
// business fields and replace FKs with independently joined natural identities.
const SEEDS_SQL = `with rows as (
 select 'commercial_features' name,to_jsonb(r)-array['created_at','updated_at'] value from public.commercial_features r
 union all select 'billing_runtime_policy',to_jsonb(r)-'updated_at' from public.billing_runtime_policy r
 union all select 'commercial_plan_versions',to_jsonb(r)-array['id','created_at','updated_at'] from public.commercial_plan_versions r
 union all select 'commercial_addon_versions',to_jsonb(r)-array['id','created_at','updated_at'] from public.commercial_addon_versions r
 union all select 'commercial_trial_policy_versions',(to_jsonb(r)-array['id','created_at','updated_at','feature_plan_version_id'])||jsonb_build_object('feature_plan',jsonb_build_array(p.plan_key,p.version))
 from public.commercial_trial_policy_versions r left join public.commercial_plan_versions p on p.id=r.feature_plan_version_id
 union all select 'commercial_plan_feature_entitlements',(to_jsonb(r)-array['created_at','plan_version_id'])||jsonb_build_object('plan',jsonb_build_array(p.plan_key,p.version))
 from public.commercial_plan_feature_entitlements r left join public.commercial_plan_versions p on p.id=r.plan_version_id
)
select jsonb_build_object('seedDigest',encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(name,value) order by name,value::text),'[]'::jsonb)::text,'UTF8')),'hex')) seeds from rows;`;
export const BOOTSTRAP_SEEDS_QUERY = canonicalQuery(SEEDS_SQL, "seeds");
export const BOOTSTRAP_EMPTY_DATABASE_QUERY = canonicalQuery(
  `select jsonb_build_object(
 'ledgerPresent',to_regclass('supabase_migrations.schema_migrations') is not null,
 'applicationRelations',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p','v','m','f','S')),
 'applicationFunctions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
 'authUsers',(select count(*) from auth.users),
 'storageObjects',(select count(*) from storage.objects),
 'storageBuckets',(select count(*) from storage.buckets)) facts;`,
  "facts",
);
export const BOOTSTRAP_EMPTY_LEDGER_QUERY = canonicalQuery(
  "select jsonb_build_object('versions',coalesce(jsonb_agg(version order by version),'[]'::jsonb)) ledger from supabase_migrations.schema_migrations;",
  "ledger",
);

let cachedProfiles, cachedProfileBytes, cachedProfileDigest;
export function bootstrapDatabaseProfiles() {
  const value = readFileSync(
    new URL("../config/staging-bootstrap-database.json", import.meta.url),
  );
  // Read and compare every byte on every gate. Neither timestamps nor file size
  // can authorize reuse; Buffer comparison avoids repeatedly decoding 6 MB.
  if (!cachedProfileBytes || !value.equals(cachedProfileBytes)) {
    cachedProfiles = JSON.parse(value.toString("utf8"));
    const freeze = (v) => {
      if (v && typeof v === "object") {
        for (const item of Object.values(v)) freeze(item);
        Object.freeze(v);
      }
    };
    freeze(cachedProfiles);
    cachedProfileBytes = value;
    cachedProfileDigest = evidenceDigest(cachedProfiles);
  }
  return cachedProfiles;
}
export function bootstrapDatabasePolicyDigest() {
  bootstrapDatabaseProfiles(); // Reread and reject changed source at every gate.
  return cachedProfileDigest;
}
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export function databaseProof(catalog, seeds) {
  ensure(
    /^[a-f0-9]{64}$/.test(catalog?.sqlCatalogDigest) &&
      /^[a-f0-9]{64}$/.test(catalog?.sqlPlatformDigest),
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
  ensure(
    evidenceDigest(catalog.sqlContext) === evidenceDigest(SQL_CONTEXT),
    "BOOTSTRAP_SQL_CONTEXT_INVALID",
  );
  ensure(
    Array.isArray(catalog.catalog) &&
      catalog.catalog.length > 0 &&
      catalog.catalog.every(
        (r) =>
          Array.isArray(r) &&
          r.length === 3 &&
          typeof r[0] === "string" &&
          typeof r[1] === "string",
      ) &&
      Array.isArray(catalog.platform) &&
      catalog.platform.length > 0 &&
      catalog.platform.every(
        (p) =>
          typeof p.name === "string" &&
          Number.isSafeInteger(p.count) &&
          p.count >= 0 &&
          /^[a-f0-9]{64}$/.test(p.digest) &&
          p.unfiltered === true,
      ) &&
      new Set(catalog.platform.map((p) => p.name)).size ===
        catalog.platform.length &&
      Array.isArray(catalog.dataTables) &&
      catalog.catalogCount === catalog.catalog.length &&
      catalog.platformCount === catalog.platform.length &&
      evidenceDigest([...catalog.dataTables].sort()) ===
        evidenceDigest(catalog.platform.map((p) => p.name).sort()),
    "BOOTSTRAP_EXTRACTION_INCOMPLETE",
  );
  const dataRelations = catalog.catalog
    .filter(
      (r) =>
        r[0] === "relation" &&
        ["r", "p", "m"].includes(r[2]?.[0]) &&
        !r[1].startsWith("public."),
    )
    .map((r) => r[1])
    .sort();
  ensure(
    evidenceDigest(dataRelations) ===
      evidenceDigest(
        catalog.platform
          .filter((p) => !p.name.startsWith("public."))
          .map((p) => p.name)
          .sort(),
      ),
    "BOOTSTRAP_EXTRACTION_INCOMPLETE",
  );
  const security = catalog.securityCatalogs;
  ensure(
    security?.complete === true &&
      ["roleSettings", "parameterAcls"].every(
        (k) => Number.isSafeInteger(security[k]) && security[k] >= 0,
      ) &&
      security.roleSettings ===
        catalog.catalog.filter((r) => r[0] === "role_setting").length &&
      security.parameterAcls ===
        catalog.catalog.filter((r) => r[0] === "parameter_acl").length &&
      ["role_setting", "parameter_acl"].every((kind) => {
        const records = catalog.catalog.filter((r) => r[0] === kind);
        return (
          new Set(records.map((r) => r[1])).size === records.length &&
          records.every((r) => {
            const d = r[2];
            if (kind === "role_setting") {
              let identity;
              try {
                identity = JSON.parse(r[1]);
              } catch {
                return false;
              }
              return (
                Array.isArray(d) &&
                d.length === 3 &&
                [d[0], d[1]].every(
                  (v) => v === null || (typeof v === "string" && v.length > 0),
                ) &&
                evidenceDigest(identity) === evidenceDigest(d.slice(0, 2)) &&
                Array.isArray(d[2]) &&
                d[2].every((v) => typeof v === "string" && v.includes("="))
              );
            }
            return (
              typeof d?.isNull === "boolean" &&
              Array.isArray(d.privileges) &&
              d.privileges.every(
                (a) =>
                  Array.isArray(a) &&
                  a.length === 4 &&
                  typeof a[0] === "string" &&
                  Array.isArray(a[1]) &&
                  ((a[1].length === 1 && a[1][0] === "PUBLIC") ||
                    (a[1].length === 2 &&
                      a[1][0] === "role" &&
                      typeof a[1][1] === "string")) &&
                  ["SET", "ALTER SYSTEM"].includes(a[2]) &&
                  typeof a[3] === "boolean",
              )
            );
          })
        );
      }),
    "BOOTSTRAP_SECURITY_CATALOG_INCOMPLETE",
  );
  ensure(
    catalog.customerSecurityComplete === true &&
      Array.isArray(catalog.customerSecurity) &&
      catalog.customerSecurity.length > 0 &&
      catalog.customerSecurityCount === catalog.customerSecurity.length,
    "BOOTSTRAP_CUSTOMER_SECURITY_INCOMPLETE",
  );
  const records = multiset(catalog.catalog),
    components = [...catalog.platform].sort((a, b) =>
      compareText(a.name, b.name),
    );
  const catalogDigest = evidenceDigest(records),
    platformDigest = evidenceDigest(components);
  ensure(
    (catalog.catalogDigest === undefined ||
      catalog.catalogDigest === catalogDigest) &&
      (catalog.platformDigest === undefined ||
        catalog.platformDigest === platformDigest),
    "BOOTSTRAP_DATABASE_PROFILE_MISMATCH",
  );
  return {
    ...catalog,
    customerSecurity: multiset(catalog.customerSecurity),
    catalog: records,
    platform: components,
    catalogDigest,
    platformDigest,
    ...(seeds === undefined ? {} : { seedDigest: seeds }),
  };
}
export const multiset = (records) =>
  records
    .map((r) => ({ record: structuredClone(r), key: evidenceCanonical(r) }))
    // Codepoint order is independent of the observer's OS/ICU locale. Duplicate
    // keys remain separate records; no identity-map deduplication occurs.
    .sort((a, b) => compareText(a.key, b.key))
    .map((r) => r.record);
// Consume one occurrence at a time. Identity-key maps would discard duplicate RI
// names and permit extra objects to hide behind legitimate canonical changes.
export function applyCanonicalDelta(records, delta) {
  const result = multiset(records);
  for (const removed of delta.remove) {
    const index = result.findIndex(
      (r) => evidenceCanonical(r) === evidenceCanonical(removed),
    );
    ensure(index !== -1, "BOOTSTRAP_CANONICAL_DELTA_PRECONDITION");
    result.splice(index, 1);
  }
  result.push(...structuredClone(delta.add));
  return multiset(result);
}
export function assertCustomerState(
  proof,
  count,
  profiles = bootstrapDatabaseProfiles(),
) {
  databaseProof(proof, proof.seedDigest);
  // This source-owned customer-facing policy is independent of candidate B.
  // Provider-only metadata still requires the complete approved B + delta.
  ensure(
    profiles.customerSecurity?.schemaVersion === 1 &&
      evidenceDigest(multiset(proof.customerSecurity)) ===
        evidenceDigest(multiset(profiles.customerSecurity.records)),
    "BOOTSTRAP_CUSTOMER_SECURITY_MISMATCH",
  );
  // Derive this projection from the complete semantic catalog records, never
  // from a caller's separate assertion. Membership is itself source-constrained
  // above, including indirect/inherited and SET-accessible roles.
  const customerPrincipals = new Set([
    "anon",
    "authenticated",
    "service_role",
    ...proof.customerSecurity
      .filter((r) => r[0] === "membership")
      .map((r) => r[2]),
  ]);
  const parameterPrivileges = proof.catalog
    .filter((r) => r[0] === "parameter_acl")
    .flatMap((r) =>
      r[2].privileges
        .filter((a) => a[1][0] === "PUBLIC" || customerPrincipals.has(a[1][1]))
        .map((a) => [r[1], ...a]),
    );
  ensure(
    Array.isArray(profiles.customerSecurity.parameterPrivileges) &&
      evidenceDigest(multiset(parameterPrivileges)) ===
        evidenceDigest(multiset(profiles.customerSecurity.parameterPrivileges)),
    "BOOTSTRAP_CUSTOMER_PARAMETER_ACL_MISMATCH",
  );
  const publicDefaults = (records) =>
    records.filter(
      (r) => r[0] === "default_acl" && /\.public\.[^.]$/.test(r[1]),
    );
  ensure(
    evidenceDigest(multiset(publicDefaults(proof.catalog))) ===
      evidenceDigest(
        count === 0
          ? multiset(profiles.customerSecurity.publicDefaultAcls)
          : applyCanonicalDelta(profiles.customerSecurity.publicDefaultAcls, {
              remove: publicDefaults(profiles.delta180.catalog.remove),
              add: publicDefaults(profiles.delta180.catalog.add),
            }),
      ),
    "BOOTSTRAP_CUSTOMER_DEFAULT_ACL_MISMATCH",
  );
  ensure(
    proof.catalog.filter((r) => r[0] === "temporary_object_count").length ===
      1 &&
      proof.catalog.some(
        (r) => r[0] === "temporary_object_count" && r[1] === "*" && r[2] === 0,
      ),
    "BOOTSTRAP_CUSTOMER_TEMPORARY_STATE",
  );
  const diagnosticRows = new Set(profiles.diagnosticRows);
  for (const p of proof.platform) {
    if (diagnosticRows.has(p.name)) continue; // Contents STILL baseline-pinned.
    if (
      count === 180 &&
      ["storage.buckets", "supabase_migrations.schema_migrations"].includes(
        p.name,
      )
    )
      continue;
    ensure(
      p.count === 0 &&
        p.digest ===
          "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      "BOOTSTRAP_CUSTOMER_STATE_NOT_EMPTY",
    );
  }
  for (const name of profiles.requiredEmptyTables)
    ensure(
      proof.platform.some((p) => p.name === name),
      "BOOTSTRAP_CUSTOMER_EXTRACTION_INCOMPLETE",
    );
  const forbidden = [
    "foreign_wrapper",
    "foreign_server",
    "foreign_table",
    "user_mapping",
    "publication_namespace",
  ];
  ensure(
    !proof.catalog.some((r) => forbidden.includes(r[0])),
    "BOOTSTRAP_CUSTOMER_CONNECTIVITY",
  );
  ensure(
    proof.catalog.some(
      (r) => r[0] === "subscription_count" && r[1] === "*" && r[2] === 0,
    ) &&
      !proof.catalog.some((r) => r[0] === "subscription_count" && r[2] !== 0),
    "BOOTSTRAP_CUSTOMER_SUBSCRIPTION",
  );
  ensure(
    !proof.catalog.some(
      (r) =>
        r[0] === "publication" &&
        (r[1] !== "supabase_realtime" || r[2]?.[1] !== false),
    ),
    "BOOTSTRAP_CUSTOMER_PUBLICATION",
  );
  if (count === 0) {
    ensure(
      !proof.catalog.some(
        (r) =>
          (r[1].startsWith("public.") && !["namespace"].includes(r[0])) ||
          (r[0] === "policy" &&
            /^(auth|storage|realtime|_realtime)\./.test(r[1])) ||
          r[0] === "publication_relation",
      ),
      "BOOTSTRAP_CUSTOMER_OBJECTS",
    );
  }
  // CLI ledger structure is compared separately and may be present but empty.
  const ledger = proof.catalog.filter(
    (r) =>
      (r[0] === "namespace" && r[1] === "supabase_migrations") ||
      r[1].startsWith("supabase_migrations.") ||
      (r[0] === "dependency" &&
        /supabase_migrations\./.test(evidenceCanonical(r))),
  );
  ensure(
    (count === 0 && ledger.length === 0) ||
      evidenceDigest(multiset(ledger)) ===
        evidenceDigest(multiset(profiles.ledgerCatalog)),
    "BOOTSTRAP_LEDGER_NAMESPACE",
  );
}
export function assertDatabaseProof(
  proof,
  count,
  baseline,
  profiles = bootstrapDatabaseProfiles(),
) {
  ensure(
    profiles?.schemaVersion === 2 &&
      baseline?.databaseProof &&
      [0, 180].includes(count),
    "BOOTSTRAP_VIRGIN_BASELINE_REQUIRED",
  );
  assertCustomerState(proof, count, profiles);
  const b = baseline.databaseProof;
  if (count === 0) {
    ensure(
      evidenceDigest(proof) === evidenceDigest(b),
      "BOOTSTRAP_DATABASE_PROFILE_MISMATCH",
    );
    return;
  }
  const ledgerValues = new Set(profiles.ledgerCatalog.map(evidenceCanonical));
  const start = b.catalog.filter(
    (r) => !ledgerValues.has(evidenceCanonical(r)),
  );
  ensure(
    evidenceDigest(multiset(proof.catalog)) ===
      evidenceDigest(applyCanonicalDelta(start, profiles.delta180.catalog)),
    "BOOTSTRAP_DATABASE_PROFILE_MISMATCH",
  );
  const expected = b.platform.map(
    (p) =>
      profiles.delta180.platform.find((x) => x.name === p.name)?.after ?? p,
  );
  for (const change of profiles.delta180.platform) {
    const prior = b.platform.find((p) => p.name === change.name);
    ensure(
      evidenceDigest(prior ?? null) === evidenceDigest(change.before) ||
        (change.name === "supabase_migrations.schema_migrations" &&
          prior?.count === 0 &&
          prior.digest ===
            "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" &&
          prior.unfiltered === true),
      "BOOTSTRAP_CANONICAL_DELTA_PRECONDITION",
    );
    if (!prior) expected.push(change.after);
  }
  ensure(
    evidenceDigest(
      [...proof.platform].sort((a, b) => compareText(a.name, b.name)),
    ) ===
      evidenceDigest(
        [...expected].sort((a, b) => compareText(a.name, b.name)),
      ) && proof.seedDigest === profiles.delta180.seedDigest,
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
      values?.length === 1 &&
        /^[a-f0-9]{64}$/.test(values[0].seeds?.seedDigest) &&
        evidenceDigest(values[0].seeds.sqlContext) ===
          evidenceDigest(SQL_CONTEXT),
      "BOOTSTRAP_SEED_PROOF_INVALID",
    );
    seeds = values[0].seeds.seedDigest;
  }
  return databaseProof(rows[0].proof, seeds);
}
