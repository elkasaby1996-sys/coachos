// Separate empty-project observation: the ordinary release observer requires schema 180.
// Imports are inert. The only network capabilities below are named-project GETs
// and the management API read-only SQL endpoint; no provider endpoint is used.
import { ensure } from "./staging-release-artifacts.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";
import {
  observeDatabaseProof,
  assertDatabaseProof,
  bootstrapDatabaseProfiles,
  BOOTSTRAP_EMPTY_DATABASE_QUERY,
  BOOTSTRAP_EMPTY_LEDGER_QUERY,
  SQL_CONTEXT,
} from "./staging-bootstrap-database.mjs";
import {
  validateVirginBaseline,
  assertBaselineSnapshot,
} from "./staging-bootstrap-baseline.mjs";
import { timingReviewPolicy } from "./staging-timing-evidence.mjs";
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

export const EMPTY_DATABASE_QUERY = BOOTSTRAP_EMPTY_DATABASE_QUERY;
export const EMPTY_LEDGER_QUERY = BOOTSTRAP_EMPTY_LEDGER_QUERY;

// Terminal bootstrap observation, including three genuine database reads around
// the unchanged v3 observer. Metadata and project evidence remain complete too.
export async function observeBootstrapRelease(
  empty,
  release,
  baseline,
  now = Date.now,
) {
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
  const openingMetadata = await empty.metadata();
  fresh();
  const opening = await empty.databaseProof(180);
  fresh();
  const value = await release.observe();
  fresh();
  assertObservationFresh(value, now());
  const closingMetadata = await empty.metadata();
  fresh();
  const closing = await empty.databaseProof(180);
  fresh();
  const confirmationMetadata = await empty.metadata();
  fresh();
  const confirmation = await empty.databaseProof(180);
  fresh();
  ensure(
    evidenceDigest(opening) === evidenceDigest(closing) &&
      evidenceDigest(closing) === evidenceDigest(confirmation),
    "DATABASE_DRIFT",
  );
  ensure(
    evidenceDigest(openingMetadata) === evidenceDigest(closingMetadata) &&
      evidenceDigest(closingMetadata) ===
        evidenceDigest(confirmationMetadata) &&
      confirmationMetadata.projectDigest ===
        baseline.capture.confirmation.projectDigest &&
      confirmationMetadata.secretDigest === value.secretDigest &&
      confirmationMetadata.authDigest === value.authDigest &&
      evidenceDigest(confirmationMetadata.functions) ===
        evidenceDigest(value.functions),
    "BOOTSTRAP_CONFIGURATION_DRIFT",
  );
  const proof = value.stability.proof;
  ensure(
    proof?.opening && proof.closing && proof.confirmation,
    "BOOTSTRAP_TERMINAL_PROOF_INCOMPLETE",
  );
  value.facts.databaseProof = confirmation;
  value.bootstrapMetadata = {
    opening: openingMetadata,
    closing: closingMetadata,
    confirmation: confirmationMetadata,
  };
  value.observedAt = startedAt;
  value.stability = {
    ...value.stability,
    startedAt,
    completedAt: new Date(now()).toISOString(),
    proof: Object.fromEntries(
      [
        ["opening", opening],
        ["closing", closing],
        ["confirmation", confirmation],
      ].map(([name, database]) => [
        name,
        {
          ...proof[name],
          DATABASE_DRIFT: evidenceDigest({
            release: proof[name].DATABASE_DRIFT,
            database,
            metadata: value.bootstrapMetadata[name],
          }),
        },
      ]),
    ),
  };
  value.digest = evidenceDigest({
    releaseDigest: value.digest,
    databaseProof: confirmation,
    bootstrapMetadata: value.bootstrapMetadata,
  });
  assertObservationFresh(value, now());
  return value;
}

