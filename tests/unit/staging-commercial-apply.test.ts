import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  apply,
  applyFailureLine,
  runRemote,
} from "../../scripts/staging-commercial-apply.mjs";
import {
  runPreflight,
  preflightFailureLine,
} from "../../scripts/staging-commercial-preflight.mjs";
import {
  validateEvidence,
  validateDeploymentEvidence,
  verdict,
} from "../../scripts/staging-commercial-evidence.mjs";
import {
  REMOTE_STAGES,
  REMOTE_STAGE_ERRORS,
  initialRemoteProgress,
} from "../../scripts/staging-commercial-remote-stages.mjs";
import {
  guardedArgs,
  guardedExitCode,
} from "../../scripts/supabase-remote-guard.mjs";

// Every process and write boundary is mocked, including the default unexpected
// call. These tests cannot invoke Supabase or the actual protected apply entrypoint.
vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
vi.mock("../../scripts/staging-commercial-preflight.mjs", async (original) => ({
  ...(await original<any>()),
  runPreflight: vi.fn(),
}));

const manifest = JSON.parse(
  readFileSync("config/staging-commercial-certification.json", "utf8"),
);
const functions = [
  ...manifest.functions.billing,
  ...manifest.functions.nonbilling,
];
const versions = manifest.migrations.approved.map((m: any) =>
  m.filename.slice(0, 14),
);
const project = "s".repeat(20);
const commit = "a".repeat(40);
const privateText = `Bearer fake-private-token password=fake-password https://private.example.invalid ${project} eyJfake.eyJfake.signature`;
const cliError = () =>
  Object.assign(new Error(privateText), {
    status: 7,
    signal: null,
    stdout: privateText,
    stderr: privateText,
  });
