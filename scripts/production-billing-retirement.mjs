import { z } from "zod";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { billingOutput } from "./billing-operator-output.mjs";
import { gitState } from "./staging-commercial-plan.mjs";
import { validateBillingRetirement } from "./validate-billing-retirement.mjs";
import {
  FUNCTION_CONTRACTS,
  JWT_CONTRACTS,
} from "./billing-deployment-contract.mjs";
import {
  hash,
  retirementEvidenceSchema,
  functionArtifactDigest,
  validateRetirementEvidence,
  validateDryRun,
  assertFunctionInventory,
  assertRetiredDatabaseAuthority,
  assertOverwriteVersions,
} from "./billing-retirement-release.mjs";
import {
  readDeploymentInventory,
  compareReviewedInventory,
} from "./billing-retirement-remote-inventory.mjs";
import { parseMigrationList } from "./staging-commercial-apply.mjs";
import { validateRemoteHistory } from "./staging-commercial-contracts.mjs";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const authorizationSchema = z.strictObject({
  reviewedCommit: z.string().regex(/^[a-f0-9]{40}$/),
  manifestSha256: digest,
  projectSha256: digest,
  originSha256: digest,
  backupEvidenceSha256: digest,
  approvedRemoteVersions: z.array(z.string().regex(/^\d{14}$/)),
  retirement: retirementEvidenceSchema,
  rollbackReviewed: z.literal(true),
  productionReleaseAuthorized: z.literal(false),
});
const fail = (code) => {
  throw new Error(code);
};
export function validateProductionAuthorization(
  raw,
  manifest,
  inputs,
  state,
  root = process.cwd(),
) {
  const result = authorizationSchema.safeParse(raw);
  if (!result.success) fail("PRODUCTION_RETIREMENT_AUTHORIZATION_INVALID");
  const auth = result.data;
  if (
    !state.clean ||
    !state.containsBase ||
    !state.descendsMain ||
    !["main", "HEAD"].includes(state.branch) ||
    inputs.commit !== state.commit ||
    !/^[a-z]{20}$/.test(inputs.project ?? "") ||
    inputs.project !== inputs.expectedProject ||
    !/^[a-z]{20}$/.test(inputs.stagingProject ?? "") ||
    inputs.project === inputs.stagingProject
  )
    fail("PRODUCTION_RETIREMENT_SOURCE_OR_PROJECT_MISMATCH");
  let origin;
  try {
    origin = new URL(inputs.origin);
  } catch {
    fail("PRODUCTION_RETIREMENT_ORIGIN_INVALID");
  }
  if (
    origin.origin !== inputs.origin ||
    inputs.origin !== inputs.expectedOrigin ||
    inputs.origin === inputs.stagingOrigin ||
    origin.protocol !== "https:" ||
    origin.port ||
    origin.username ||
    origin.password ||
    /localhost|staging|\.local$|\.internal$|\.test$|\.invalid$/.test(
      origin.hostname,
    ) ||
    !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(origin.hostname)
  )
    fail("PRODUCTION_RETIREMENT_ORIGIN_INVALID");
  if (
    auth.reviewedCommit !== state.commit ||
    auth.manifestSha256 !== hash(JSON.stringify(manifest)) ||
    auth.projectSha256 !== hash(inputs.project) ||
    auth.originSha256 !== hash(inputs.origin)
  )
    fail("PRODUCTION_RETIREMENT_AUTHORIZATION_BINDING_MISMATCH");
  validateRetirementEvidence(auth.retirement, {
    environment: "production",
    commit: state.commit,
    project: inputs.project,
    manifest,
    approvedRemoteVersions: auth.approvedRemoteVersions,
    functionArtifactSha256: functionArtifactDigest(root),
  });
  return auth;
}
export async function runProductionRetirement(
  mode = "plan",
  env = process.env,
  dependencies = {},
) {
  const root = process.cwd();
  (dependencies.validateBillingRetirement ?? validateBillingRetirement)(root);
  const manifest = JSON.parse(
    readFileSync("config/staging-commercial-certification.json", "utf8"),
  );
  const report = {
    schemaVersion: 1,
    environment: "production",
    mode,
    remoteMutationPerformed: false,
    retirementDeployment: "authorization_required",
    productionCommercialRelease: "BLOCKED_SANDBOX_ONLY_RUNTIME",
    lastCompletedStage: "local_contract_validation",
    deployedFunctionCount: 0,
    certification: "not_run",
  };
  const persist =
    dependencies.persist ??
    ((value) => {
      mkdirSync("output/production-billing-retirement", { recursive: true });
      writeFileSync(
        "output/production-billing-retirement/result.json",
        billingOutput.serialize(value) + "\n",
      );
    });
  try {
    if (mode === "plan") return report;
    if (
      !["preflight", "apply"].includes(mode) ||
      env.GITHUB_ACTIONS !== "true" ||
      env.GITHUB_REF !== "refs/heads/main" ||
      !env.SUPABASE_ACCESS_TOKEN ||
      !env.SUPABASE_DB_PASSWORD
    )
      fail("PROTECTED_PRODUCTION_RETIREMENT_WORKFLOW_REQUIRED");
    const inputs = {
      commit: env.CONFIRM_COMMIT_SHA,
      project: env.CONFIRM_PROJECT_REF,
      expectedProject: env.PRODUCTION_SUPABASE_PROJECT_REF,
      origin: env.CONFIRM_APP_ORIGIN,
      expectedOrigin: env.PRODUCTION_APPLICATION_ORIGIN,
      stagingProject: env.STAGING_SUPABASE_PROJECT_REF,
      stagingOrigin: env.STAGING_APPLICATION_ORIGIN,
    };
    const state = (dependencies.gitState ?? gitState)(
      root,
      manifest.requiredBaseCommit,
    );
    let raw;
    try {
      raw = JSON.parse(env.PRODUCTION_RETIREMENT_AUTHORIZATION ?? "null");
    } catch {
      fail("PRODUCTION_RETIREMENT_AUTHORIZATION_INVALID");
    }
    const auth = validateProductionAuthorization(
      raw,
      manifest,
      inputs,
      state,
      root,
    );
    report.commitSha = state.commit;
    const context = { inputs, auth, mode, environment: "production", env };
    const read =
      dependencies.readDeploymentInventory ?? readDeploymentInventory;
    const observation = await read(context);
    compareReviewedInventory(observation, auth);
    report.lastCompletedStage = "read_only_inventory_verified";
    if (mode === "preflight") {
      report.retirementDeployment = "preflight_pass_no_mutation";
      return report;
    }
    if (
      env.ALLOW_REMOTE_SUPABASE !== "I_UNDERSTAND_THIS_TOUCHES_REMOTE" ||
      env.SUPABASE_PROJECT_REF !== inputs.project
    )
      fail("PRODUCTION_RETIREMENT_MUTATION_AUTHORIZATION_REQUIRED");
    const remote =
      dependencies.remote ??
      ((args) => {
        try {
          return execFileSync(
            process.execPath,
            ["scripts/supabase-remote-guard.mjs", ...args],
            {
              encoding: "utf8",
              stdio: ["ignore", "pipe", "pipe"],
              env,
              maxBuffer: 8 * 1024 * 1024,
            },
          );
        } catch {
          fail("PRODUCTION_RETIREMENT_REMOTE_COMMAND_FAILED");
        }
      });
    remote(["link", "--project-ref", inputs.project]);
    const before = parseMigrationList(
      remote(["migration", "list", "--linked", "--output-format", "json"]),
    );
    validateRemoteHistory(
      manifest.migrations.approved,
      before,
      auth.approvedRemoteVersions,
    );
    validateDryRun(
      remote(["db", "push", "--linked", "--dry-run"]),
      auth.retirement.expectedPendingMigrations,
    );
    report.remoteMutationPerformed = true;
    report.lastCompletedStage = "authorized_db_apply_started";
    persist(report);
    remote(["db", "push", "--linked", "--yes"]);
    report.lastCompletedStage = "migration_applied";
    persist(report);
    for (const f of FUNCTION_CONTRACTS) {
      remote([
        "functions",
        "deploy",
        f.name,
        "--project-ref",
        inputs.project,
        ...(JWT_CONTRACTS[f.name] ? [] : ["--no-verify-jwt"]),
      ]);
      report.deployedFunctionCount++;
      persist(report);
    }
    const versions = manifest.migrations.approved.map((m) =>
      m.filename.slice(0, 14),
    );
    validateRemoteHistory(
      manifest.migrations.approved,
      parseMigrationList(
        remote(["migration", "list", "--linked", "--output-format", "json"]),
      ),
      versions,
    );
    const after = await read(context);
    validateRemoteHistory(
      manifest.migrations.approved,
      after.inventory.facts.versions,
      versions,
    );
    assertFunctionInventory(after.inventory.functions, true);
    assertOverwriteVersions(
      observation.inventory.functions,
      after.inventory.functions,
    );
    assertRetiredDatabaseAuthority(
      after.inventory.facts.functions,
      JSON.parse(
        readFileSync(
          "supabase/tests/fixtures/lemon_squeezy_retired_functions.json",
          "utf8",
        ),
      ),
    );
    report.lastCompletedStage = "metadata_and_database_authority_verified";
    report.retirementDeployment =
      "commands_complete_response_and_side_effect_probes_pending";
    return report;
  } catch (error) {
    report.retirementDeployment = "blocked";
    report.errorCode = /^[A-Z_]+$/.test(error.message ?? "")
      ? error.message
      : "PRODUCTION_RETIREMENT_FAILED_DETAILS_SUPPRESSED";
    throw new Error(report.errorCode);
  } finally {
    persist(report);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    billingOutput.log(await runProductionRetirement(process.argv[2] ?? "plan"));
  } catch {
    billingOutput.error("PRODUCTION_RETIREMENT_BLOCKED_DETAILS_SUPPRESSED");
    process.exitCode = 1;
  }
}
