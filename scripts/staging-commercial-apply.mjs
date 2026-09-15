// Phase B only. This entry point is never imported or invoked by the planner.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  requireCheck,
  validateRemoteHistory,
} from "./staging-commercial-contracts.mjs";
import { validateEvidence } from "./staging-commercial-evidence.mjs";
import {
  runPreflight,
  preflightFailureLine,
} from "./staging-commercial-preflight.mjs";
export {
  authorizationSchema,
  validateApplyAuthorization,
  requireGreenUnits,
} from "./staging-commercial-preflight.mjs";

export function parseMigrationList(text) {
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
export async function apply() {
  const { manifest, inputs, state, auth } = runPreflight("apply");
  const output = "output/staging-commercial/apply";
  mkdirSync(output, { recursive: true });
  const records = [];
  const deployedFunctions = [];
  const evidence = () =>
    validateEvidence({
      schemaVersion: 1,
      environment: "staging",
      providerEnvironment: "test",
      commitSha: state.commit,
      fullUnitSuiteGreen: true,
      records,
    });
  const remote = (args) =>
    execFileSync(
      process.execPath,
      ["scripts/supabase-remote-guard.mjs", ...args],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 8 * 1024 * 1024,
      },
    );
  try {
    remote(["link", "--project-ref", inputs.project]);
    validateRemoteHistory(
      manifest.migrations.approved,
      parseMigrationList(remote(["migration", "list", "--linked"])),
      auth.approvedRemoteVersions,
    );
    remote(["db", "push", "--linked", "--dry-run"]);
    remote(["db", "push", "--linked", "--yes"]);
    for (const name of [
      ...manifest.functions.billing,
      ...manifest.functions.nonbilling,
    ]) {
      remote(["functions", "deploy", name, "--project-ref", inputs.project]);
      deployedFunctions.push(name);
    }
    const versions = manifest.migrations.approved.map((m) =>
      m.filename.slice(0, 14),
    );
    validateRemoteHistory(
      manifest.migrations.approved,
      parseMigrationList(remote(["migration", "list", "--linked"])),
      versions,
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
  } catch {
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
    throw new Error("REMOTE_EXECUTION_FAILED_USE_ROLLBACK_RUNBOOK");
  } finally {
    writeFileSync(
      `${output}/deployment-evidence.json`,
      JSON.stringify(evidence(), null, 2) + "\n",
    );
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
    console.error(preflightFailureLine("apply", error));
    process.exitCode = 1;
  }
}
