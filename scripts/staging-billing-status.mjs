// Read-only inventory for the user-confirmed staging project. This report grants
// no deployment authority and never retrieves or outputs credential values.
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BILLING_FUNCTIONS,
  CONFIGURATION_CLASSES,
  JWT_CONTRACTS,
} from "./billing-deployment-contract.mjs";

// The user corrected the active feature-branch staging target on 2026-11-09.
// The legacy replacement registry is a separate signed-release contract.
export const STAGING_PROJECT = "dgogugyuyfourdttvwuy";
export const STAGING_ORIGIN = "https://repsync-staging.netlify.app";
export const STATUS_QUERIES = Object.freeze({
  schema:
    "select to_regclass('supabase_migrations.schema_migrations') is not null as has_migration_history, to_regclass('public.billing_runtime_policy') is not null as has_billing_policy;",
  migrations:
    "select version from supabase_migrations.schema_migrations order by version;",
  policy:
    "select to_jsonb(p)->>'entitlement_environment' as environment, to_jsonb(p)->'paddle_sales_enabled' as sales_enabled, to_jsonb(p)->'paddle_reconciliation_enabled' as reconciliation_enabled from public.billing_runtime_policy p where id=1;",
});
const requiredSecrets = CONFIGURATION_CLASSES.PADDLE_REQUIRED.filter((name) =>
  name.startsWith("PADDLE_"),
);
class StatusError extends Error {
  constructor(code, httpStatus) {
    super(code);
    this.httpStatus = httpStatus;
  }
}
const requireShape = (condition) => {
  if (!condition) throw new StatusError("STAGING_RESPONSE_INVALID");
};
export async function readBoundedStagingJson(response, maxBytes = 1024 * 1024) {
  requireShape(
    Number.isSafeInteger(maxBytes) &&
      maxBytes > 0 &&
      maxBytes <= 8 * 1024 * 1024,
  );
  requireShape(
    /^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") ?? "",
    ),
  );
  const reader = response.body?.getReader();
  requireShape(reader);
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      requireShape(length <= maxBytes);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function inspectStagingBilling({
  env = process.env,
  transport = fetch,
} = {}) {
  let stage = "configuration";
  try {
    if (env.STAGING_SUPABASE_PROJECT_REF !== STAGING_PROJECT)
      throw new StatusError("STAGING_PROJECT_MISMATCH");
    if (!env.SUPABASE_ACCESS_TOKEN?.trim())
      throw new StatusError("SUPABASE_ACCESS_TOKEN_MISSING");
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          "../config/staging-commercial-certification.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const approved = manifest.migrations.approved.map((m) =>
      m.filename.slice(0, 14),
    );
    async function request(resource, query) {
      stage =
        query === undefined
          ? resource
          : Object.keys(STATUS_QUERIES).find(
              (key) => STATUS_QUERIES[key] === query,
            );
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await transport(
          `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/${resource}`,
          {
            method: query === undefined ? "GET" : "POST",
            redirect: "error",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            ...(query === undefined ? {} : { body: JSON.stringify({ query }) }),
          },
        );
        if (!response.ok)
          throw new StatusError(
            "STAGING_READ_ONLY_REQUEST_FAILED",
            response.status,
          );
        return await readBoundedStagingJson(response);
      } catch (error) {
        if (error instanceof StatusError) throw error;
        throw new StatusError("STAGING_READ_ONLY_REQUEST_FAILED");
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    }
    const sql = (query) => request("database/query/read-only", query);
    // Sequential calls avoid leaving requests running if an earlier boundary fails.
    const schema = await sql(STATUS_QUERIES.schema);
    requireShape(
      Array.isArray(schema) &&
        schema.length === 1 &&
        typeof schema[0].has_migration_history === "boolean" &&
        typeof schema[0].has_billing_policy === "boolean",
    );
    const history = schema[0].has_migration_history
      ? await sql(STATUS_QUERIES.migrations)
      : [];
    requireShape(
      Array.isArray(history) &&
        history.every((r) => /^\d{14}$/.test(r.version)),
    );
    const versions = history.map((r) => r.version);
    const matches =
      versions.length <= approved.length &&
      versions.every((v, i) => v === approved[i]);
    let policy = null;
    if (schema[0].has_billing_policy) {
      const rows = await sql(STATUS_QUERIES.policy);
      requireShape(Array.isArray(rows) && rows.length === 1);
      const row = rows[0];
      requireShape(
        [null, "test", "live"].includes(row.environment) &&
          [null, true, false].includes(row.sales_enabled) &&
          [null, true, false].includes(row.reconciliation_enabled),
      );
      policy = {
        environment: row.environment,
        salesEnabled: row.sales_enabled,
        reconciliationEnabled: row.reconciliation_enabled,
      };
    }
    const functions = await request("functions");
    requireShape(
      Array.isArray(functions) &&
        functions.every((f) => typeof f.name === "string") &&
        new Set(functions.map((f) => f.name)).size === functions.length,
    );
    const secrets = await request("secrets");
    requireShape(
      Array.isArray(secrets) &&
        secrets.every((s) => typeof s.name === "string"),
    );
    const secretNames = new Set(secrets.map((s) => s.name));
    return {
      status: "inspected",
      project: STAGING_PROJECT,
      migrations: {
        appliedCount: versions.length,
        expectedCount: approved.length,
        matchesApprovedVersionPrefix: matches,
        pending: matches
          ? manifest.migrations.approved
              .slice(versions.length)
              .map((m) => m.filename)
          : null,
        hashesAndSchemaVerified: false,
      },
      billingPolicy: policy,
      functions: {
        totalDeployedCount: functions.length,
        expectedBillingCount: BILLING_FUNCTIONS.length,
        missing: BILLING_FUNCTIONS.filter(
          (name) => !functions.some((f) => f.name === name),
        ),
        inactive: BILLING_FUNCTIONS.filter((name) =>
          functions.some((f) => f.name === name && f.status !== "ACTIVE"),
        ),
        jwtMismatch: BILLING_FUNCTIONS.filter((name) =>
          functions.some(
            (f) => f.name === name && f.verify_jwt !== JWT_CONTRACTS[name],
          ),
        ),
        deployedSourceVerified: false,
      },
      configuration: {
        missingServerSettings: requiredSecrets.filter(
          (name) => !secretNames.has(name),
        ),
        livePaddleSettingCount: secrets.filter((s) =>
          s.name.startsWith("PADDLE_LIVE_"),
        ).length,
        valuesVerified: false,
        frontendConfigurationVerified: false,
      },
      providerPaymentsVerified: false,
      deploymentAuthorized: false,
      remoteChangesPerformed: false,
    };
  } catch (error) {
    return {
      status: "blocked",
      stage,
      code:
        error instanceof StatusError ? error.message : "STAGING_STATUS_FAILED",
      ...(error instanceof StatusError && error.httpStatus !== undefined
        ? { httpStatus: error.httpStatus }
        : {}),
      remoteChangesPerformed: false,
    };
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = await inspectStagingBilling();
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (report.status !== "inspected") {
    process.exitCode = 1;
    // stdout is the JSON artifact. GitHub still reads workflow commands on
    // stderr, making these fixed diagnostic fields visible in job annotations.
    const diagnostic = [
      `stage=${report.stage}`,
      `code=${report.code}`,
      ...(report.httpStatus === undefined
        ? []
        : [`httpStatus=${report.httpStatus}`]),
    ].join("; ");
    console.error(`::error title=Staging billing inventory::${diagnostic}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Staging billing inventory\n\nRead-only observations; deployment and real payments are not certified.\n\n\`\`\`json\n${json}\n\`\`\`\n`,
    );
}
