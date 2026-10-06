// Separate empty-project observation: the ordinary release observer requires schema 180.
// Imports are inert. The only network capabilities below are named-project GETs
// and the management API read-only SQL endpoint; no provider endpoint is used.
import { ensure } from "./staging-release-artifacts.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";
import {
  assertReplacementTarget,
  replacementPolicy,
} from "./staging-replacement-target.mjs";
import {
  normalizeFunctionInventory,
  normalizeSecrets,
  normalizeAuth,
  assertObservationFresh,
} from "./staging-release-observation.mjs";

export const EMPTY_DATABASE_QUERY = `select jsonb_build_object(
  'ledgerPresent',to_regclass('supabase_migrations.schema_migrations') is not null,
  'applicationRelations',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v','m','f','S')
    and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')),
  'applicationFunctions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and not exists(select 1 from pg_depend d
    where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
  'customSchemas',(select count(*) from pg_namespace where nspname !~ '^pg_' and nspname not in
    ('public','information_schema','auth','storage','extensions','realtime','_realtime','graphql','graphql_public','supabase_functions','supabase_migrations','vault','net','pgsodium','pgsodium_masks','cron','pgmq','pgmq_public','pgbouncer')),
  'authUsers',(select count(*) from auth.users),
  'storageObjects',(select count(*) from storage.objects),
  'storageBuckets',(select count(*) from storage.buckets)
) facts;`;
export const EMPTY_LEDGER_QUERY =
  "select coalesce(jsonb_agg(version order by version),'[]'::jsonb) versions from supabase_migrations.schema_migrations;";

export function assertEmptySnapshot(snapshot) {
  const f = snapshot.facts;
  ensure(
    f &&
      typeof f.ledgerPresent === "boolean" &&
      Array.isArray(f.versions) &&
      f.versions.length === 0,
    "BOOTSTRAP_LEDGER_NOT_EMPTY",
  );
  for (const key of [
    "applicationRelations",
    "applicationFunctions",
    "customSchemas",
    "authUsers",
    "storageObjects",
    "storageBuckets",
  ])
    ensure(f[key] === 0, "BOOTSTRAP_DATABASE_NOT_EMPTY");
  ensure(
    Array.isArray(snapshot.functions) && snapshot.functions.length === 0,
    "BOOTSTRAP_FUNCTIONS_NOT_EMPTY",
  );
}

export function createBootstrapObserver(
  context,
  env,
  transport = fetch,
  options = {},
) {
  const now = options.now ?? Date.now;
  const policy = options.policy ?? replacementPolicy;
  const request = async (suffix, query) => {
    assertReplacementTarget(context.project, context.origin, policy(), true);
    ensure(
      context.project === env.STAGING_SUPABASE_PROJECT_REF &&
        context.project !== env.PRODUCTION_SUPABASE_PROJECT_REF,
      "BOOTSTRAP_PROJECT_BOUNDARY",
    );
    try {
      const response = await transport(
        `https://api.supabase.com/v1/projects/${context.project}${suffix ? "/" + suffix : ""}`,
        {
          method: query ? "POST" : "GET",
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
          headers: {
            Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          ...(query ? { body: JSON.stringify({ query }) } : {}),
        },
      );
      ensure(response.ok, "BOOTSTRAP_READ_FAILED");
      return await response.json();
    } catch {
      throw new Error("BOOTSTRAP_READ_FAILED");
    }
  };
  const database = async () => {
    const rows = await request(
      "database/query/read-only",
      EMPTY_DATABASE_QUERY,
    );
    ensure(rows?.length === 1 && rows[0].facts, "BOOTSTRAP_DATABASE_INVALID");
    const facts = rows[0].facts;
    const ledger = facts.ledgerPresent
      ? await request("database/query/read-only", EMPTY_LEDGER_QUERY)
      : [{ versions: [] }];
    ensure(
      ledger?.length === 1 && Array.isArray(ledger[0].versions),
      "BOOTSTRAP_LEDGER_INVALID",
    );
    return { ...facts, versions: ledger[0].versions };
  };
  const metadata = async () => {
    const project = await request("");
    ensure(
      project.id === context.project && project.status === "ACTIVE_HEALTHY",
      "BOOTSTRAP_PROJECT_NOT_HEALTHY",
    );
    const functions = normalizeFunctionInventory(await request("functions"));
    const secrets = normalizeSecrets(await request("secrets"));
    const auth = normalizeAuth(await request("config/auth"));
    return {
      projectDigest: evidenceDigest(project),
      functions,
      secretNames: secrets.names,
      secretDigest: secrets.digest,
      authDigest: auth.digest,
      authConfig: auth.fields,
    };
  };
  const snapshot = async () => {
    const facts = await database(),
      meta = await metadata(),
      closingFacts = await database();
    ensure(
      evidenceDigest(facts) === evidenceDigest(closingFacts),
      "DATABASE_DRIFT",
    );
    const value = { facts, ...meta };
    assertEmptySnapshot(value);
    return value;
  };
  return {
    async observe() {
      const startedAt = new Date(now()).toISOString();
      const fresh = () =>
        assertObservationFresh(
          {
            observedAt: startedAt,
            stability: {
              stable: true,
              startedAt,
              completedAt: new Date(now()).toISOString(),
            },
          },
          now(),
        );
      const opening = await snapshot();
      fresh();
      const closing = await snapshot();
      fresh();
      const confirmation = await metadata();
      fresh();
      const surfaces = {
        DATABASE_DRIFT: (s) => evidenceDigest(s.facts),
        PROJECT_DRIFT: (s) => s.projectDigest,
        FUNCTION_INVENTORY_DRIFT: (s) => evidenceDigest(s.functions),
        CONFIGURATION_DRIFT: (s) => s.secretDigest,
        AUTH_CONFIGURATION_DRIFT: (s) => s.authDigest,
      };
      const final = { ...closing, ...confirmation };
      const categories = Object.entries(surfaces)
        .filter(
          ([, get]) =>
            get(opening) !== get(closing) || get(closing) !== get(final),
        )
        .map(([key]) => key);
      ensure(
        categories.length === 0,
        categories.length === 1 ? categories[0] : "MULTIPLE_SURFACE_DRIFT",
      );
      assertEmptySnapshot(final);
      const result = {
        ...final,
        digest: evidenceDigest(final),
        observedAt: startedAt,
        stability: {
          stable: true,
          categories: [],
          startedAt,
          completedAt: new Date(now()).toISOString(),
        },
      };
      assertObservationFresh(result, now());
      return result;
    },
    async ledgerCount() {
      const rows = await request(
        "database/query/read-only",
        EMPTY_LEDGER_QUERY,
      );
      ensure(
        rows?.length === 1 && Array.isArray(rows[0].versions),
        "BOOTSTRAP_LEDGER_INVALID",
      );
      return rows[0].versions.length;
    },
  };
}
