import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import {
  runPreflight,
  validatePreflightEvidence,
  preflightFailureLine,
  requireGreenUnits,
} from "../../scripts/staging-commercial-preflight.mjs";
import { apply } from "../../scripts/staging-commercial-apply.mjs";
import { scanRedaction } from "../../scripts/staging-commercial-evidence.mjs";
import { sha256 } from "../../scripts/staging-commercial-contracts.mjs";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  execFileSync: vi.fn(() => {
    throw new Error("Unexpected subprocess in fixture");
  }),
}));
const repository = process.cwd();
const manifest = JSON.parse(
  readFileSync("config/staging-commercial-certification.json", "utf8"),
);
const commit = "a".repeat(40),
  project = "s".repeat(20);
const inputs = {
  commit,
  project,
  expectedProject: project,
  productionProject: "p".repeat(20),
  origin: "https://staging.example.com",
  expectedOrigin: "https://staging.example.com",
  productionOrigin: "https://production.example.com",
  githubRef: "refs/heads/main",
};
const state = {
  commit,
  branch: "main",
  clean: true,
  containsBase: true,
  descendsMain: true,
};
function authorization() {
  const mappings = JSON.parse(
    readFileSync(
      join(repository, "config/staging-commercial-provider.fake.json"),
      "utf8",
    ),
  );
  for (const m of mappings.mappings)
    for (const k of ["storeRef", "productRef", "variantRef", "priceRef"])
      m[k] = "sha256:" + sha256(m[k]);
  return {
    reviewedCommit: commit,
    manifestSha256: sha256(JSON.stringify(manifest)),
    projectSha256: sha256(project),
    originSha256: sha256(inputs.origin),
    approvedRemoteVersions: [],
    backupEvidenceSha256: "b".repeat(64),
    auth: {
      siteUrl: inputs.origin,
      redirectUrls: [inputs.origin + "/auth/callback"],
      signupEnabled: true,
      confirmationsEnabled: true,
    },
    providerMappings: mappings,
    remoteSecretNamesPresent: manifest.requiredSecretNames,
    providerEnvironment: "test",
    billingAppOrigin: inputs.origin,
    portalAllowedHosts: ["test-store.lemonsqueezy.com"],
    portalControlsReviewed: true,
    webhookTestStoreReviewed: true,
    rollbackReviewed: true,
  };
}
function green() {
  return {
    success: true,
    numTotalTestSuites: 1,
    numPassedTestSuites: 1,
    numFailedTestSuites: 0,
    numTotalTests: 1784,
    numPassedTests: 1784,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [
      {
        name: "tests/unit/static.test.ts",
        status: "passed",
        assertionResults: Array.from({ length: 1784 }, () => ({
          status: "passed",
          fullName: "safe suite literal failure",
        })),
      },
    ],
  };
}
let root: string, deps: any;
const evidence = () =>
  JSON.parse(
    readFileSync(
      join(root, "output/staging-commercial/preflight/preflight-evidence.json"),
      "utf8",
    ),
  );