const ledger = (applied: string[]) =>
  JSON.stringify({
    migrations: versions.map((v: string) => ({
      local: v,
      remote: applied.includes(v) ? v : "",
      time: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)} ${v.slice(8, 10)}:${v.slice(10, 12)}:${v.slice(12, 14)}`,
    })),
    message: "Synthetic JSON ledger display metadata",
  });
const commands = [
  ["link", "--project-ref", project],
  ["migration", "list", "--linked", "--output-format", "json"],
  ["db", "push", "--linked", "--dry-run"],
  ["db", "push", "--linked", "--yes"],
  ...functions.map((name: string) => [
    "functions",
    "deploy",
    name,
    "--project-ref",
    project,
  ]),
  ["migration", "list", "--linked", "--output-format", "json"],
];
let snapshots: any[], attempted: string[][];
function configure({
  commandFailure = -1,
  before = ledger([]),
  after = ledger(versions),
} = {}) {
  vi.mocked(execFileSync).mockImplementation(
    (_executable: any, args: any, options: any) => {
      expect(args[0]).toBe("scripts/supabase-remote-guard.mjs");
      expect(options.stdio).toEqual(["ignore", "pipe", "pipe"]);
      const index = attempted.length;
      const command = args.slice(1);
      attempted.push(command);
      expect(command).toEqual(commands[index]);
      const expectedStage =
        index === 0
          ? "link"
          : index === 1
            ? "migration_list_before"
            : index === 2
              ? "db_push_dry_run"
              : index === 3
                ? "db_push_apply"
                : index === commands.length - 1
                  ? "migration_list_after"
                  : "function_deploy";
      expect(snapshots.at(-1)).toMatchObject({
        remoteStarted: true,
        remoteStage: expectedStage,
      });
      if (index === commandFailure) throw cliError();
      return index === 1
        ? before
        : index === commands.length - 1
          ? after
          : privateText;
    },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  snapshots = [];
  attempted = [];
  vi.mocked(mkdirSync).mockImplementation(() => undefined);
  vi.mocked(writeFileSync).mockImplementation((path: any, data: any) => {
    expect(path).toBe(
      "output/staging-commercial/apply/deployment-evidence.json",
    );
    snapshots.push(JSON.parse(data));
  });
  vi.mocked(runPreflight).mockReturnValue({
    manifest,
    inputs: { project },
    state: { commit },
    auth: { approvedRemoteVersions: [] },
  });
  configure();
});
async function failure() {
  try {
    await apply();
  } catch (error) {
    return error;
  }
  throw new Error("Expected apply to fail");
}

describe("apply remote-stage evidence", () => {
  it("advances from the pinned JSON empty ledger to the dry-run command", async () => {
    const before = readFileSync(
      "tests/fixtures/staging-commercial/supabase-2.109.1-migration-list-empty.json",
      "utf8",
    );
    // Stop at a mocked dry-run failure: no actual Supabase process is possible.
    configure({ before, commandFailure: 2 });
    const error = await failure();
    expect(attempted).toEqual(commands.slice(0, 3));
    for (const stage of [
      "link",
      "migration_list_before",
      "history_validation_before",
    ])
      expect(snapshots.some((e) => e.lastCompletedRemoteStage === stage)).toBe(
        true,
      );
    expect(snapshots.at(-1)).toMatchObject({
      lastCompletedRemoteStage: "history_validation_before",
      failedRemoteStage: "db_push_dry_run",
      remoteErrorCode: "DB_PUSH_DRY_RUN_FAILED",
    });
    expect(applyFailureLine(error)).toBe(
      "STAGING_APPLY_REMOTE_FAILED:db_push_dry_run:DB_PUSH_DRY_RUN_FAILED",
    );
    expect(JSON.stringify(snapshots)).not.toContain(
      "Sanitized migration-list display message",
    );
    expect(JSON.stringify(snapshots)).not.toContain('"migrations"');
  });
  it.each([
    ["link", null, 0, 1, 0],
    ["migration_list_before", "link", 1, 2, 0],
    ["history_validation_before", "migration_list_before", -1, 2, 0],
    ["db_push_dry_run", "history_validation_before", 2, 3, 0],
    ["db_push_apply", "db_push_dry_run", 3, 4, 0],
    ["function_deploy", "db_push_apply", 4, 5, 0],
    ["function_deploy", "function_deploy", 7, 8, 3],
    ["migration_list_after", "function_deploy", 18, 19, 14],
    ["history_validation_after", "migration_list_after", -1, 19, 14],
  ])(
    "fails closed at %s after %s",
    async (stage, last, commandFailure, callCount, deployedCount) => {
      configure({
        commandFailure: commandFailure as number,
        ...(stage === "history_validation_before"
          ? { before: ledger([versions[0]]) }
          : {}),
        ...(stage === "history_validation_after" ? { after: ledger([]) } : {}),
      });
      const error = await failure();
      const code =
        REMOTE_STAGE_ERRORS[stage as keyof typeof REMOTE_STAGE_ERRORS];
      expect(error).toMatchObject({
        message: "REMOTE_EXECUTION_FAILED_USE_ROLLBACK_RUNBOOK",
        stage,
      });
      expect(applyFailureLine(error)).toBe(
        `STAGING_APPLY_REMOTE_FAILED:${stage}:${code}`,
      );
      expect(attempted).toEqual(commands.slice(0, callCount as number));
      const e = snapshots.at(-1);
      expect(e).toMatchObject({
        remoteStarted: true,
        remoteStage: stage,
        failedRemoteStage: stage,
        lastCompletedRemoteStage: last,
        remoteErrorCode: code,
      });
      expect(e.records).toHaveLength(1);
      expect(e.records[0]).toMatchObject({
        scenarioId: "CERT-DEPLOY-001",
        status: "fail",
        errorCode: "REMOTE_EXECUTION_FAILED",
        deployedFunctions: functions.slice(0, deployedCount as number),
      });
      expect(verdict(e)).toBe("blocked");
      for (const snapshot of snapshots)
        expect(() => validateDeploymentEvidence(snapshot)).not.toThrow();
      expect(
        JSON.stringify(snapshots) +
          applyFailureLine(error) +
          JSON.stringify(error),
      ).not.toMatch(
        /fake-private-token|fake-password|private\.example|eyJfake|password=|Bearer/,
      );
      expect(JSON.stringify(snapshots) + applyFailureLine(error)).not.toContain(
        project,
      );
    },
  );
  it("completes the exact 18-command sequence with JSON empty/full ledgers and remains uncertified", async () => {
    await apply();
    expect(runPreflight).toHaveBeenCalledExactlyOnceWith("apply");
    expect(attempted).toEqual(commands);
    expect(attempted.filter((args) => args[0] === "migration")).toEqual([
      ["migration", "list", "--linked", "--output-format", "json"],
      ["migration", "list", "--linked", "--output-format", "json"],
    ]);
    expect(
      snapshots.some(
        (e) => e.lastCompletedRemoteStage === "history_validation_after",
      ),
    ).toBe(true);
    const e = snapshots.at(-1);
    expect(e).toMatchObject({
      remoteStarted: true,
      remoteStage: "deployment_complete",
      lastCompletedRemoteStage: "deployment_complete",
      failedRemoteStage: null,
      remoteErrorCode: null,
    });
    expect(e.records[0]).toMatchObject({
      status: "pass",
      scenarioId: "CERT-DEPLOY-001",
    });
    expect(e.records[1]).toMatchObject({
      status: "not_run",
      scenarioId: "CERT-DEPLOY-002",
      deployedFunctions: functions,
    });
    expect(verdict(e)).toBe("blocked");
    expect([
      ...new Set(snapshots.map((e) => e.remoteStage).filter(Boolean)),
    ]).toEqual(REMOTE_STAGES);
    expect(snapshots[0]).toMatchObject(initialRemoteProgress());
    for (const snapshot of snapshots)
      expect(() => validateDeploymentEvidence(snapshot)).not.toThrow();
    expect(JSON.stringify(snapshots)).not.toContain(privateText);
    expect(JSON.stringify(snapshots)).not.toContain(
      "Synthetic JSON ledger display metadata",
    );
    expect(JSON.stringify(snapshots)).not.toContain('"migrations"');
    expect(
      readFileSync("scripts/staging-commercial-apply.mjs", "utf8"),
    ).toContain("DEPLOYMENT_COMMANDS_COMPLETE_CERTIFICATION_STILL_BLOCKED");
  });
  it.each(["before", "after"])(
    "keeps malformed %s ledger output in history validation",
    async (when) => {
      configure({ [when]: '{"migrations":' + privateText });
      const error = await failure();
      expect(snapshots.at(-1).failedRemoteStage).toBe(
        `history_validation_${when}`,
      );
      expect(JSON.stringify(snapshots) + applyFailureLine(error)).not.toContain(
        privateText,
      );
      expect(attempted).toHaveLength(when === "before" ? 2 : 19);
    },
  );
  it.each([
    "FULL_UNIT_SUITE_NOT_GREEN",
    "PRODUCTION_PROJECT_BLOCKED",
    "PRODUCTION_ORIGIN_BLOCKED",
  ])(
    "preserves preflight failure %s without starting remote work",
    async (code) => {
      const original = new Error(code);
      vi.mocked(runPreflight).mockImplementation(() => {
        throw original;
      });
      expect(await failure()).toBe(original);
      expect(applyFailureLine(original)).toBe(
        preflightFailureLine("apply", original),
      );
      expect(execFileSync).not.toHaveBeenCalled();
      expect(mkdirSync).not.toHaveBeenCalled();
      expect(snapshots).toEqual([]);
    },
  );
  it("fails closed and keeps a safe summary if evidence persistence fails", async () => {
    vi.mocked(writeFileSync).mockImplementation(() => {
      throw new Error(privateText);
    });
    const error = await failure();
    expect(applyFailureLine(error)).toBe(
      "STAGING_APPLY_LOCAL_FAILED:UNKNOWN_REMOTE_FAILURE",
    );
    expect(execFileSync).not.toHaveBeenCalled();
    expect(JSON.stringify(error)).not.toContain(privateText);
  });
});

describe("child-process contract", () => {
  it("accepts explicit JSON ledger arguments without bypassing guard boundaries", () => {
    const args = ["migration", "list", "--linked", "--output-format", "json"];
    const env = {
      ALLOW_REMOTE_SUPABASE: "I_UNDERSTAND_THIS_TOUCHES_REMOTE",
      SUPABASE_PROJECT_REF: project,
    };
    expect(guardedArgs(args, env, project)).toEqual(args);
    expect(() => guardedArgs(args, {}, project)).toThrow(
      "REMOTE_AUTHORIZATION_REQUIRED",
    );
    expect(() => guardedArgs(args, env, "p".repeat(20))).toThrow(
      "REMOTE_LINK_MISMATCH",
    );
    expect(() => guardedArgs([...args, "--local"], env, project)).toThrow(
      "REMOTE_LINK_MISMATCH",
    );
    expect(() =>
      guardedArgs([...args, "--project-ref", project], env, project),
    ).toThrow("REMOTE_LINK_MISMATCH");
    expect(() =>
      guardedArgs([...args, "--password", "synthetic"], env, project),
    ).toThrow("REMOTE_ARGUMENT_REJECTED_USE_ENV_SECRET");
  });
  it.each([
    [
      "spawn error",
      Object.assign(new Error(privateText), { code: "ENOENT" }),
      null,
      null,
    ],
    ["nonzero exit", cliError(), 7, null],
    [
      "signal",
      Object.assign(new Error(privateText), {
        status: null,
        signal: "SIGTERM",
      }),
      null,
      "SIGTERM",
    ],
  ])(
    "classifies %s without publishing the original result",
    (_name, cause, exitCode, signal) => {
      vi.mocked(execFileSync).mockImplementation(() => {
        throw cause;
      });
      let failure: any;
      try {
        runRemote("link", ["link", "--project-ref", project]);
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ stage: "link", exitCode, signal });
      expect(applyFailureLine(failure)).toBe(
        "STAGING_APPLY_REMOTE_FAILED:link:SUPABASE_LINK_FAILED",
      );
      expect(JSON.stringify(failure)).not.toContain(privateText);
      expect(failure).not.toHaveProperty("cause");
    },
  );
  it("returns zero-exit stdout privately for the ledger parser", () => {
    vi.mocked(execFileSync).mockReturnValue(privateText);
    expect(runRemote("migration_list_before", [])).toBe(privateText);
    expect(snapshots).toEqual([]);
  });
  it.each([
    [{ error: new Error(privateText), status: null }, 1],
    [{ error: new Error(privateText), status: 0 }, 1],
    [{ status: 7 }, 7],
    [{ status: null, signal: "SIGTERM" }, 1],
    [{ status: 0, signal: "SIGTERM" }, 1],
    [{ status: null }, 1],
    [{ status: 0, signal: null }, 0],
  ])("guard fails closed for child result %#", (result, code) => {
    expect(guardedExitCode(result)).toBe(code);
  });
});

describe("strict deployment evidence vocabulary", () => {
  const base = {
    schemaVersion: 1,
    environment: "staging",
    providerEnvironment: "test",
    commitSha: commit,
    fullUnitSuiteGreen: true,
    records: [],
  };
  it("reads legacy bundles without inventing remote state, but requires progress for new apply evidence", () => {
    expect(validateEvidence(base)).not.toHaveProperty("remoteStarted");
    expect(() => validateDeploymentEvidence(base)).toThrow(
      "REMOTE_PROGRESS_REQUIRED",
    );
    expect(() =>
      validateDeploymentEvidence({ ...base, ...initialRemoteProgress() }),
    ).not.toThrow();
  });
  it.each([
    "remoteStage",
    "lastCompletedRemoteStage",
    "failedRemoteStage",
    "remoteErrorCode",
  ])("rejects arbitrary %s strings", (key) => {
    expect(() =>
      validateDeploymentEvidence({
        ...base,
        ...initialRemoteProgress(),
        [key]: project,
      }),
    ).toThrow();
  });
  it.each([
    { remoteStarted: true },
    { remoteStage: "link" },
    {
      remoteStarted: true,
      remoteStage: "link",
      failedRemoteStage: "link",
      remoteErrorCode: "DB_PUSH_FAILED",
    },
    {
      remoteStarted: true,
      remoteStage: "link",
      lastCompletedRemoteStage: "db_push_apply",
    },
    { remoteStarted: true, remoteStage: "deployment_complete" },
    { remoteErrorCode: "UNKNOWN_REMOTE_FAILURE" },
  ])("rejects inconsistent progress %#", (progress) => {
    expect(() =>
      validateDeploymentEvidence({
        ...base,
        ...initialRemoteProgress(),
        ...progress,
      }),
    ).toThrow();
  });
  it("rejects incomplete progress fields", () => {
    expect(() => validateEvidence({ ...base, remoteStarted: false })).toThrow();
  });
  it.each(["stdout", "stderr", "command", "authorization", "password"])(
    "rejects additional %s fields",
    (key) => {
      expect(() =>
        validateDeploymentEvidence({
          ...base,
          ...initialRemoteProgress(),
          [key]: privateText,
        }),
      ).toThrow();
    },
  );
});