export function assertEmptySnapshot(snapshot, baseline) {
  assertDatabaseProof(snapshot.facts?.databaseProof, 0, baseline);
  assertBaselineSnapshot(snapshot, baseline);
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
  const baseline = options.baseline;
  const validate = () =>
    validateVirginBaseline(
      baseline,
      options.identity,
      context,
      policy(),
      now(),
      (options.reviewPolicy ?? timingReviewPolicy)(),
    );
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
    ensure(
      rows?.length === 1 &&
        rows[0].facts &&
        evidenceDigest(rows[0].facts.sqlContext) ===
          evidenceDigest(SQL_CONTEXT),
      "BOOTSTRAP_DATABASE_INVALID",
    );
    const facts = rows[0].facts;
    const ledger = facts.ledgerPresent
      ? await request("database/query/read-only", EMPTY_LEDGER_QUERY)
      : [{ ledger: { versions: [], sqlContext: SQL_CONTEXT } }];
    ensure(
      ledger?.length === 1 &&
        Array.isArray(ledger[0].ledger?.versions) &&
        evidenceDigest(ledger[0].ledger.sqlContext) ===
          evidenceDigest(SQL_CONTEXT),
      "BOOTSTRAP_LEDGER_INVALID",
    );
    const proof = await observeDatabaseProof(
      (sql) => request("database/query/read-only", sql),
      0,
    );
    assertDatabaseProof(proof, 0, baseline);
    const namespaces = new Set(
      baseline.databaseProof.catalog
        .filter((r) => r[0] === "namespace")
        .map((r) => r[1]),
    );
    return {
      ...facts,
      customSchemas: proof.catalog.filter(
        (r) => r[0] === "namespace" && !namespaces.has(r[1]),
      ).length,
      versions: ledger[0].ledger.versions,
      databaseProof: proof,
    };
  };
  const metadata = async () => {
    const project = await request("");
    ensure(
      project.id === context.project &&
        project.status === "ACTIVE_HEALTHY" &&
        project.organization_id === baseline.target.organization &&
        Date.parse(project.created_at) ===
          Date.parse(baseline.creation.createdAt),
      "BOOTSTRAP_PROJECT_NOT_HEALTHY",
    );
    const functions = normalizeFunctionInventory(await request("functions"));
    const secrets = normalizeSecrets(await request("secrets"));
    const rawAuth = await request("config/auth");
    const auth = normalizeAuth(rawAuth);
    const p = bootstrapDatabaseProfiles();
    ensure(
      p.authBooleanFields.every((k) => rawAuth[k] === false) &&
        p.authEmptyStringFields.every(
          (k) => Object.hasOwn(rawAuth, k) && [null, ""].includes(rawAuth[k]),
        ),
      "BOOTSTRAP_CUSTOMER_AUTH_CONFIGURATION",
    );
    ensure(
      !Object.entries(rawAuth).some(
        ([k, v]) =>
          /^hook_.*_enabled$|^external_.*_enabled$|^(saml|oauth|scim|custom_oauth).*_enabled$/.test(
            k,
          ) &&
          !["external_email_enabled", "external_phone_enabled"].includes(k) &&
          v !== false,
      ),
      "BOOTSTRAP_CUSTOMER_AUTH_CONFIGURATION",
    );
    ensure(
      !Object.entries(rawAuth).some(
        ([k, v]) =>
          /^hook_.*_(uri|secrets)$|^external_.*_(client_id|additional_client_ids|secret|url)$|^nimbus_oauth_(client_id|client_secret)$|^scim_/.test(
            k,
          ) && ![false, null, "", 0].includes(v),
      ),
      "BOOTSTRAP_CUSTOMER_AUTH_CONFIGURATION",
    );
    const sso = await request("config/auth/sso/providers"),
      integrations = await request("config/auth/third-party-auth");
    ensure(
      sso &&
        Object.keys(sso).length === 1 &&
        Array.isArray(sso.items) &&
        sso.items.length === 0 &&
        Array.isArray(integrations) &&
        integrations.length === 0,
      "BOOTSTRAP_CUSTOMER_AUTH_INTEGRATIONS",
    );
    return {
      projectDigest: evidenceDigest(project),
      project,
      functions,
      secretNames: secrets.names,
      secretDigest: secrets.digest,
      authDigest: auth.digest,
      authConfig: auth.fields,
      authCustomerState: {
        complete: true,
        unapprovedIntegrations: 0,
        integrationDigest: evidenceDigest({ sso, integrations }),
      },
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
    assertEmptySnapshot(value, baseline);
    return value;
  };
  return {
    metadata: async () => {
      validate();
      return metadata();
    },
    databaseProof: async (count) => {
      validate();
      const proof = await observeDatabaseProof(
        (sql) => request("database/query/read-only", sql),
        count,
      );
      assertDatabaseProof(proof, count, baseline);
      return proof;
    },
    async observe() {
      const startedAt = new Date(now()).toISOString();
      validate();
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
      const confirmation = await snapshot();
      fresh();
      const surfaces = {
        DATABASE_DRIFT: (s) => evidenceDigest(s.facts),
        PROJECT_DRIFT: (s) => s.projectDigest,
        FUNCTION_INVENTORY_DRIFT: (s) => evidenceDigest(s.functions),
        CONFIGURATION_DRIFT: (s) => s.secretDigest,
        AUTH_CONFIGURATION_DRIFT: (s) => s.authDigest,
      };
      const final = {
        ...confirmation,
        baselineEvidenceSha256: evidenceDigest(baseline),
      };
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
      assertEmptySnapshot(final, baseline);
      const result = {
        ...final,
        digest: evidenceDigest(final),
        observedAt: startedAt,
        stability: {
          stable: true,
          categories: [],
          proof: Object.fromEntries(
            [
              ["opening", opening],
              ["closing", closing],
              ["confirmation", final],
            ].map(([name, snapshot]) => [
              name,
              Object.fromEntries(
                Object.entries(surfaces).map(([key, get]) => [
                  key,
                  get(snapshot),
                ]),
              ),
            ]),
          ),
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
        rows?.length === 1 &&
          Array.isArray(rows[0].ledger?.versions) &&
          evidenceDigest(rows[0].ledger.sqlContext) ===
            evidenceDigest(SQL_CONTEXT),
        "BOOTSTRAP_LEDGER_INVALID",
      );
      return rows[0].ledger.versions.length;
    },
  };
}
