import { billingOutput } from "./billing-operator-output.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  manifestSchema,
  validateRepository,
  validateConfirmations,
  parseSafe,
  requireCheck,
  readJson,
  scenariosSchema,
  rollbackSchema,
} from "./staging-commercial-contracts.mjs";
import { validateProviderMappings } from "./staging-commercial-provider.mjs";
import { validateEvidence } from "./staging-commercial-evidence.mjs";

export const DEFAULT_MANIFEST = "config/staging-commercial-certification.json";
export function gitState(root, base) {
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const ancestor = (a, b) => {
    try {
      git(["merge-base", "--is-ancestor", a, b]);
      return true;
    } catch {
      return false;
    }
  };
  return {
    commit: git(["rev-parse", "HEAD"]),
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    clean: git(["status", "--porcelain", "--untracked-files=all"]) === "",
    containsBase: ancestor(base, "origin/main"),
    descendsMain: ancestor("origin/main", "HEAD"),
  };
}
export function confirmationInputs(env = process.env, args = {}) {
  return {
    commit: args["confirm-commit-sha"] ?? env.CONFIRM_COMMIT_SHA,
    project: args["confirm-project-ref"] ?? env.CONFIRM_PROJECT_REF,
    origin: args["confirm-app-origin"] ?? env.CONFIRM_APP_ORIGIN,
    expectedProject: env.STAGING_SUPABASE_PROJECT_REF,
    expectedOrigin: env.STAGING_APPLICATION_ORIGIN,
    productionProject: env.PRODUCTION_SUPABASE_PROJECT_REF,
    productionOrigin: env.PRODUCTION_APPLICATION_ORIGIN,
    githubRef: env.GITHUB_REF,
  };
}
export function proposedCommands(manifest) {
  return [
    "npm run lint",
    "npm run format",
    "npm run build",
    "npm run test:unit",
    "npm run supabase:remote -- link --project-ref <STAGING_PROJECT_REF>",
    "npm run supabase:remote -- migration list --linked",
    "ASSERT remote migration versions equal the separately reviewed prefix",
    "npm run supabase:remote -- db push --linked --dry-run",
    "npm run supabase:remote -- db push --linked --yes",
    ...[...manifest.functions.billing, ...manifest.functions.nonbilling].map(
      (name) =>
        `npm run supabase:remote -- functions deploy ${name} --project-ref <STAGING_PROJECT_REF>`,
    ),
    "npm run supabase:remote -- migration list --linked",
    "ASSERT remote migration versions equal the full approved migration list",
    "WRITE allowlisted deployment evidence; commercial scenarios remain not_run",
  ];
}
export function authorizationRequest(
  manifest,
  commit,
  label = "phase-b-reviewed",
) {
  return {
    schemaVersion: 1,
    status: "authorization_required",
    reviewedCommitSha: commit,
    stagingSupabaseProjectRef: "<STAGING_PROJECT_REF>",
    stagingApplicationOrigin: "<STAGING_APPLICATION_ORIGIN>",
    lemonSqueezyTestStore: "<LEMON_SQUEEZY_TEST_STORE>",
    migrationRange: {
      first: manifest.migrations.approved[0].filename,
      last: manifest.migrations.expectedLatestMigration,
      approved: manifest.migrations.approved,
    },
    functions: manifest.functions,
    requiredSecretNames: manifest.requiredSecretNames,
    webhookEndpoint:
      "https://<STAGING_PROJECT_REF>.supabase.co/functions/v1/billing-lemon-squeezy-webhook",
    scenarioIds: manifest.scenarioIds,
    workflow: ".github/workflows/supabase-deploy-staging.yml",
    inputs: {
      mode: "apply",
      confirm_commit_sha: commit,
      confirm_project_ref: "<STAGING_PROJECT_REF>",
      confirm_app_origin: "<STAGING_APPLICATION_ORIGIN>",
      evidence_label: label,
    },
    commands: proposedCommands(manifest),
    prerequisites: [
      "Separate explicit authorization for named staging resources",
      "All full-unit tests green",
      "Reviewed remote migration prefix and private recoverable backup",
      "Verified staging auth, test Store, provider mappings, function secrets and portal controls",
      "Protected supabase-staging approval and exact current main commit",
    ],
    production:
      "Production remains untouched. No live provider operation is authorized.",
    providerOperations:
      "No provider operation is automated here. Name and approve Store configuration, webhook registration, mapping activation and test purchases separately before the scenario run.",
  };
}
export function makePlan(manifest, input, state, label = "phase-a") {
  parseSafe(manifestSchema, manifest, "MANIFEST_INVALID");
  validateConfirmations(input, state);
  requireCheck(
    /^[a-z0-9][a-z0-9-]{0,47}$/.test(label),
    "EVIDENCE_LABEL_INVALID",
  );
  return {
    schemaVersion: 1,
    environment: "staging",
    providerEnvironment: "test",
    commitSha: state.commit,
    evidenceLabel: label,
    verdict: "blocked",
    planValidation: "pass",
    remoteExecuted: false,
    applyBlockers: [
      "FULL_UNIT_SUITE_GREEN_REQUIRED",
      "PHASE_B_AUTHORIZATION_REQUIRED",
      "REMOTE_PREREQUISITES_UNVERIFIED",
    ],
    authorization: authorizationRequest(manifest, state.commit, label),
  };
}
export function validateBundle(root, path = DEFAULT_MANIFEST) {
  const manifest = validateRepository(root, readJson(resolve(root, path)));
  parseSafe(
    scenariosSchema,
    readJson(resolve(root, "config/staging-commercial-scenarios.json")),
    "SCENARIOS_INVALID",
  );
  parseSafe(
    rollbackSchema,
    readJson(resolve(root, "config/staging-commercial-rollback.json")),
    "ROLLBACK_INVALID",
  );
  validateProviderMappings(
    readJson(resolve(root, "config/staging-commercial-provider.fake.json")),
  );
  validateEvidence(
    readJson(resolve(root, "config/staging-commercial-evidence.template.json")),
  );
  return manifest;
}
export function runPlan(
  argv = process.argv.slice(2),
  env = process.env,
  root = process.cwd(),
) {
  let plan;
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        manifest: { type: "string" },
        "confirm-commit-sha": { type: "string" },
        "confirm-project-ref": { type: "string" },
        "confirm-app-origin": { type: "string" },
        "evidence-label": { type: "string" },
        validate: { type: "boolean" },
      },
    });
    const manifest = validateBundle(root, values.manifest);
    if (values.validate) return { valid: true };
    const label = values["evidence-label"] ?? env.EVIDENCE_LABEL ?? "phase-a";
    requireCheck(
      /^[a-z0-9][a-z0-9-]{0,47}$/.test(label),
      "EVIDENCE_LABEL_INVALID",
    );
    plan = makePlan(
      manifest,
      confirmationInputs(env, values),
      gitState(root, manifest.requiredBaseCommit),
      label,
    );
  } catch (error) {
    // Never print Zod input, raw git/OS errors, command arguments or env values.
    const code = /^[A-Z][A-Z_]{2,80}$/.test(error.message ?? "")
      ? error.message
      : "PLAN_VALIDATION_FAILED";
    plan = {
      schemaVersion: 1,
      verdict: "blocked",
      planValidation: "fail",
      remoteExecuted: false,
      errorCode: code,
    };
  }
  const output = resolve(root, "output/staging-commercial/plan");
  mkdirSync(output, { recursive: true });
  rmSync(resolve(output, "authorization-request.json"), { force: true });
  writeFileSync(
    resolve(output, "plan.json"),
    billingOutput.serialize(plan) + "\n",
  );
  writeFileSync(
    resolve(output, "plan.md"),
    billingOutput.serialize(
      `# Staging commercial plan\n\nValidation: ${plan.planValidation}. Verdict: blocked. Remote executed: false.\n\n${plan.authorization ? "```json\n" + JSON.stringify(plan.authorization, null, 2) + "\n```" : plan.errorCode}\n`,
    ),
  );
  if (plan.authorization)
    writeFileSync(
      resolve(output, "authorization-request.json"),
      JSON.stringify(plan.authorization, null, 2) + "\n",
    );
  return plan;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = runPlan();
  billingOutput.log(
    JSON.stringify({
      valid: result.valid,
      planValidation: result.planValidation,
      verdict: result.verdict,
      errorCode: result.errorCode,
    }),
  );
  if (result.planValidation === "fail") process.exitCode = 1;
}
