// Read-only assessment of an installed staging database. No migration, link,
// deployment, provider call, backup claim, or change to retained billing history.
import { appendFileSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectStagingBilling,
  readBoundedStagingJson,
  STAGING_PROJECT,
} from "./staging-billing-status.mjs";
import {
  INVENTORY_QUERY,
  LS_ROOT_KEYS,
} from "./billing-retirement-remote-inventory.mjs";
import {
  databaseContract,
  historyQuery,
  workQuery,
  normalizeFunctionInventory,
} from "./staging-release-observation.mjs";
import { releaseIdentity, canonical } from "./staging-release-artifacts.mjs";
import { hash } from "./billing-retirement-release.mjs";
import {
  compareSchemaObjects,
  verifySchemaReference,
} from "./staging-schema-diagnostics.mjs";

// Aggregate, bounded categories only. No IDs, provider references, payloads,
// free-form error strings, or row-level values leave the database.
export const WORK_DETAIL_QUERY = `select
  jsonb_build_object(
    'webhooks', (select coalesce(jsonb_agg(to_jsonb(g) order by environment,status),'[]'::jsonb) from (
      select case when environment in ('test','live') then environment else 'unknown' end environment,
        case when processing_status in ('received','deferred','failed','manual_review') then processing_status else 'unknown' end status, count(*) count
      from public.billing_webhook_events_v2 where processing_status not in ('processed','ignored') group by 1,2) g),
    'scheduled', (select coalesce(jsonb_agg(to_jsonb(g) order by source,environment,timing),'[]'::jsonb) from (
      select source, case when environment in ('test','live') then environment else 'unknown' end environment,
        case when effective_at is null or not isfinite(effective_at) then 'invalid' when effective_at <= now() then 'overdue' else 'future' end timing, count(*) count
      from (
        select 'paddle'::text source,environment,effective_at from public.billing_operations_v2 where status='scheduled'
        union all select 'legacyPlans',s.environment,o.effective_at from public.billing_plan_change_operations o left join public.billing_provider_subscriptions s on s.id=o.billing_provider_subscription_id where o.status='scheduled'
        union all select 'legacySeats',s.environment,o.effective_at from public.billing_seat_quantity_operations o left join public.billing_provider_subscriptions s on s.id=o.billing_provider_subscription_id where o.status='scheduled'
      ) operations group by 1,2,3) g),
    'subscriptions', (select coalesce(jsonb_agg(to_jsonb(g) order by provider,environment,status),'[]'::jsonb) from (
      select provider,case when environment in ('test','live') then environment else 'unknown' end environment,
        case when provider_status in ('active','trialing','on_trial','past_due','paused','canceled','cancelled','expired','unpaid') then provider_status else 'unknown' end status,count(*) count
      from (
        select 'paddle'::text provider,environment,provider_status from public.billing_subscriptions_v2
        union all select 'lemonsqueezy',environment,provider_status from public.billing_provider_subscriptions
      ) subscriptions group by 1,2,3) g)
  ) details,
  jsonb_build_object('postgresVersion',current_setting('server_version_num')::integer,
    'searchPath',case current_setting('search_path') when 'public, extensions' then 'public, extensions' when '"$user", public, extensions' then '"$user", public, extensions' when 'public' then 'public' when '"$user", public' then '"$user", public' when 'pg_catalog' then 'pg_catalog' else 'other' end,
    'sessionRole',case when current_user in ('postgres','supabase_admin') then current_user::text else 'other' end) rendering;`;

const WORK_KEYS = [
  "legacyCheckouts",
  "paddleCheckouts",
  "legacyPlans",
  "legacySeats",
  "paddleOperations",
  "paymentMethods",
  "legacyWebhooks",
  "paddleWebhooks",
  "certificationFixtures",
];
class ReadinessError extends Error {
  constructor(code, httpStatus) {
    super(code);
    this.httpStatus = httpStatus;
  }
}
const requireEvidence = (ok, code = "UPGRADE_RESPONSE_INVALID") => {
  if (!ok) throw new ReadinessError(code);
};
const count = (n) => Number.isSafeInteger(n) && n >= 0;
const single = (rows) => {
  requireEvidence(Array.isArray(rows) && rows.length === 1 && rows[0]);
  return rows[0];
};
const sortedObject = (value) =>
  Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
  );
