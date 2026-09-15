import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, relative, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import ts from "typescript";
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
import { scanRedaction } from "./staging-commercial-evidence.mjs";

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

export const PREFLIGHT_STAGES = [
  "bundle_validation",
  "confirmation_validation",
  "workflow_boundary_validation",
  "phase_b_authorization_validation",
  "deploy_secret_presence",
  "npm_context_validation",
  "unit_command",
  "unit_report_validation",
  "final_confirmation_validation",
  "ready_for_remote",
];
export const PREFLIGHT_CODES = [
  "PHASE_B_AUTHORIZATION_INVALID",
  "AUTHORIZATION_BINDING_MISMATCH",
  "AUTH_CONFIGURATION_MISMATCH",
  "REMOTE_SECRET_ATTESTATION_MISSING",
  "PORTAL_HOST_INVALID",
  "PROVIDER_MAPPING_SCHEMA_INVALID",
  "PROVIDER_MAPPING_SET_MISMATCH",
  "FAKE_PROVIDER_PROOF_BLOCKED",
  "PROVIDER_AMOUNT_OR_CADENCE_MISMATCH",
  "PROVIDER_SEAT_TIER_MISMATCH",
  "PROVIDER_TEST_LIVE_COLLISION",
  "DEPLOY_SECRET_MISSING",
  "NPM_CONTEXT_REQUIRED",
  "FULL_UNIT_SUITE_NOT_GREEN",
  "AUTHORIZED_STAGING_WORKFLOW_REQUIRED",
  "UNIT_COMMAND_FAILED",
  "UNIT_REPORT_MISSING",
  "UNIT_REPORT_UNREADABLE",
  "UNIT_REPORT_CONTRACT_FAILED",
  "UNKNOWN_PRE_REMOTE_FAILURE",
  "COMMIT_REQUIRED",
  "COMMIT_MISMATCH",
  "DIRTY_WORKTREE",
  "COMMIT_SOURCE_MISMATCH",
  "DETACHED_SOURCE_MISMATCH",
  "PROJECT_MISMATCH",
  "PRODUCTION_PROJECT_BLOCKED",
  "PRODUCTION_ORIGIN_BLOCKED",
  "ORIGIN_INVALID",
  "STAGING_ORIGIN_REQUIRED",
  "ORIGIN_MISMATCH",
  "MIGRATION_HISTORY_REQUIRED",
  "REMOTE_MIGRATION_DRIFT",
];
const count = z.number().int().nonnegative().nullable();
const version = z
  .string()
  .regex(/^v?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/)
  .nullable();
const countKeys = [
  "numTotalTestSuites",
  "numPassedTestSuites",
  "numFailedTestSuites",
  "numTotalTests",
  "numPassedTests",
  "numFailedTests",
  "numPendingTests",
  "numTodoTests",
  "assertionResultCount",
  "nonPassedFileCount",
  "nonPassedAssertionCount",
];
const testFilePath = z
  .string()
  .regex(/^tests\/unit\/[a-zA-Z0-9_./-]+\.test\.tsx?$/)
  .refine(
    (v) =>
      !v
        .split("/")
        .some((part) => part === ".." || part === "." || part === ""),
  );
