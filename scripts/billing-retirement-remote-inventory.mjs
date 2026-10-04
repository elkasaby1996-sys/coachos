// FUTURE separately authorized read-only Supabase inspection. No provider calls.
// This module is never imported by the local planner/preflight entrypoint.
import {
  assertFunctionInventory,
  hash,
} from "./billing-retirement-release.mjs";
export const LS_ROOT_KEYS = Object.freeze([
  "customers",
  "subscriptions",
  "checkouts",
  "plans",
  "planEvents",
  "seats",
  "seatEvents",
  "webhooks",
  "origins",
]);
const validRoots = (roots) =>
  roots &&
  !Array.isArray(roots) &&
  LS_ROOT_KEYS.every(
    (key) => Number.isSafeInteger(roots[key]) && roots[key] >= 0,
  );

// Schema-qualified SELECT only, using the Management API's read-only endpoint.
// Missing objects/permissions fail closed; never install helpers or widen grants.
export const INVENTORY_QUERY = `select jsonb_build_object(
 'versions',(select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from supabase_migrations.schema_migrations),
 'policy',(select jsonb_build_object('sales',paddle_sales_enabled,'reconciliation',paddle_reconciliation_enabled) from public.billing_runtime_policy where id=1),
 'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_catalog.pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'definition',pg_catalog.pg_get_functiondef(p.oid),'acl',p.proacl::text,'applicationExecutable',pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') or pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE'),'publicExecutable',exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')) order by p.oid::regprocedure::text) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),
 'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'acl',c.relacl::text,'rls',c.relrowsecurity) order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
 'schema',jsonb_build_object(
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum),'[]'::jsonb) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname='public' and a.attnum>0 and not a.attisdropped and c.relkind in ('r','v')),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,'definition',pg_catalog.pg_get_constraintdef(k.oid)) order by c.relname,k.conname),'[]'::jsonb) from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'definition',pg_catalog.pg_get_indexdef(i.indexrelid)) order by c.relname,i.indexrelid::regclass::text),'[]'::jsonb) from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'definition',pg_catalog.pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by c.relname,t.tgname),'[]'::jsonb) from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname),'[]'::jsonb) from pg_catalog.pg_policies p where p.schemaname='public')),
 'lsRoots',jsonb_build_object('customers',(select count(*) from public.billing_provider_customers),'subscriptions',(select count(*) from public.billing_provider_subscriptions),'checkouts',(select count(*) from public.billing_checkout_attempts),'plans',(select count(*) from public.billing_plan_change_operations),'planEvents',(select count(*) from public.billing_plan_change_events),'seats',(select count(*) from public.billing_seat_quantity_operations),'seatEvents',(select count(*) from public.billing_seat_quantity_events),'webhooks',(select count(*) from public.billing_provider_webhook_deliveries),'origins',(select count(*) from public.billing_canonical_origins where storage_contract='lemonsqueezy.v1'))
) as facts;`;

export async function readDeploymentInventory(
  { inputs, auth, mode, environment = "staging", env = process.env },
  transport = fetch,
) {
  // A protected, exact-commit envelope must already have passed local preflight.
  if (
    !["preflight", "apply"].includes(mode) ||
    env.GITHUB_ACTIONS !== "true" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    !/^[a-z]{20}$/.test(inputs.project ?? "") ||
    inputs.project !==
      (environment === "staging"
        ? env.STAGING_SUPABASE_PROJECT_REF
        : env.PRODUCTION_SUPABASE_PROJECT_REF) ||
    !auth?.retirement ||
    auth.retirement.environment !== environment ||
    !env.SUPABASE_ACCESS_TOKEN
  )
    throw new Error("AUTHORIZED_RETIREMENT_READ_REQUIRED");
  const request = async (suffix, options = {}) => {
    try {
      const response = await transport(
        `https://api.supabase.com/v1/projects/${inputs.project}/${suffix}`,
        {
          ...options,
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
          headers: {
            Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!response.ok) throw new Error();
      return await response.json();
    } catch {
      throw new Error("RETIREMENT_READ_ONLY_INVENTORY_FAILED");
    }
  };
  const functions = await request("functions");
  assertFunctionInventory(functions);
  const secrets = await request("secrets");
  if (
    !Array.isArray(secrets) ||
    new Set(secrets.map((s) => s.name)).size !== secrets.length ||
    secrets.some(
      (s) => typeof s.name !== "string" || typeof s.digest !== "string",
    )
  )
    throw new Error("RETIREMENT_SECRET_INVENTORY_INVALID");
  const rows = await request("database/query/read-only", {
    method: "POST",
    body: JSON.stringify({ query: INVENTORY_QUERY }),
  });
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !rows[0].facts ||
    !Array.isArray(rows[0].facts.versions) ||
    !Array.isArray(rows[0].facts.functions) ||
    !Array.isArray(rows[0].facts.tables) ||
    !validRoots(rows[0].facts.lsRoots) ||
    !["columns", "constraints", "indexes", "triggers", "policies"].every(
      (key) => Array.isArray(rows[0].facts.schema?.[key]),
    ) ||
    rows[0].facts.policy?.sales !== false ||
    rows[0].facts.policy?.reconciliation !== false
  )
    throw new Error("RETIREMENT_DATABASE_INVENTORY_INVALID");
  const inventory = {
    functions: functions
      .map((f) => ({
        name: f.name,
        id: f.id,
        version: f.version,
        verify_jwt: f.verify_jwt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    secretNamesAndDigests: secrets
      .map((s) => ({ name: s.name, digest: s.digest }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    facts: rows[0].facts,
  };
  // Retain only in private memory; no identifiers, secrets, definitions or payloads in logs.
  return { inventory, sha256: hash(JSON.stringify(inventory)) };
}
export function compareReviewedInventory(observation, auth) {
  if (
    !observation?.inventory?.facts ||
    !Array.isArray(observation.inventory.facts.versions) ||
    (auth.retirement.environment === "production" &&
      !validRoots(observation.inventory.facts.lsRoots))
  )
    throw new Error("RETIREMENT_DATABASE_INVENTORY_INVALID");
  if (
    observation.sha256 !== auth.retirement.inventorySha256 ||
    JSON.stringify(observation.inventory.facts.versions) !==
      JSON.stringify(auth.approvedRemoteVersions)
  )
    throw new Error("RETIREMENT_REMOTE_DRIFT");
  if (
    auth.retirement.environment === "production" &&
    Object.values(observation.inventory.facts.lsRoots).some((n) => n !== 0)
  )
    throw new Error("PRODUCTION_LS_ROOTS_NOT_ZERO");
}