function localRelease(env) {
  let schemaReference;
  if (env.STAGING_SCHEMA_REFERENCE_PATH) {
    const path = env.STAGING_SCHEMA_REFERENCE_PATH;
    requireEvidence(
      statSync(path).isFile() && statSync(path).size <= 32 * 1024 * 1024,
      "UPGRADE_SCHEMA_REFERENCE_INVALID",
    );
    schemaReference = JSON.parse(readFileSync(path, "utf8"));
    requireEvidence(
      schemaReference &&
        typeof schemaReference === "object" &&
        !Array.isArray(schemaReference),
      "UPGRADE_SCHEMA_REFERENCE_INVALID",
    );
  }
  return {
    identity: releaseIdentity(),
    checkpoints: JSON.parse(
      readFileSync(
        new URL("../config/staging-release-checkpoints.json", import.meta.url),
        "utf8",
      ),
    ),
    schemaReference,
  };
}

export async function inspectUpgradeReadiness({
  env = process.env,
  transport = fetch,
  readLocal = () => localRelease(env),
  now = Date.now,
} = {}) {
  const started = now();
  const inventory = await inspectStagingBilling({ env, transport });
  if (inventory.status !== "inspected") return inventory;
  const report = {
    ...inventory,
    upgradeReadiness: {
      status: "not_assessed",
      deploymentAuthorized: false,
      recoveryVerified: false,
      deployedSourceVerified: false,
    },
  };
  const assessment = report.upgradeReadiness;
  const applied = inventory.migrations.appliedCount;
  if (
    !inventory.migrations.matchesApprovedVersionPrefix ||
    applied < 180 ||
    applied > 188
  ) {
    assessment.reason =
      applied === 0
        ? "INITIAL_INSTALLATION_REQUIRED"
        : "UPGRADE_UNSUPPORTED_HISTORY";
    return report;
  }
  let stage = "local_contract";
  try {
    const { identity, checkpoints, schemaReference } = readLocal();
    requireEvidence(
      checkpoints.frozenPayloadCommit === identity.payload.frozenCommit &&
        checkpoints.manifestDigest === hash(canonical(identity.manifest)) &&
        /^[a-f0-9]{64}$/.test(
          checkpoints.checkpoints[String(applied)]?.digest ?? "",
        ),
      "UPGRADE_LOCAL_CONTRACT_INVALID",
    );
    let expectedSchema;
    if (schemaReference) {
      try {
        expectedSchema = verifySchemaReference(
          schemaReference,
          identity,
          checkpoints,
          applied,
        );
      } catch {
        throw new ReadinessError("UPGRADE_SCHEMA_REFERENCE_INVALID");
      }
    }
    const expectedVersions = identity.manifest.migrations.approved
      .slice(0, applied)
      .map((m) => m.filename.slice(0, 14));
    assessment.migrations = {
      from: applied,
      to: 188,
      pending: identity.manifest.migrations.approved
        .slice(applied)
        .map(({ filename, sha256 }) => ({ filename, sha256 })),
      payloadCommit: identity.payload.frozenCommit,
    };
    async function request(resource, query, limit = 1024 * 1024) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await transport(
          `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/${resource}`,
          {
            method: query === undefined ? "GET" : "POST",
            redirect: "error",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN.trim()}`,
              "Content-Type": "application/json",
            },
            ...(query === undefined ? {} : { body: JSON.stringify({ query }) }),
          },
        );
        if (!response.ok)
          throw new ReadinessError(
            "UPGRADE_READ_ONLY_REQUEST_FAILED",
            response.status,
          );
        return await readBoundedStagingJson(response, limit);
      } catch (error) {
        if (error instanceof ReadinessError) throw error;
        throw new ReadinessError("UPGRADE_READ_ONLY_RESPONSE_UNAVAILABLE");
      } finally {
        clearTimeout(timeout);
        controller.abort();
      }
    }
    const sql = (query, limit) =>
      request("database/query/read-only", query, limit);
    async function snapshot() {
      const facts = single(await sql(INVENTORY_QUERY, 8 * 1024 * 1024)).facts;
      requireEvidence(
        facts &&
          Array.isArray(facts.versions) &&
          Array.isArray(facts.functions) &&
          Array.isArray(facts.tables) &&
          facts.schema,
      );
      requireEvidence(
        canonical(facts.versions) === canonical(expectedVersions),
        "UPGRADE_LEDGER_CHANGED",
      );
      requireEvidence(
        ["columns", "constraints", "indexes", "triggers", "policies"].every(
          (k) => Array.isArray(facts.schema[k]),
        ),
      );
      requireEvidence(LS_ROOT_KEYS.every((k) => count(facts.lsRoots?.[k])));
      const tables = facts.tables.map((t) => t.name).sort();
      requireEvidence(
        tables.length > 0 &&
          new Set(tables).size === tables.length &&
          tables.every((t) => /^[a-z_][a-z0-9_]*$/.test(t)),
      );
      const work = single(
        await sql(
          workQuery(tables.includes("billing_payment_method_preparations_v2")),
        ),
      );
      requireEvidence(WORK_KEYS.every((k) => count(work.work?.[k])));
      requireEvidence(
        count(work.scheduled?.count) && count(work.scheduled.invalidBoundaries),
      );
      requireEvidence(
        work.scheduled.earliest === null ||
          (typeof work.scheduled.earliest === "string" &&
            Number.isFinite(Date.parse(work.scheduled.earliest))),
      );
      const detail = single(await sql(WORK_DETAIL_QUERY));
      const realm = ["test", "live", "unknown"];
      const validGroups = (rows, categories) =>
        Array.isArray(rows) &&
        rows.length <= 100 &&
        rows.every(
          (row) =>
            row &&
            count(row.count) &&
            Object.keys(row).length === Object.keys(categories).length + 1 &&
            Object.entries(categories).every(([key, allowed]) =>
              allowed.includes(row[key]),
            ),
        ) &&
        new Set(
          rows.map((row) =>
            JSON.stringify(Object.keys(categories).map((key) => row[key])),
          ),
        ).size === rows.length;
      requireEvidence(
        detail.details &&
          validGroups(detail.details.webhooks, {
            environment: realm,
            status: [
              "received",
              "deferred",
              "failed",
              "manual_review",
              "unknown",
            ],
          }) &&
          validGroups(detail.details.scheduled, {
            source: ["paddle", "legacyPlans", "legacySeats"],
            environment: realm,
            timing: ["invalid", "overdue", "future"],
          }) &&
          validGroups(detail.details.subscriptions, {
            provider: ["paddle", "lemonsqueezy"],
            environment: realm,
            status: [
              "active",
              "trialing",
              "on_trial",
              "past_due",
              "paused",
              "canceled",
              "cancelled",
              "expired",
              "unpaid",
              "unknown",
            ],
          }) &&
          detail.details.webhooks.reduce((sum, row) => sum + row.count, 0) ===
            work.work.paddleWebhooks &&
          detail.details.scheduled.reduce((sum, row) => sum + row.count, 0) ===
            work.scheduled.count &&
          count(detail.rendering?.postgresVersion) &&
          [
            "public, extensions",
            '"$user", public, extensions',
            "public",
            '"$user", public',
            "pg_catalog",
            "other",
          ].includes(detail.rendering.searchPath) &&
          ["postgres", "supabase_admin", "other"].includes(
            detail.rendering.sessionRole,
          ),
      );
      const history = single(await sql(historyQuery(tables))).history;
      requireEvidence(
        history &&
          !Array.isArray(history) &&
          Object.keys(history).length === tables.length + 1 &&
          [...tables, "auth.users"].every(
            (t) =>
              typeof history[t] === "string" &&
              /^[a-f0-9]{32}$/.test(history[t]),
          ),
      );
      const functions = normalizeFunctionInventory(await request("functions"));
      return {
        facts,
        contractDigest: databaseContract(facts),
        historyDigest: hash(canonical(sortedObject(history))),
        tableCount: tables.length,
        work,
        detail: {
          details: Object.fromEntries(
            ["webhooks", "scheduled", "subscriptions"].map((key) => [
              key,
              detail.details[key],
            ]),
          ),
          rendering: Object.fromEntries(
            ["postgresVersion", "searchPath", "sessionRole"].map((key) => [
              key,
              detail.rendering[key],
            ]),
          ),
        },
        functions,
      };
    }
    stage = "opening_observation";
    const opening = await snapshot();
    stage = "closing_observation";
    const closing = await snapshot();
    const latest = await inspectStagingBilling({ env, transport });
    requireEvidence(
      canonical(opening) === canonical(closing) &&
        canonical(latest) === canonical(inventory),
      "UPGRADE_OBSERVATION_CHANGED",
    );
    requireEvidence(
      now() - started >= 0 && now() - started < 60_000,
      "UPGRADE_OBSERVATION_TOO_OLD",
    );
    const blockers = [];
    const expectedDigest = checkpoints.checkpoints[String(applied)].digest;
    if (closing.contractDigest !== expectedDigest)
      blockers.push("DATABASE_SCHEMA_DIFFERS_FROM_CHECKPOINT");
    if (
      inventory.billingPolicy?.environment !== "test" ||
      inventory.billingPolicy.salesEnabled !== false ||
      inventory.billingPolicy.reconciliationEnabled !== false ||
      closing.facts.policy?.sales !== false ||
      closing.facts.policy.reconciliation !== false
    )
      blockers.push("SANDBOX_DISABLED_POLICY_REQUIRED");
    if (inventory.configuration.missingServerSettings.length)
      blockers.push("PADDLE_SETTINGS_MISSING");
    if (inventory.configuration.livePaddleSettingCount)
      blockers.push("LIVE_PADDLE_SETTINGS_PRESENT");
    const legacyRoots = Object.fromEntries(
      LS_ROOT_KEYS.map((k) => [k, closing.facts.lsRoots[k]]),
    );
    if (Object.values(legacyRoots).some((n) => n > 0))
      blockers.push("RETAINED_LEGACY_BILLING_REVIEW_REQUIRED");
    const inFlightWork = Object.fromEntries(
      WORK_KEYS.map((k) => [k, closing.work.work[k]]),
    );
    if (Object.values(inFlightWork).some((n) => n > 0))
      blockers.push("RETAINED_IN_FLIGHT_WORK_REVIEW_REQUIRED");
    if (
      closing.work.scheduled.count > 0 ||
      closing.work.scheduled.invalidBoundaries > 0
    )
      blockers.push("SCHEDULED_OPERATION_REVIEW_REQUIRED");
    const allowedFunctions = new Set(
      [...identity.functions, ...identity.outsideFunctions].map((f) => f.name),
    );
    const unclassifiedFunctionCount = closing.functions.filter(
      (f) => !allowedFunctions.has(f.name),
    ).length;
    if (unclassifiedFunctionCount)
      blockers.push("UNCLASSIFIED_FUNCTIONS_PRESENT");
    if (
      inventory.functions.inactive.length ||
      inventory.functions.jwtMismatch.length
    )
      blockers.push("EXISTING_FUNCTION_CONFIGURATION_REVIEW_REQUIRED");
    if (
      Object.values(closing.detail.details).some((groups) =>
        groups.some((group) => group.environment !== "test"),
      )
    )
      blockers.push("RETAINED_NON_SANDBOX_BILLING_REVIEW_REQUIRED");
    Object.assign(assessment, {
      status: blockers.length
        ? "review_required"
        : "ready_for_upgrade_preparation",
      stable: true,
      observedAt: new Date(started).toISOString(),
      schema: {
        matchesCheckpoint: closing.contractDigest === expectedDigest,
        expectedDigest,
        observedDigest: closing.contractDigest,
        rendering: closing.detail.rendering,
        diagnostics: expectedSchema
          ? compareSchemaObjects(expectedSchema, closing.facts)
          : { status: "reference_not_supplied" },
      },
      retainedHistory: {
        publicTableCount: closing.tableCount,
        authUsersIncluded: true,
        digest: closing.historyDigest,
      },
      legacyRoots,
      inFlightWork,
      scheduledOperations: closing.work.scheduled,
      retainedWorkDetails: closing.detail.details,
      unclassifiedFunctionCount,
      blockers,
      nextSteps: [
        "Create and verify a recoverable staging backup",
        "Review retained billing work before provider retirement",
        "Apply only the verified pending migrations under GitHub environment review",
      ],
    });
  } catch (error) {
    Object.assign(assessment, {
      status: "inspection_failed",
      stage,
      code:
        error instanceof ReadinessError
          ? error.message
          : "UPGRADE_ASSESSMENT_FAILED",
      ...(error instanceof ReadinessError && error.httpStatus !== undefined
        ? { httpStatus: error.httpStatus }
        : {}),
    });
  }
  return report;
}

export function readinessAnnotation(report) {
  if (report.status !== "inspected")
    return `::error title=Staging billing inventory::stage=${report.stage}; code=${report.code}${report.httpStatus === undefined ? "" : `; httpStatus=${report.httpStatus}`}`;
  const assessment = report.upgradeReadiness;
  if (assessment.status === "inspection_failed")
    return `::error title=Staging upgrade assessment::stage=${assessment.stage}; code=${assessment.code}${assessment.httpStatus === undefined ? "" : `; httpStatus=${assessment.httpStatus}`}`;
  return `::notice title=Staging upgrade assessment::migrations=${report.migrations.appliedCount}/188; missingSettings=${report.configuration.missingServerSettings.length}; assessment=${assessment.status}; schemaMatches=${assessment.schema?.matchesCheckpoint ?? "unknown"}; blockers=${assessment.blockers?.join(",") || assessment.reason || "none"}; deploymentAuthorized=false`;
}

export function diagnosticAnnotations(report) {
  const assessment = report.upgradeReadiness;
  if (!assessment?.stable || assessment.status === "inspection_failed")
    return [];
  const escape = (text) =>
    text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
  const notice = (title, value) =>
    `::notice title=${title}::${escape(JSON.stringify(value))}`;
  const annotations = [];
  const diagnostics = assessment.schema?.diagnostics;
  if (diagnostics?.status === "compared") {
    annotations.push(
      notice("Staging schema comparison", {
        exactMatch: diagnostics.exactMatch,
        changedObjectCount: diagnostics.changedObjectCount,
        truncated: diagnostics.truncated,
        sections: diagnostics.sections,
        rendering: assessment.schema.rendering,
      }),
    );
    for (let i = 0; i < diagnostics.changes.length; i += 20)
      annotations.push(
        notice(
          "Staging schema differences",
          diagnostics.changes.slice(i, i + 20).map((change) => ({
            ...change,
            ...(change.object ? { object: change.object.slice(0, 300) } : {}),
          })),
        ),
      );
  }
  for (const key of ["webhooks", "scheduled", "subscriptions"])
    if (assessment.retainedWorkDetails?.[key])
      annotations.push(
        notice(`Staging retained ${key}`, assessment.retainedWorkDetails[key]),
      );
  return annotations;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = await inspectUpgradeReadiness();
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  console.error(readinessAnnotation(report));
  for (const annotation of diagnosticAnnotations(report))
    console.error(annotation);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Staging billing inventory\n\nRead-only upgrade assessment; no deployment or payment is authorized by this report.\n\n\`\`\`json\n${json}\n\`\`\`\n`,
    );
  if (
    report.status !== "inspected" ||
    report.upgradeReadiness.status === "inspection_failed"
  )
    process.exitCode = 1;
}
