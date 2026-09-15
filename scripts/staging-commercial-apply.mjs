// Phase B only. This entry point is never imported or invoked by the planner.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  requireCheck,
  validateRemoteHistory,
} from "./staging-commercial-contracts.mjs";
import { validateDeploymentEvidence } from "./staging-commercial-evidence.mjs";
import {
  REMOTE_STAGES,
  REMOTE_STAGE_ERRORS,
  initialRemoteProgress,
} from "./staging-commercial-remote-stages.mjs";
import {
  runPreflight,
  preflightFailureLine,
} from "./staging-commercial-preflight.mjs";
export {
  authorizationSchema,
  validateApplyAuthorization,
  requireGreenUnits,
} from "./staging-commercial-preflight.mjs";

// Exact v2.109.1 object shape captured with piped stdout. Display metadata is
// validated but never returned or included in errors/evidence.
const jsonMigrationListSchema = z.strictObject({
  migrations: z.array(
    z.strictObject({
      local: z.string().regex(/^\d{14}$/),
      remote: z.string().regex(/^(\d{14})?$/),
      time: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
    }),
  ),
  message: z.string(),
});
function parseJsonMigrationList(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("MIGRATION_LEDGER_UNREADABLE");
  }
  const result = jsonMigrationListSchema.safeParse(value);
  requireCheck(result.success, "MIGRATION_LEDGER_UNREADABLE");
  const remote = [];
  const seen = new Set();
  let previousLocal = null;
  for (const row of result.data.migrations) {
    requireCheck(
      previousLocal === null || row.local > previousLocal,
      "REMOTE_MIGRATION_DRIFT",
    );
    requireCheck(
      !row.remote || row.local === row.remote,
      "REMOTE_MIGRATION_DRIFT",
    );
    if (row.remote) {
      requireCheck(!seen.has(row.remote), "REMOTE_MIGRATION_DRIFT");
      seen.add(row.remote);
      remote.push(row.remote);
    }
    previousLocal = row.local;
  }
  return remote;
}
export function parseMigrationList(text) {
  requireCheck(typeof text === "string", "MIGRATION_LEDGER_UNREADABLE");
  const trimmed = text.trim();
  // Arrays are identified as JSON too, then rejected by the strict object
  // schema. Malformed JSON must never fall through to legacy table parsing.
  if (trimmed.startsWith("{") || trimmed.startsWith("["))
    return parseJsonMigrationList(trimmed);
  const rows = text
    .split(/\r?\n/)
    .filter((line) => line.includes("|") && !/^[\s|+-]+$/.test(line));
  requireCheck(
    rows.length >= 2 && /Local\s*\|\s*Remote/.test(rows[0]),
    "MIGRATION_LEDGER_UNREADABLE",
  );
  const remote = [];
  for (const row of rows.slice(1)) {
    const parts = row.split("|").map((v) => v.trim());
    requireCheck(
      parts.length === 3 &&
        /^(\d{14})?$/.test(parts[0]) &&
        /^(\d{14})?$/.test(parts[1]),
      "MIGRATION_LEDGER_UNREADABLE",
    );
    requireCheck(!parts[1] || parts[0] === parts[1], "REMOTE_MIGRATION_DRIFT");
    if (parts[1]) remote.push(parts[1]);
  }
  return remote;
}
// Keep original child-process results private: Error inspection/serialization
// must not expose command arguments, stdout, stderr, or nested causes.
const remoteFailures = new WeakMap();
function remoteFailure(stage, cause) {
  if (remoteFailures.has(cause)) return cause;
  const safeStage = REMOTE_STAGES.includes(stage) ? stage : null;
  const error = new Error("REMOTE_EXECUTION_FAILED_USE_ROLLBACK_RUNBOOK");
  error.stage = safeStage;
  error.exitCode = Number.isInteger(cause?.status) ? cause.status : null;
  error.signal = typeof cause?.signal === "string" ? cause.signal : null;
  remoteFailures.set(error, {
    cause,
    stage: safeStage,
    code: REMOTE_STAGE_ERRORS[safeStage] ?? "UNKNOWN_REMOTE_FAILURE",
  });
  return error;
}
export function applyFailureLine(error) {
  const failure = remoteFailures.get(error);
  if (!failure) return preflightFailureLine("apply", error);
  return failure.stage === null
    ? `STAGING_APPLY_LOCAL_FAILED:${failure.code}`
    : `STAGING_APPLY_REMOTE_FAILED:${failure.stage}:${failure.code}`;
}
export function runRemote(stage, args) {
  try {
    return execFileSync(
      process.execPath,
      ["scripts/supabase-remote-guard.mjs", ...args],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 8 * 1024 * 1024,
      },
    );
  } catch (cause) {
    // execFileSync throws for spawn failure, nonzero exit and termination by
    // signal; a zero exit returns stdout solely for the existing ledger parser.
    throw remoteFailure(stage, cause);
  }
}
export async function apply() {
  const { manifest, inputs, state, auth } = runPreflight("apply");
  const output = "output/staging-commercial/apply";
  const records = [];
  const deployedFunctions = [];
  const progress = initialRemoteProgress();
  const evidence = () =>
    validateDeploymentEvidence({
      schemaVersion: 1,
      environment: "staging",
      providerEnvironment: "test",
      commitSha: state.commit,
      fullUnitSuiteGreen: true,
      records,
      ...progress,
    });
  const persist = () =>
    writeFileSync(
      `${output}/deployment-evidence.json`,
      JSON.stringify(evidence(), null, 2) + "\n",
    );
  const atStage = (stage, operation) => {
    progress.remoteStarted = true;
    progress.remoteStage = stage;
    persist();
    const result = operation();
    progress.lastCompletedRemoteStage = stage;
    persist();
    return result;
  };
  const remote = (stage, args) => atStage(stage, () => runRemote(stage, args));
  try {
    mkdirSync(output, { recursive: true });
    persist();
    remote("link", ["link", "--project-ref", inputs.project]);
    const before = remote("migration_list_before", [
      "migration",
      "list",
      "--linked",
    ]);
    atStage("history_validation_before", () =>
      validateRemoteHistory(
        manifest.migrations.approved,
        parseMigrationList(before),
        auth.approvedRemoteVersions,
      ),
    );
    remote("db_push_dry_run", ["db", "push", "--linked", "--dry-run"]);
    remote("db_push_apply", ["db", "push", "--linked", "--yes"]);
    for (const name of [
      ...manifest.functions.billing,
      ...manifest.functions.nonbilling,
    ]) {
      atStage("function_deploy", () => {
        runRemote("function_deploy", [
          "functions",
          "deploy",
          name,
          "--project-ref",
          inputs.project,
        ]);
        deployedFunctions.push(name);
      });
    }
    const versions = manifest.migrations.approved.map((m) =>
      m.filename.slice(0, 14),
    );
    const after = remote("migration_list_after", [
      "migration",
      "list",
      "--linked",
    ]);
    atStage("history_validation_after", () =>
      validateRemoteHistory(
        manifest.migrations.approved,
        parseMigrationList(after),
        versions,
      ),
    );
    for (const [scenarioId, code] of [
      ["CERT-DEPLOY-001", "MIGRATION_HISTORY_MATCH"],
      ["CERT-DEPLOY-002", "FUNCTION_DEPLOYED"],
    ])
      records.push({
        scenarioId,
        // CLI success does not prove the deployed auth boundary. The operator
        // must finish the scenario probes before certifying the allowlist.
        status: scenarioId === "CERT-DEPLOY-002" ? "not_run" : "pass",
        scope: "staging_test",
        timestamp: new Date().toISOString(),
        commitSha: state.commit,
        workflowRunId: process.env.GITHUB_RUN_ID,
        identifierHashes: [],
        ...(scenarioId === "CERT-DEPLOY-002" ? { deployedFunctions } : {}),
        assertions: [{ code, passed: true }],
      });
    progress.remoteStage = "deployment_complete";
    progress.lastCompletedRemoteStage = "deployment_complete";
    persist();
  } catch (cause) {
    const error = remoteFailure(progress.remoteStage, cause);
    const failure = remoteFailures.get(error);
    progress.failedRemoteStage = failure.stage;
    progress.remoteErrorCode = failure.code;
    records.length = 0;
    records.push({
      scenarioId: "CERT-DEPLOY-001",
      status: "fail",
      scope: "staging_test",
      timestamp: new Date().toISOString(),
      commitSha: state.commit,
      errorCode: "REMOTE_EXECUTION_FAILED",
      identifierHashes: [],
      deployedFunctions,
      assertions: [],
    });
    try {
      // A local artifact-write failure must not replace the safe remote error
      // with raw filesystem details or send it through the preflight formatter.
      persist();
    } catch {
      /* Fail closed even when the evidence destination is unavailable. */
    }
    throw error;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await apply();
    console.log("DEPLOYMENT_COMMANDS_COMPLETE_CERTIFICATION_STILL_BLOCKED");
  } catch (error) {
    console.error(applyFailureLine(error));
    process.exitCode = 1;
  }
}