const fileStatuses = ["failed", "pending", "skipped", "todo", "unknown"];
const assertionStatuses = [
  "passed",
  "failed",
  "pending",
  "skipped",
  "todo",
  "disabled",
];
export const preflightEvidenceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  environment: z.literal("staging"),
  providerEnvironment: z.literal("test"),
  commitSha: sha.nullable(),
  workflowRunId: z
    .string()
    .regex(/^\d{1,30}$/)
    .nullable(),
  mode: z.enum(["preflight", "apply"]),
  outcome: z.enum(["pass", "fail"]),
  lastCompletedStage: z.enum(PREFLIGHT_STAGES).nullable(),
  failedStage: z.enum(PREFLIGHT_STAGES).nullable(),
  errorCode: z.enum(PREFLIGHT_CODES).nullable(),
  remoteExecuted: z.literal(false),
  runtime: z.strictObject({
    platform: z.enum(["linux", "win32", "darwin", "other"]),
    nodeVersion: version,
    npmVersion: version,
    vitestVersion: version,
  }),
  phaseBValidated: z.boolean(),
  units: z.strictObject({
    commandExitCode: z.number().int().nullable(),
    commandStarted: z.boolean(),
    reportPresent: z.boolean(),
    reportSha256: digest.nullable(),
    greenValidated: z.boolean().nullable(),
    ...Object.fromEntries(countKeys.map((k) => [k, count])),
    nonPassedFiles: z.array(
      z.strictObject({
        file: testFilePath,
        status: z.enum(fileStatuses),
        failureKind: z.enum([
          "collection_error",
          "module_load_error",
          "hook_error",
          "suite_error",
          "unknown_suite_error",
        ]),
      }),
    ),
    failingTests: z.array(
      z.strictObject({
        file: testFilePath,
        fullName: z.string().min(1).max(500),
      }),
    ),
  }),
});
export function validatePreflightEvidence(value) {
  const result = preflightEvidenceSchema.parse(value);
  requireCheck(
    scanRedaction(result).length === 0,
    "UNKNOWN_PRE_REMOTE_FAILURE",
  );
  return result;
}
const failures = new WeakMap();
function safeCode(error) {
  return error instanceof Error && PREFLIGHT_CODES.includes(error.message)
    ? error.message
    : "UNKNOWN_PRE_REMOTE_FAILURE";
}
export function preflightFailureLine(mode, error) {
  const failure = failures.get(error);
  const prefix =
    mode === "apply"
      ? "STAGING_APPLY_BLOCKED_OR_FAILED"
      : "STAGING_PREFLIGHT_FAILED";
  // Errors after a successful preflight are outside this artifact's scope.
  return `${prefix}:${failure?.stage ?? "ready_for_remote"}:${failure?.code ?? "UNKNOWN_PRE_REMOTE_FAILURE"}`;
}
function safeVersion(value) {
  return version.safeParse(value).success ? value : null;
}
function packageVersion(path) {
  try {
    return safeVersion(readJson(path).version);
  } catch {
    return null;
  }
}

function repositoryTestPath(root, name) {
  if (
    typeof name !== "string" ||
    name.replaceAll("\\", "/").split("/").includes("..")
  )
    return null;
  const path = relative(
    root,
    resolve(root, name.replaceAll("\\", "/")),
  ).replaceAll("\\", "/");
  return testFilePath.safeParse(path).success &&
    scanRedaction(path).length === 0
    ? path
    : null;
}
export function nonPassedFiles(root, files) {
  const entries = new Map();
  for (const file of files) {
    if (file.status === "passed") continue;
    const path = repositoryTestPath(root, file.name);
    if (!path) continue;
    const assertions = file.assertionResults;
    let failureKind = "unknown_suite_error";
    // Vitest's JSON reporter has no structured module/hook discriminator.
    // Never inspect its free-form message, errors, stack or failureMessages.
    if (file.status === "failed" && Array.isArray(assertions)) {
      if (assertions.length === 0) failureKind = "collection_error";
      else if (assertions.every((t) => t?.status === "passed"))
        failureKind = "suite_error";
    }
    const entry = {
      file: path,
      status: fileStatuses.includes(file.status) ? file.status : "unknown",
      failureKind,
    };
    const previous = entries.get(path);
    if (!previous) entries.set(path, entry);
    else if (
      previous.status !== entry.status ||
      previous.failureKind !== entry.failureKind
    ) {
      // Conflicting duplicates never acquire a more specific diagnosis.
      entries.set(path, {
        file: path,
        status: "unknown",
        failureKind: "unknown_suite_error",
      });
    }
  }
  return [...entries.values()].sort((a, b) => a.file.localeCompare(b.file));
}

