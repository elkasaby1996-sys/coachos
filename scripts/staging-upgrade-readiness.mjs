// Read-only assessment of an installed staging database. No migration, link,
// deployment, provider call, backup claim, or change to retained billing history.
import { appendFileSync, readFileSync } from "node:fs";
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
function localRelease() {
  return {
    identity: releaseIdentity(),
    checkpoints: JSON.parse(
      readFileSync(
        new URL("../config/staging-release-checkpoints.json", import.meta.url),
        "utf8",
      ),
    ),
  };
}

export async function inspectUpgradeReadiness({
  env = process.env,
  transport = fetch,
  readLocal = localRelease,
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
    const { identity, checkpoints } = readLocal();
    requireEvidence(
      checkpoints.frozenPayloadCommit === identity.payload.frozenCommit &&
        checkpoints.manifestDigest === hash(canonical(identity.manifest)) &&
        /^[a-f0-9]{64}$/.test(
          checkpoints.checkpoints[String(applied)]?.digest ?? "",
        ),
      "UPGRADE_LOCAL_CONTRACT_INVALID",
    );
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
      },
      retainedHistory: {
        publicTableCount: closing.tableCount,
        authUsersIncluded: true,
        digest: closing.historyDigest,
      },
      legacyRoots,
      inFlightWork,
      scheduledOperations: closing.work.scheduled,
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

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = await inspectUpgradeReadiness();
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  console.error(readinessAnnotation(report));
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
