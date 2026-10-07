import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { INVENTORY_QUERY } from "./billing-retirement-remote-inventory.mjs";
import {
  hash,
  assertFunctionInventory,
} from "./billing-retirement-release.mjs";
import {
  ensure,
  canonical,
  dependencyClosure,
  CONTAINMENT_SOURCE,
} from "./staging-release-artifacts.mjs";
import { LS_TOMBSTONES } from "./billing-deployment-contract.mjs";
import { assertReplacementTarget } from "./staging-replacement-target.mjs";
import {
  webhookHistoryQuery,
  classifyWebhookHistory,
  evidenceDigest,
} from "./staging-release-webhook-history.mjs";

export const EMPTY_WEBHOOK_REVIEW = Object.freeze({
  schemaVersion: 1,
  evidenceSha256: evidenceDigest([]),
  records: [],
});

export const OBSERVATION_MAX_AGE_MS = 60_000;
const DRIFT_CATEGORIES = Object.freeze([
  "DATABASE_DRIFT",
  "FUNCTION_INVENTORY_DRIFT",
  "CONFIGURATION_DRIFT",
  "AUTH_CONFIGURATION_DRIFT",
]);
// JSON object ordering is irrelevant; array ordering remains significant unless
// a specific API inventory below explicitly defines it as a set.
function orderedJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(orderedJson);
  ensure(value && typeof value === "object", "RELEASE_METADATA_INVALID");
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, orderedJson(value[key])]),
  );
}
const orderedDigest = (value) => hash(canonical(orderedJson(value)));
export function normalizeFunctionInventory(values) {
  assertFunctionInventory(values);
  return values
    .map((value) => {
      const fields = ["name", "id", "version", "verify_jwt", "status"];
      const identity = Object.fromEntries(
        fields
          .filter((key) => Object.hasOwn(value, key))
          .map((key) => [key, orderedJson(value[key])]),
      );
      // Bind additional generation/source metadata without exporting its values.
      const metadata = Object.fromEntries(
        Object.entries(value).filter(([key]) => !fields.includes(key)),
      );
      return { ...identity, metadataDigest: orderedDigest(metadata) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
function validSecretTimestamp(value) {
  if (typeof value !== "string") return false;
  // Supported RFC3339 representation: calendar date, seconds, optional fractional
  // seconds and an explicit timezone. Validate without round-tripping precision.
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match || match[0] !== value) return false;
  const [, y, m, d, h, min, sec, zone] = match;
  const year = Number(y),
    month = Number(m),
    day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year > 0 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= days[month - 1] &&
    Number(h) <= 23 &&
    Number(min) <= 59 &&
    Number(sec) <= 59 &&
    (zone === "Z" ||
      (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4)) <= 59)) &&
    Number.isFinite(Date.parse(value))
  );
}
export function normalizeSecrets(values) {
  const code = "RELEASE_SECRET_INVENTORY_INVALID";
  ensure(Array.isArray(values), code);
  const names = new Set();
  // PRIVATE contract of GET https://api.supabase.com/v1/projects/{project}/secrets:
  // this hosted endpoint's `value` is SHA256 digest metadata, not plaintext.
  // Never apply this interpretation to CLI envelopes or unrelated secret APIs.
  const records = values
    .map((record) => {
      ensure(
        record !== null &&
          typeof record === "object" &&
          Object.getPrototypeOf(record) === Object.prototype,
        code,
      );
      ensure(
        Reflect.ownKeys(record).every((key) =>
          ["name", "value", "updated_at"].includes(key),
        ) &&
          Object.hasOwn(record, "name") &&
          Object.hasOwn(record, "value"),
        code,
      );
      const { name, value } = record;
      ensure(
        typeof name === "string" &&
          name.length > 0 &&
          name.trim() === name &&
          Array.from(name).every((character) => {
            const codePoint = character.codePointAt(0);
            return codePoint > 31 && (codePoint < 127 || codePoint > 159);
          }) &&
          !names.has(name),
        code,
      );
      ensure(
        typeof value === "string" &&
          value.length === 64 &&
          /^[a-f0-9]{64}$/.test(value),
        code,
      );
      const present = Object.hasOwn(record, "updated_at");
      ensure(!present || validSecretTimestamp(record.updated_at), code);
      names.add(name);
      return {
        name,
        digest: value,
        updatedAt: present ? record.updated_at : null,
      };
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  // Component digests/timestamps live only through aggregate identity creation.
  return {
    names: records.map((record) => record.name),
    digest: orderedDigest(records),
  };
}
export function normalizeAuth(value) {
  ensure(
    value &&
      !Array.isArray(value) &&
      typeof value.site_url === "string" &&
      typeof value.uri_allow_list === "string" &&
      typeof value.disable_signup === "boolean" &&
      typeof value.mailer_autoconfirm === "boolean",
    "RELEASE_AUTH_CONFIGURATION_INVALID",
  );
  const normalized = orderedJson({
    ...value,
    uri_allow_list: value.uri_allow_list.split(",").sort().join(","),
  });
  // Only the non-secret contract fields leave this private normalization step.
  // The digest preserves changes to every other Auth field without retaining
  // those values in release evidence (the API can contain private credentials).
  const fields = [
    "site_url",
    "uri_allow_list",
    "disable_signup",
    "mailer_autoconfirm",
  ];
  return {
    fields: Object.fromEntries(fields.map((key) => [key, normalized[key]])),
    digest: orderedDigest(normalized),
  };
}
function normalizedDatabase(facts) {
  return orderedJson({
    ...facts,
    functions: [...facts.functions].sort((a, b) =>
      a.signature.localeCompare(b.signature),
    ),
    tables: [...facts.tables].sort((a, b) => a.name.localeCompare(b.name)),
  });
}
function drift(categories) {
  const error = new Error(
    categories.length === 1 ? categories[0] : "MULTIPLE_SURFACE_DRIFT",
  );
  error.stability = { stable: false, categories };
  throw error;
}
export function assertObservationFresh(observation, now = Date.now()) {
  const startedAt = Date.parse(observation.observedAt);
  const completedAt = Date.parse(observation.stability?.completedAt);
  ensure(
    observation.stability?.stable === true,
    "RELEASE_OBSERVATION_UNPROVEN",
  );
  ensure(
    observation.stability.startedAt === observation.observedAt &&
      Number.isFinite(startedAt) &&
      Number.isFinite(completedAt) &&
      startedAt <= completedAt &&
      completedAt <= now &&
      now - startedAt <= OBSERVATION_MAX_AGE_MS,
    "RELEASE_OBSERVATION_STALE",
  );
}

export const databaseContract = (facts) =>
  hash(
    canonical({
      functions: facts.functions
        .map((f) => ({
          signature: f.signature.replace(/^public\./, ""),
          definition: f.definition.replace(/\r\n/g, "\n"),
          applicationExecutable: f.applicationExecutable,
          publicExecutable: f.publicExecutable,
          acl: f.acl,
        }))
        .sort((a, b) => a.signature.localeCompare(b.signature)),
      tables: facts.tables
        .map((t) => ({ name: t.name, acl: t.acl, rls: t.rls }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      schema: facts.schema,
    }),
  );
// Entire statements are fixed SELECTs; no helper installation or advisory-lock write.
export function historyQuery(tables) {
  ensure(
    Array.isArray(tables) &&
      tables.length > 0 &&
      tables.every((t) => /^[a-z_][a-z0-9_]*$/.test(t)),
    "RELEASE_HISTORY_TABLE_INVALID",
  );
  return (
    "select jsonb_object_agg(name,digest) history from (" +
    tables
      .map(
        (t) =>
          `select '${t}' name,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) digest from public."${t}" t`,
      )
      .join(" union all ") +
    " union all select 'auth.users' name,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) digest from auth.users t" +
    ") q"
  );
}
export function workQuery(hasPaymentMethod, tables) {
  const count = (table, condition) =>
    `(select count(*) from public.${table} where ${condition})`;
  const busy = "status not in ('completed','canceled','failed','scheduled')";
  const categories = {
    legacyCheckouts: count(
      "billing_checkout_attempts",
      "status in ('creating','ready','ambiguous')",
    ),
    paddleCheckouts: count(
      "billing_checkouts_v2",
      "status in ('creating','ready','ambiguous')",
    ),
    legacyPlans: count("billing_plan_change_operations", busy),
    legacySeats: count("billing_seat_quantity_operations", busy),
    paddleOperations: count("billing_operations_v2", busy),
    paymentMethods: hasPaymentMethod
      ? count(
          "billing_payment_method_preparations_v2",
          "status in ('creating','ready','ambiguous')",
        )
      : "0",
    legacyWebhooks: count(
      "billing_provider_webhook_deliveries",
      "processing_status not in ('processed','ignored')",
    ),
    paddleWebhooks: count(
      "billing_webhook_events_v2",
      "processing_status not in ('processed','ignored')",
    ),
    certificationFixtures: count(
      "billing_paddle_checkout_certification_fixtures",
      "closed_at is null",
    ),
  };
  return (
    "select jsonb_build_object(" +
    Object.entries(categories)
      .map(([k, v]) => `'${k}',${v}`)
      .join(",") +
    ") work, (select jsonb_build_object('count',count(*),'invalidBoundaries',count(*) filter (where effective_at is null or not isfinite(effective_at)),'earliest',min(effective_at)) from (select effective_at from public.billing_operations_v2 where status='scheduled' union all select effective_at from public.billing_plan_change_operations where status='scheduled' union all select effective_at from public.billing_seat_quantity_operations where status='scheduled') s) scheduled" +
    (tables ? `, (${webhookHistoryQuery(tables)}) webhook_history` : "")
  );
}
export function createRemoteAdapter(
  context,
  env = process.env,
  transport = fetch,
  webhookReview = EMPTY_WEBHOOK_REVIEW,
) {
  const wrapper = resolve("scripts/supabase-remote-guard.mjs");
  const boundary = () => {
    assertReplacementTarget(context.project, context.origin);
    ensure(
      context.project === env.STAGING_SUPABASE_PROJECT_REF &&
        context.project !== env.PRODUCTION_SUPABASE_PROJECT_REF,
      "RELEASE_PROJECT_BOUNDARY",
    );
  };
  const request = async (suffix, options = {}) => {
    boundary();
    ensure(
      context.project === env.STAGING_SUPABASE_PROJECT_REF &&
        context.project !== env.PRODUCTION_SUPABASE_PROJECT_REF,
      "RELEASE_PROJECT_BOUNDARY",
    );
    try {
      const response = await transport(
        `https://api.supabase.com/v1/projects/${context.project}/${suffix}`,
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
      ensure(response.ok, "RELEASE_READ_FAILED");
      return await response.json();
    } catch {
      throw new Error("RELEASE_READ_FAILED");
    }
  };
  const query = (sql) =>
    request("database/query/read-only", {
      method: "POST",
      body: canonical({ query: sql }),
    });
  const command = (args, directory) => {
    boundary();
    try {
      const result = spawnSync(process.execPath, [wrapper, ...args], {
        cwd: directory,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 16 * 1024 * 1024,
      });
      ensure(
        !result.error && !result.signal && result.status === 0,
        "RELEASE_CLI_FAILED",
      );
      // Supabase prints dry-run filenames to stderr on supported platforms.
      // Keep both streams private; only the exact filename parser consumes them.
      return result.stdout + "\n" + result.stderr;
    } catch {
      throw new Error("RELEASE_CLI_FAILED");
    }
  };
  const snapshot = async () => {
    const rows = await query(INVENTORY_QUERY);
    ensure(
      rows?.length === 1 && rows[0].facts,
      "RELEASE_DATABASE_INVENTORY_INVALID",
    );
    const facts = rows[0].facts;
    const database = normalizedDatabase(facts);
    const functions = normalizeFunctionInventory(await request("functions"));
    const secrets = normalizeSecrets(
      await request("secrets", { method: "GET" }),
    );
    const auth = normalizeAuth(await request("config/auth"));
    const history = await query(historyQuery(facts.tables.map((t) => t.name)));
    const work = await query(
      workQuery(
        facts.tables.some(
          (t) => t.name === "billing_payment_method_preparations_v2",
        ),
        facts.tables.map((t) => t.name),
      ),
    );
    const endRows = await query(INVENTORY_QUERY);
    if (
      endRows?.length !== 1 ||
      orderedDigest(normalizedDatabase(endRows[0].facts)) !==
        orderedDigest(database)
    )
      drift(["DATABASE_DRIFT"]);
    facts.history = history[0].history;
    facts.work = work[0].work;
    ensure(
      canonical(Object.keys(work[0].webhook_history ?? {}).sort()) ===
        canonical(facts.tables.map((t) => t.name).sort()),
      "RELEASE_WEBHOOK_SNAPSHOT_SCOPE",
    );
    ensure(
      Object.values(work[0].webhook_history).every(
        (rows) =>
          Array.isArray(rows) &&
          rows.every((row) =>
            /^[a-f0-9]{64}$/.test(row.__release_row_sha256 ?? ""),
          ),
      ),
      "RELEASE_WEBHOOK_ROW_DIGEST_MISSING",
    );
    facts.webhookHistory = classifyWebhookHistory(
      work[0].webhook_history,
      webhookReview,
    );
    ensure(
      facts.webhookHistory.retainedNonterminalWebhookCount ===
        facts.work.paddleWebhooks,
      "RELEASE_WEBHOOK_COUNT_DRIFT",
    );
    facts.work.paddleWebhooks = facts.webhookHistory.activeBlockingWebhookCount;
    facts.scheduled = work[0].scheduled;
    facts.contractDigest = databaseContract(facts);
    return {
      facts,
      functions,
      auth,
      surfaceDigests: {
        DATABASE_DRIFT: orderedDigest({
          database,
          history: facts.history,
          work: facts.work,
          webhookHistory: facts.webhookHistory,
          scheduled: facts.scheduled,
        }),
        FUNCTION_INVENTORY_DRIFT: orderedDigest(functions),
        CONFIGURATION_DRIFT: secrets.digest,
        AUTH_CONFIGURATION_DRIFT: auth.digest,
      },
    };
  };
  return {
    async observe() {
      // The oldest read, not completion, determines the age of this observation.
      const startedAt = Date.now();
      const fresh = () =>
        ensure(
          Date.now() >= startedAt &&
            Date.now() - startedAt <= OBSERVATION_MAX_AGE_MS,
          "RELEASE_OBSERVATION_STALE",
        );
      const opening = await snapshot();
      fresh();
      const closing = await snapshot();
      fresh();
      // Database/history collection can be slow. Confirm non-database surfaces
      // again at its end so a change after an early closing read is not hidden.
      // These independent read-only requests share the original freshness clock.
      const [functionResponse, secretResponse, authResponse] =
        await Promise.all([
          request("functions"),
          request("secrets", { method: "GET" }),
          request("config/auth"),
        ]);
      fresh();
      const confirmedFunctions = normalizeFunctionInventory(functionResponse);
      const confirmedSecrets = normalizeSecrets(secretResponse);
      const confirmedAuth = normalizeAuth(authResponse);
      const confirmedDigests = {
        ...closing.surfaceDigests,
        FUNCTION_INVENTORY_DRIFT: orderedDigest(confirmedFunctions),
        CONFIGURATION_DRIFT: confirmedSecrets.digest,
        AUTH_CONFIGURATION_DRIFT: confirmedAuth.digest,
      };
      const categories = DRIFT_CATEGORIES.filter(
        (key) =>
          opening.surfaceDigests[key] !== closing.surfaceDigests[key] ||
          closing.surfaceDigests[key] !== confirmedDigests[key],
      );
      if (categories.length) drift(categories);
      const observation = {
        observedAt: new Date(startedAt).toISOString(),
        functions: confirmedFunctions,
        secretNames: confirmedSecrets.names,
        secretDigest: confirmedDigests.CONFIGURATION_DRIFT,
        authDigest: confirmedAuth.digest,
        authConfig: confirmedAuth.fields,
        facts: closing.facts,
        stability: {
          stable: true,
          categories: [],
          proof: {
            opening: opening.surfaceDigests,
            closing: closing.surfaceDigests,
            confirmation: confirmedDigests,
          },
          startedAt: new Date(startedAt).toISOString(),
          completedAt: new Date(Date.now()).toISOString(),
        },
      };
      observation.digest = orderedDigest({
        schemaVersion: 1,
        surfaces: confirmedDigests,
      });
      return observation;
    },
    command,
    async verifyArtifact(name, expected, mode) {
      const directory = mkdtempSync(join(tmpdir(), "repsync-release-proof-"));
      try {
        command(
          [
            "functions",
            "download",
            name,
            "--use-api",
            "--project-ref",
            context.project,
          ],
          directory,
        );
        const contents = dependencyClosure(directory, name);
        if (mode === "containment" && !LS_TOMBSTONES.includes(name)) {
          ensure(
            contents.length === 1 && contents[0].source === CONTAINMENT_SOURCE,
            "RELEASE_CONTAINMENT_IDENTITY",
          );
          return hash(contents[0].source);
        }
        const actual = hash(
          canonical(
            contents.map(({ path, source }) => ({
              path,
              sha256: hash(source),
            })),
          ),
        );
        ensure(actual === expected.digest, "RELEASE_DEPLOYED_SOURCE_MISMATCH");
        return actual;
      } finally {
        ensure(
          relative(resolve(tmpdir()), resolve(directory)).startsWith(
            "repsync-release-proof-",
          ),
          "ARTIFACT_CLEANUP_BOUNDARY",
        );
        rmSync(directory, { recursive: true, force: true });
      }
    },
    async probe(name) {
      boundary();
      ensure(LS_TOMBSTONES.includes(name), "RELEASE_PROBE_ALLOWLIST");
      ensure(env.STAGING_TOMBSTONE_PROBE_JWT, "RELEASE_PROBE_AUTH_REQUIRED");
      try {
        const response = await transport(
          `https://${context.project}.supabase.co/functions/v1/${name}`,
          {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
            headers: {
              Authorization: `Bearer ${env.STAGING_TOMBSTONE_PROBE_JWT}`,
              "Content-Type": "application/json",
            },
            body: "{}",
          },
        );
        const body = await response.json();
        ensure(
          response.status === 410 &&
            body.code ===
              (name === "billing-create-customer-portal-link"
                ? "BILLING_PORTAL_RETIRED"
                : "BILLING_PROVIDER_RETIRED"),
          "RELEASE_TOMBSTONE_PROBE_FAILED",
        );
      } catch {
        throw new Error("RELEASE_TOMBSTONE_PROBE_FAILED");
      }
    },
  };
}