// Never trust reporter names: parameterized titles may contain received values.
// Only literal describe/it/test chains present in repository source are eligible.
export function staticFailingTests(root, files) {
  const identities = [];
  for (const file of files) {
    if (typeof file.name !== "string" || !Array.isArray(file.assertionResults))
      continue;
    const path = repositoryTestPath(root, file.name);
    if (!path) continue;
    const names = new Set();
    try {
      const source = ts.createSourceFile(
        path,
        readFileSync(resolve(root, path), "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node, parents = []) => {
        if (ts.isCallExpression(node)) {
          const name = ts.isIdentifier(node.expression)
            ? node.expression.text
            : null;
          if (["describe", "it", "test"].includes(name)) {
            const [title, body] = node.arguments;
            if (
              !title ||
              !ts.isStringLiteral(title) ||
              !body ||
              !(ts.isArrowFunction(body) || ts.isFunctionExpression(body))
            )
              return;
            const chain = [...parents, title.text];
            if (name !== "describe") names.add(chain.join(" "));
            else visit(body, chain);
            return;
          }
          // Do not infer static identities from .each(), computed calls or modifiers.
          if (
            ts.isPropertyAccessExpression(node.expression) ||
            ts.isCallExpression(node.expression)
          )
            return;
        }
        ts.forEachChild(node, (child) => visit(child, parents));
      };
      visit(source);
    } catch {
      continue;
    }
    for (const test of file.assertionResults) {
      if (
        test.status === "passed" ||
        !names.has(test.fullName) ||
        test.fullName.length > 500
      )
        continue;
      const identity = { file: path, fullName: test.fullName };
      if (scanRedaction(identity).length === 0) identities.push(identity);
    }
  }
  return identities;
}

// The default dependency graph contains local validators and the fixed unit command
// only. Dependency injection is for unit tests; this module never imports apply.
export function runPreflight(mode = "preflight", dependencies = {}) {
  const root = process.cwd();
  const deps = {
    validateBundle,
    confirmationInputs,
    gitState,
    validateConfirmations,
    validateApplyAuthorization,
    spawnSync,
    ...dependencies,
  };
  const output = resolve(root, "output/staging-commercial/preflight");
  const reportPath = join(output, "units.json");
  mkdirSync(output, { recursive: true });
  let stage = "bundle_validation";
  const e = {
    schemaVersion: 1,
    environment: "staging",
    providerEnvironment: "test",
    commitSha: sha.safeParse(process.env.GITHUB_SHA).success
      ? process.env.GITHUB_SHA
      : null,
    workflowRunId: /^\d{1,30}$/.test(process.env.GITHUB_RUN_ID ?? "")
      ? process.env.GITHUB_RUN_ID
      : null,
    mode,
    outcome: "fail",
    lastCompletedStage: null,
    failedStage: null,
    errorCode: null,
    remoteExecuted: false,
    runtime: {
      platform: ["linux", "win32", "darwin"].includes(process.platform)
        ? process.platform
        : "other",
      nodeVersion: safeVersion(process.version),
      npmVersion: process.env.npm_execpath
        ? packageVersion(
            join(dirname(process.env.npm_execpath), "../package.json"),
          )
        : null,
      vitestVersion: packageVersion(
        join(root, "node_modules/vitest/package.json"),
      ),
    },
    phaseBValidated: false,
    units: {
      commandExitCode: null,
      commandStarted: false,
      reportPresent: false,
      reportSha256: null,
      greenValidated: null,
      ...Object.fromEntries(countKeys.map((k) => [k, null])),
      failingTests: [],
      nonPassedFiles: [],
    },
  };
  const persist = () =>
    writeFileSync(
      join(output, "preflight-evidence.json"),
      JSON.stringify(validatePreflightEvidence(e), null, 2) + "\n",
    );
  const check = (name, fn) => {
    stage = name;
    const result = fn();
    e.lastCompletedStage = name;
    return result;
  };
  try {
    const manifest = check("bundle_validation", () =>
      deps.validateBundle(root),
    );
    let inputs, state;
    check("confirmation_validation", () => {
      inputs = deps.confirmationInputs();
      state = deps.gitState(root, manifest.requiredBaseCommit);
      e.commitSha = sha.safeParse(state.commit).success
        ? state.commit
        : e.commitSha;
      deps.validateConfirmations(inputs, state);
    });
    check("workflow_boundary_validation", () => {
      requireCheck(
        ["preflight", "apply"].includes(mode) &&
          process.env.GITHUB_ACTIONS === "true" &&
          process.env.GITHUB_REF === "refs/heads/main" &&
          (mode === "preflight" ||
            (process.env.ALLOW_REMOTE_SUPABASE ===
              "I_UNDERSTAND_THIS_TOUCHES_REMOTE" &&
              process.env.SUPABASE_PROJECT_REF === inputs.project)),
        "AUTHORIZED_STAGING_WORKFLOW_REQUIRED",
      );
    });
    const auth = check("phase_b_authorization_validation", () => {
      let raw;
      try {
        raw = JSON.parse(
          process.env.STAGING_COMMERCIAL_AUTHORIZATION ?? "null",
        );
      } catch {
        throw new Error("PHASE_B_AUTHORIZATION_INVALID");
      }
      const result = deps.validateApplyAuthorization(
        raw,
        manifest,
        inputs,
        state.commit,
      );
      e.phaseBValidated = true;
      return result;
    });
    check("deploy_secret_presence", () => {
      for (const name of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"])
        requireCheck(
          Boolean(process.env[name]?.trim()),
          "DEPLOY_SECRET_MISSING",
        );
    });
    check("npm_context_validation", () =>
      requireCheck(Boolean(process.env.npm_execpath), "NPM_CONTEXT_REQUIRED"),
    );
    stage = "unit_command";
    // A report left by a previous invocation must never satisfy this gate.
    rmSync(reportPath, { force: true });
    const child = deps.spawnSync(
      process.execPath,
      [
        process.env.npm_execpath,
        "run",
        "test:unit",
        "--",
        "--reporter=json",
        `--outputFile=${reportPath}`,
      ],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    e.units.commandExitCode = Number.isInteger(child.status)
      ? child.status
      : null;
    e.units.commandStarted = !child.error;
    const completed =
      !child.error &&
      !child.signal &&
      Number.isInteger(child.status) &&
      child.status >= 0;
    if (completed) e.lastCompletedStage = "unit_command";
    stage = "unit_report_validation";
    let result;
    try {
      const bytes = readFileSync(reportPath);
      e.units.reportPresent = true;
      e.units.reportSha256 = sha256(bytes);
      try {
        result = JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new Error("UNIT_REPORT_UNREADABLE");
      }
    } catch (error) {
      if (!completed) {
        stage = "unit_command";
        throw new Error("UNIT_COMMAND_FAILED");
      }
      if (error.code === "ENOENT") throw new Error("UNIT_REPORT_MISSING");
      if (safeCode(error) === "UNIT_REPORT_UNREADABLE") throw error;
      throw new Error("UNIT_REPORT_UNREADABLE");
    }
    for (const key of countKeys.slice(0, 8)) {
      const value = result?.[key];
      e.units[key] = Number.isSafeInteger(value) && value >= 0 ? value : null;
    }
    const files = result?.testResults;
    const structural =
      typeof result?.success === "boolean" &&
      Array.isArray(files) &&
      files.every(
        (f) =>
          f &&
          typeof f.name === "string" &&
          ["passed", ...fileStatuses].includes(f.status) &&
          Array.isArray(f.assertionResults) &&
          f.assertionResults.every(
            (t) => t && assertionStatuses.includes(t.status),
          ),
      );
    if (structural) {
      const assertions = files.flatMap((f) => f.assertionResults);
      e.units.assertionResultCount = assertions.length;
      e.units.nonPassedFiles = nonPassedFiles(root, files);
      // Deduplicate accepted identities, but retain counts for rejected paths.
      e.units.nonPassedFileCount = new Set(
        files
          .filter((f) => f.status !== "passed")
          .map((f) => repositoryTestPath(root, f.name) ?? f),
      ).size;
      e.units.nonPassedAssertionCount = assertions.filter(
        (t) => t.status !== "passed",
      ).length;
      e.units.failingTests = staticFailingTests(root, files);
    }
    try {
      requireGreenUnits(result);
      e.units.greenValidated = true;
    } catch {
      e.units.greenValidated = false;
    }
    if (!completed) {
      stage = "unit_command";
      throw new Error("UNIT_COMMAND_FAILED");
    }
    requireCheck(
      structural &&
        countKeys.slice(0, 8).every((k) => e.units[k] !== null) &&
        e.units.assertionResultCount === e.units.numTotalTests,
      "UNIT_REPORT_CONTRACT_FAILED",
    );
    requireCheck(
      e.units.greenValidated && child.status === 0,
      "FULL_UNIT_SUITE_NOT_GREEN",
    );
    e.lastCompletedStage = "unit_report_validation";
    check("final_confirmation_validation", () =>
      deps.validateConfirmations(
        inputs,
        deps.gitState(root, manifest.requiredBaseCommit),
      ),
    );
    e.lastCompletedStage = "ready_for_remote";
    e.outcome = "pass";
    return { manifest, inputs, state, auth };
  } catch (error) {
    e.failedStage = stage;
    e.errorCode = safeCode(error);
    const failure = new Error(e.errorCode);
    failures.set(failure, { stage, code: e.errorCode });
    throw failure;
  } finally {
    persist();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    runPreflight();
    console.log("STAGING_PREFLIGHT_PASS_REMOTE_NOT_EXECUTED");
  } catch (error) {
    console.error(preflightFailureLine("preflight", error));
    process.exitCode = 1;
  }
}
