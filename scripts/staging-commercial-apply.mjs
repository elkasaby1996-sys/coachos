// Phase B only. This entry point is never imported or invoked by the planner.
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  digest,
  sha,
  sha256,
  parseSafe,
  requireCheck,
  validateConfirmations,
  validateRemoteHistory,
  readJson,
} from "./staging-commercial-contracts.mjs";
import {
  validateBundle,
  confirmationInputs,
  gitState,
} from "./staging-commercial-plan.mjs";
import { validateProviderMappings } from "./staging-commercial-provider.mjs";
import { validateEvidence } from "./staging-commercial-evidence.mjs";

export const authorizationSchema = z.strictObject({
  reviewedCommit: sha,
  manifestSha256: digest,
  projectSha256: digest,
  originSha256: digest,
  approvedRemoteVersions: z.array(z.string().regex(/^\d{14}$/)),
  backupEvidenceSha256: digest,
  auth: z.strictObject({
    siteUrl: z.string(),
    redirectUrls: z.array(z.string()),
    signupEnabled: z.literal(true),
    confirmationsEnabled: z.literal(true),
  }),
  providerMappings: z.unknown(),
  remoteSecretNamesPresent: z.array(z.string()),
  providerEnvironment: z.literal("test"),
  billingAppOrigin: z.string(),
  portalAllowedHosts: z.array(z.string()).min(1),
  portalControlsReviewed: z.literal(true),
  webhookTestStoreReviewed: z.literal(true),
  rollbackReviewed: z.literal(true),
});
export function validateApplyAuthorization(raw, manifest, inputs, commit) {
  const auth = parseSafe(
    authorizationSchema,
    raw,
    "PHASE_B_AUTHORIZATION_INVALID",
  );
  requireCheck(
    auth.reviewedCommit === commit &&
      auth.manifestSha256 === sha256(JSON.stringify(manifest)) &&
      auth.projectSha256 === sha256(inputs.project) &&
      auth.originSha256 === sha256(inputs.origin),
    "AUTHORIZATION_BINDING_MISMATCH",
  );
  requireCheck(
    auth.auth.siteUrl === inputs.origin &&
      auth.auth.redirectUrls.length > 0 &&
      auth.auth.redirectUrls.every(
        (u) => u === `${inputs.origin}/auth/callback`,
      ) &&
      auth.billingAppOrigin === inputs.origin,
    "AUTH_CONFIGURATION_MISMATCH",
  );
  requireCheck(
    new Set(auth.remoteSecretNamesPresent).size ===
      manifest.requiredSecretNames.length &&
      manifest.requiredSecretNames.every((n) =>
        auth.remoteSecretNamesPresent.includes(n),
      ),
    "REMOTE_SECRET_ATTESTATION_MISSING",
  );
  requireCheck(
    auth.portalAllowedHosts.every(
      (host) =>
        /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(host) &&
        !/localhost|\.local$|\.internal$/.test(host),
    ),
    "PORTAL_HOST_INVALID",
  );
  validateProviderMappings(auth.providerMappings);
  requireCheck(
    auth.providerMappings.mappings.every((m) =>
      [m.storeRef, m.productRef, m.variantRef, m.priceRef].every((r) =>
        r.startsWith("sha256:"),
      ),
    ),
    "FAKE_PROVIDER_PROOF_BLOCKED",
  );
  validateRemoteHistory(
    manifest.migrations.approved,
    auth.approvedRemoteVersions,
    auth.approvedRemoteVersions,
  );
  return auth;
}
export function requireGreenUnits(result) {
  requireCheck(
    result.success === true &&
      result.numFailedTests === 0 &&
      result.numFailedTestSuites === 0 &&
      result.numPendingTests === 0 &&
      result.numTodoTests === 0 &&
      result.numTotalTests >= 1784 &&
      result.numPassedTests === result.numTotalTests &&
      result.testResults.flatMap((f) => f.assertionResults).length ===
        result.numTotalTests &&
      result.testResults.every(
        (f) =>
          f.status === "passed" &&
          f.assertionResults.every((t) => t.status === "passed"),
      ),
    "FULL_UNIT_SUITE_NOT_GREEN",
  );
}
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
  const manifest = validateBundle(process.cwd()),
    inputs = confirmationInputs();
  const state = gitState(process.cwd(), manifest.requiredBaseCommit);
  validateConfirmations(inputs, state);
  requireCheck(
    process.env.GITHUB_ACTIONS === "true" &&
      process.env.GITHUB_REF === "refs/heads/main" &&
      process.env.ALLOW_REMOTE_SUPABASE ===
        "I_UNDERSTAND_THIS_TOUCHES_REMOTE" &&
      process.env.SUPABASE_PROJECT_REF === inputs.project,
    "AUTHORIZED_STAGING_WORKFLOW_REQUIRED",
  );
  const auth = validateApplyAuthorization(
    JSON.parse(process.env.STAGING_COMMERCIAL_AUTHORIZATION ?? "null"),
    manifest,
    inputs,
    state.commit,
  );
  for (const name of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"])
    requireCheck(Boolean(process.env[name]?.trim()), "DEPLOY_SECRET_MISSING");
  const output = "output/staging-commercial/apply";
  mkdirSync(output, { recursive: true });
  // Full units are deliberately blocking. Never use an inherited-failure exemption.
  requireCheck(Boolean(process.env.npm_execpath), "NPM_CONTEXT_REQUIRED");
  execFileSync(
    process.execPath,
    [
      process.env.npm_execpath,
      "run",
      "test:unit",
      "--",
      "--reporter=json",
      `--outputFile=${output}/units.json`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  requireGreenUnits(readJson(`${output}/units.json`));
  validateConfirmations(
    inputs,
    gitState(process.cwd(), manifest.requiredBaseCommit),
  );
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
  } catch {
    console.error("STAGING_APPLY_BLOCKED_OR_FAILED");
    process.exitCode = 1;
  }
}