function child(
  report: any = green(),
  status: number | null = 0,
  error?: Error,
) {
  deps.spawnSync.mockImplementation(
    (_exe: string, args: string[], options: any) => {
      expect(args.slice(1, 5)).toEqual([
        "run",
        "test:unit",
        "--",
        "--reporter=json",
      ]);
      expect(options.stdio).toEqual(["ignore", "ignore", "ignore"]);
      if (report !== undefined)
        writeFileSync(
          args[5].slice("--outputFile=".length),
          typeof report === "string" ? report : JSON.stringify(report),
        );
      return {
        status,
        error,
        stdout: "Bearer fake-child-output",
        stderr: "password=fake-child-output",
      };
    },
  );
}
function fail(code: string, stage?: string) {
  let error: unknown;
  try {
    runPreflight("preflight", deps);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(Error);
  const e = evidence();
  expect(e.outcome).toBe("fail");
  expect(e.errorCode).toBe(code);
  if (stage) expect(e.failedStage).toBe(stage);
  expect(scanRedaction(e)).toEqual([]);
  expect(() => validatePreflightEvidence(e)).not.toThrow();
  expect(preflightFailureLine("preflight", error)).toBe(
    `STAGING_PREFLIGHT_FAILED:${e.failedStage}:${code}`,
  );
  expect(JSON.stringify(e)).not.toMatch(
    /fake-child-output|backupEvidence|sha256:|https?:|password=/,
  );
  return e;
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "commercial-preflight-"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.stubEnv("GITHUB_ACTIONS", "true");
  vi.stubEnv("GITHUB_REF", "refs/heads/main");
  vi.stubEnv("GITHUB_SHA", commit);
  vi.stubEnv("GITHUB_RUN_ID", "12345");
  vi.stubEnv("SUPABASE_ACCESS_TOKEN", "fixture-only");
  vi.stubEnv("SUPABASE_DB_PASSWORD", "fixture-only");
  vi.stubEnv(
    "STAGING_COMMERCIAL_AUTHORIZATION",
    JSON.stringify(authorization()),
  );
  vi.stubEnv("npm_execpath", join(root, "npm/bin/npm-cli.js"));
  vi.stubEnv("ALLOW_REMOTE_SUPABASE", "");
  deps = {
    validateBundle: vi.fn(() => manifest),
    confirmationInputs: vi.fn(() => inputs),
    gitState: vi.fn(() => state),
    spawnSync: vi.fn(),
  };
  mkdirSync(join(root, "tests/unit"), { recursive: true });
  writeFileSync(
    join(root, "tests/unit/static.test.ts"),
    'describe("safe suite", () => { it("literal failure", () => {}); });',
  );
  child();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("safe shared preflight", () => {
  it("writes schema failure evidence before units", () => {
    vi.stubEnv("STAGING_COMMERCIAL_AUTHORIZATION", "{}");
    const e = fail(
      "PHASE_B_AUTHORIZATION_INVALID",
      "phase_b_authorization_validation",
    );
    expect(e.lastCompletedStage).toBe("workflow_boundary_validation");
    expect(e.phaseBValidated).toBe(false);
    expect(deps.spawnSync).not.toHaveBeenCalled();
  });
  it("maps malformed private JSON to a constant", () => {
    vi.stubEnv("STAGING_COMMERCIAL_AUTHORIZATION", "{private-invalid-fixture");
    fail("PHASE_B_AUTHORIZATION_INVALID");
  });
  it("reports the exact authorization binding mismatch", () => {
    vi.stubEnv(
      "STAGING_COMMERCIAL_AUTHORIZATION",
      JSON.stringify({ ...authorization(), reviewedCommit: "b".repeat(40) }),
    );
    fail("AUTHORIZATION_BINDING_MISMATCH");
  });
  it("checks deploy presence after authorization without recording names or values", () => {
    vi.stubEnv("SUPABASE_DB_PASSWORD", " ");
    expect(
      fail("DEPLOY_SECRET_MISSING", "deploy_secret_presence").phaseBValidated,
    ).toBe(true);
  });
  it("checks npm context before starting units", () => {
    vi.stubEnv("npm_execpath", "");
    fail("NPM_CONTEXT_REQUIRED", "npm_context_validation");
    expect(deps.spawnSync).not.toHaveBeenCalled();
  });
  it("records a process that cannot start and writes evidence", () => {
    deps.spawnSync.mockReturnValue({
      status: null,
      error: new Error("private startup fixture"),
    });
    const e = fail("UNIT_COMMAND_FAILED", "unit_command");
    expect(e.units.commandStarted).toBe(false);
    expect(e.units.commandExitCode).toBeNull();
  });
  it("distinguishes nonzero with no report", () => {
    deps.spawnSync.mockReturnValue({ status: 1 });
    const e = fail("UNIT_REPORT_MISSING", "unit_report_validation");
    expect(e.units.commandExitCode).toBe(1);
    expect(e.units.reportPresent).toBe(false);
  });
  it("parses nonzero failed reports and retains only verified static identities", () => {
    const r = green();
    r.success = false;
    r.numFailedTests = 1;
    r.numPassedTests--;
    r.numFailedTestSuites = 1;
    r.numPassedTestSuites = 0;
    r.testResults[0].status = "failed";
    r.testResults[0].name = join(root, "tests/unit/static.test.ts");
    r.testResults[0].assertionResults[0].status = "failed";
    Object.assign(r.testResults[0].assertionResults[0], {
      failureMessages: ["Bearer fake-assertion"],
      received: "private-fixture",
    });
    child(r, 1);
    const e = fail("UNIT_COMMAND_FAILED", "unit_command");
    expect(e.units.numFailedTests).toBe(1);
    expect(e.units.greenValidated).toBe(false);
    expect(e.units.failingTests).toEqual([
      {
        file: "tests/unit/static.test.ts",
        fullName: "safe suite literal failure",
      },
    ]);
    expect(JSON.stringify(e)).not.toMatch(/fake-assertion|private-fixture/);
  });
  it("does not publish parameterized names or paths outside repository tests", () => {
    const r = green();
    r.testResults[0].assertionResults[0] = {
      status: "failed",
      fullName: "safe suite dynamic private-value",
    };
    child(r, 1);
    expect(fail("UNIT_COMMAND_FAILED").units.failingTests).toEqual([]);
  });
  it("rejects unreadable reports without echoing contents", () => {
    child("private-unreadable-fixture");
    fail("UNIT_REPORT_UNREADABLE");
  });
  it("rejects a successful command with an incompatible green report", () => {
    const r = green();
    r.testResults[0].assertionResults.pop();
    child(r);
    const e = fail("UNIT_REPORT_CONTRACT_FAILED", "unit_report_validation");
    expect(e.units.commandExitCode).toBe(0);
    expect(e.units.greenValidated).toBe(false);
  });
  it("rejects missing numeric fields and malformed report structure", () => {
    child({ success: true, testResults: null });
    fail("UNIT_REPORT_CONTRACT_FAILED");
  });
  it("keeps failed or skipped assertions blocking even with exit zero", () => {
    const r = green();
    r.testResults[0].assertionResults[0].status = "skipped";
    child(r);
    fail("FULL_UNIT_SUITE_NOT_GREEN");
  });
  it("passes a fully green report with final confirmation and no remote execution", () => {
    runPreflight("preflight", deps);
    const e = evidence();
    expect(e.outcome).toBe("pass");
    expect(e.lastCompletedStage).toBe("ready_for_remote");
    expect(e.failedStage).toBeNull();
    expect(e.remoteExecuted).toBe(false);
    expect(e.units.greenValidated).toBe(true);
    expect(e.units.assertionResultCount).toBe(1784);
    expect(e.units.reportSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(deps.gitState).toHaveBeenCalledTimes(2);
    expect(() => validatePreflightEvidence(e)).not.toThrow();
    expect(scanRedaction(e)).toEqual([]);
    expect(execFileSync).not.toHaveBeenCalled();
  });
  it("revalidates confirmations after green units", () => {
    deps.gitState
      .mockReturnValueOnce(state)
      .mockReturnValueOnce({ ...state, clean: false });
    const e = fail("DIRTY_WORKTREE", "final_confirmation_validation");
    expect(e.units.greenValidated).toBe(true);
  });
  it("collapses unexpected exceptions and writes early bundle evidence", () => {
    deps.validateBundle.mockImplementation(() => {
      throw new Error("Bearer unexpected-private-fixture");
    });
    const e = fail("UNKNOWN_PRE_REMOTE_FAILURE", "bundle_validation");
    expect(e.lastCompletedStage).toBeNull();
    expect(JSON.stringify(e)).not.toContain("unexpected-private-fixture");
  });
  it("clears stale reports before executing units", () => {
    runPreflight("preflight", deps);
    deps.spawnSync.mockReturnValue({ status: 1 });
    expect(fail("UNIT_REPORT_MISSING").units.reportPresent).toBe(false);
  });
  it("sanitizes invalid runtime metadata and rejects extra evidence fields", () => {
    vi.stubEnv("GITHUB_RUN_ID", "Bearer fixture");
    vi.stubEnv("GITHUB_SHA", "private");
    deps.validateBundle.mockImplementation(() => {
      throw new Error("fixture");
    });
    const e = fail("UNKNOWN_PRE_REMOTE_FAILURE");
    expect(e.workflowRunId).toBeNull();
    expect(e.commitSha).toBeNull();
    expect(() =>
      validatePreflightEvidence({ ...e, stdout: "fixture" }),
    ).toThrow();
  });
  it.each(["GITHUB_ACTIONS", "GITHUB_REF"])(
    "blocks an invalid protected workflow boundary: %s",
    (key) => {
      vi.stubEnv(key, "invalid");
      fail(
        "AUTHORIZED_STAGING_WORKFLOW_REQUIRED",
        "workflow_boundary_validation",
      );
    },
  );
  it("retains apply-only remote authorization requirements", () => {
    expect(() => runPreflight("apply", deps)).toThrow(
      "AUTHORIZED_STAGING_WORKFLOW_REQUIRED",
    );
    expect(deps.spawnSync).not.toHaveBeenCalled();
  });
  it.each([
    ["productionProject", project, "PRODUCTION_PROJECT_BLOCKED"],
    ["productionOrigin", inputs.origin, "PRODUCTION_ORIGIN_BLOCKED"],
  ])("retains the production deny boundary for %s", (key, value, code) => {
    deps.confirmationInputs.mockReturnValue({ ...inputs, [key]: value });
    fail(code, "confirmation_validation");
  });
  it("apply makes no subprocess call when its real shared preflight fails", async () => {
    await expect(apply()).rejects.toThrow();
    expect(evidence().failedStage).toBe("bundle_validation");
    expect(execFileSync).not.toHaveBeenCalled();
  });
});

describe("preflight workflow and module boundaries", () => {
  it("shares one gate while keeping the preflight entrypoint independent of remote execution", () => {
    const pre = readFileSync(
      join(repository, "scripts/staging-commercial-preflight.mjs"),
      "utf8",
    );
    const app = readFileSync(
      join(repository, "scripts/staging-commercial-apply.mjs"),
      "utf8",
    );
    expect(pre).not.toMatch(
      /staging-commercial-apply|supabase-remote-guard|fetch\(|execFileSync\(|remote\(/,
    );
    expect(app).toContain('runPreflight("apply")');
    expect(app).toContain(
      'console.error(preflightFailureLine("apply", error))',
    );
    expect(app.indexOf('runPreflight("apply")')).toBeLessThan(
      app.indexOf('remote(["link"'),
    );
    expect(app).not.toMatch(
      /function requireGreenUnits|validateBundle\(|validateApplyAuthorization\(|spawnSync\(/,
    );
    expect(pre).toContain("runPreflight();");
    expect(() => requireGreenUnits(green())).not.toThrow();
  });
  it("protects preflight without CLI setup or a remote enable flag and uploads only sanitized evidence", () => {
    const yaml = createRequire(import.meta.url)("js-yaml").load(
      readFileSync(
        join(repository, ".github/workflows/supabase-deploy-staging.yml"),
        "utf8",
      ),
    );
    expect(yaml.on.workflow_dispatch.inputs.mode.options).toEqual([
      "plan",
      "preflight",
      "apply",
    ]);
    const job = yaml.jobs.certification;
    expect(job.environment).toBe("supabase-staging");
    expect(job.if).toBe("github.ref == 'refs/heads/main'");
    expect(job.env.ALLOW_REMOTE_SUPABASE).toBeUndefined();
    const step = job.steps.find(
      (s: any) => s.run === "npm run staging:commercial:preflight",
    );
    expect(step.if).toBe("inputs.mode == 'preflight'");
    expect(step.env.ALLOW_REMOTE_SUPABASE).toBeUndefined();
    expect(Object.keys(step.env).sort()).toEqual([
      "STAGING_COMMERCIAL_AUTHORIZATION",
      "SUPABASE_ACCESS_TOKEN",
      "SUPABASE_DB_PASSWORD",
    ]);
    for (const s of job.steps) {
      if (
        s.uses?.startsWith("supabase/setup-cli") ||
        s.env?.ALLOW_REMOTE_SUPABASE ||
        s.run?.includes("staging:commercial:apply")
      )
        expect(s.if).toBe("inputs.mode == 'apply'");
      if (s.if !== "inputs.mode == 'apply'")
        expect(s.run ?? "").not.toMatch(
          /\blink\b|--linked|db push|functions deploy|supabase-remote-guard/,
        );
    }
    const artifact = job.steps.find(
      (s: any) =>
        s.with?.path ===
        "output/staging-commercial/preflight/preflight-evidence.json",
    );
    expect(artifact.if).toBe(
      "always() && (inputs.mode == 'preflight' || inputs.mode == 'apply')",
    );
    expect(artifact.with["if-no-files-found"]).toBe("error");
    expect(artifact.with["retention-days"]).toBe(7);
    const paths = job.steps
      .filter((s: any) => s.uses?.startsWith("actions/upload-artifact"))
      .map((s: any) => s.with.path);
    expect(paths).toEqual([
      "output/staging-commercial/plan/",
      "output/staging-commercial/preflight/preflight-evidence.json",
      "output/staging-commercial/apply/deployment-evidence.json",
    ]);
  });
});
