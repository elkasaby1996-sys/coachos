import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import {
  FRESH_APPLICATION_QUERY,
  INITIAL_AUTH_CONFIGURATION,
  INITIAL_PUBLIC_SETTINGS,
  INSTALL_SCOPE,
  runInitialInstall,
  validateFreshApplication,
} from "../../scripts/staging-initial-install.mjs";
import { STATUS_QUERIES } from "../../scripts/staging-billing-status.mjs";
import { CONFIGURATION_CLASSES } from "../../scripts/billing-deployment-contract.mjs";
import {
  disposableArtifact,
  releaseIdentity,
} from "../../scripts/staging-release-artifacts.mjs";
import { guardedArgs } from "../../scripts/supabase-remote-guard.mjs";

let identity: any;
beforeAll(() => {
  identity = releaseIdentity();
}, 30_000);
const privateValue = "synthetic-private-value-never-logged";
const cleanCounts = {
  public_relations: 0,
  public_routines: 0,
  public_types: 0,
  other_schemas: 0,
  auth_users: 0,
  storage_buckets: 0,
  storage_objects: 0,
};
function fixture() {
  const env: Record<string, string> = {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: INSTALL_SCOPE.repository,
    GITHUB_REF: `refs/heads/${INSTALL_SCOPE.branch}`,
    GITHUB_WORKFLOW: INSTALL_SCOPE.workflow,
    GITHUB_WORKFLOW_REF: `${INSTALL_SCOPE.repository}/${INSTALL_SCOPE.workflowPath}@refs/heads/${INSTALL_SCOPE.branch}`,
    STAGING_INSTALL_ENVIRONMENT: INSTALL_SCOPE.environment,
    GITHUB_SHA: "a".repeat(40),
    CONFIRM_COMMIT_SHA: "a".repeat(40),
    STAGING_SUPABASE_PROJECT_REF: INSTALL_SCOPE.project,
    CONFIRM_PROJECT_REF: INSTALL_SCOPE.project,
    STAGING_APPLICATION_ORIGIN: INSTALL_SCOPE.origin,
    CONFIRM_APP_ORIGIN: INSTALL_SCOPE.origin,
    SUPABASE_ACCESS_TOKEN: privateValue,
    SUPABASE_DB_PASSWORD: privateValue,
    SUPABASE_PROJECT_REF: INSTALL_SCOPE.project,
    ALLOW_REMOTE_SUPABASE: "I_UNDERSTAND_THIS_TOUCHES_REMOTE",
    // A runner must not inherit an alternate CLI API/database route.
    SUPABASE_API_HOST: "https://unrelated.invalid",
    PGHOSTADDR: "192.0.2.1",
    PGSERVICE: "unrelated",
    PGPASSWORD: "unrelated",
  };
  const state = {
    versions: [] as { version: string }[],
    policy: {
      environment: "test",
      sales_enabled: false,
      reconciliation_enabled: false,
    },
    counts: { ...cleanCounts },
    functions: [] as { name: string; status: string; verify_jwt: boolean }[],
    secrets: new Set<string>(
      CONFIGURATION_CLASSES.PADDLE_REQUIRED.filter((n: string) =>
        n.startsWith("PADDLE_"),
      ),
    ),
    auth: { ...INITIAL_AUTH_CONFIGURATION },
    linked: "",
    badDryRun: false,
    commandFailure: "",
    badVersion: false,
    freshReads: 0,
    driftOnSecondRead: false,
    time: 1_000,
    badFunctionVerification: false,
  };
  const source = { commit: env.GITHUB_SHA, clean: true, identity };
  const requests: { resource: string; method: string; body: any }[] = [];
  const transport = vi.fn(async (url: string, options: any) => {
    const prefix = `https://api.supabase.com/v1/projects/${INSTALL_SCOPE.project}/`;
    expect(url.startsWith(prefix)).toBe(true);
    expect(options.redirect).toBe("error");
    expect(options.headers.Authorization).toBe(`Bearer ${privateValue}`);
    const resource = url.slice(prefix.length),
      body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ resource, method: options.method, body });
    if (resource === "database/query/read-only") {
      expect(options.method).toBe("POST");
      expect(body.query).toMatch(/^select/);
      if (body.query === STATUS_QUERIES.schema)
        return Response.json([
          {
            has_migration_history: state.versions.length > 0,
            has_billing_policy: state.versions.length === 188,
          },
        ]);
      if (body.query === STATUS_QUERIES.migrations)
        return Response.json(state.versions);
      if (body.query === STATUS_QUERIES.policy)
        return Response.json([state.policy]);
      if (body.query === FRESH_APPLICATION_QUERY) {
        state.freshReads++;
        if (state.driftOnSecondRead && state.freshReads === 2)
          state.counts.auth_users++;
        return Response.json([state.counts]);
      }
    }
    if (resource === "functions") {
      expect(options.method).toBe("GET");
      return Response.json(
        state.functions.map((f) => ({
          ...f,
          ...(state.badFunctionVerification
            ? { verify_jwt: !f.verify_jwt }
            : {}),
          irrelevant: privateValue,
        })),
      );
    }
    if (resource === "secrets") {
      expect(options.method).toBe("GET");
      return Response.json(
        [...state.secrets].map((name) => ({ name, digest: privateValue })),
      );
    }
    if (resource === "config/auth") {
      if (options.method === "PATCH") {
        expect(body).toEqual(INITIAL_AUTH_CONFIGURATION);
        state.auth = body;
      } else expect(options.method).toBe("GET");
      return Response.json({ ...state.auth, smtp_pass: privateValue });
    }
    throw new Error(`Unexpected mocked endpoint ${resource}`);
  });
  const commands: string[][] = [];
  const execute = vi.fn((program: string, args: string[], options: any) => {
    if (program === "supabase") {
      expect(args).toEqual(["--version"]);
      return {
        status: 0,
        stdout: state.badVersion ? "0.0.0\n" : "2.109.1\n",
        stderr: "",
      };
    }
    expect(program).toBe(process.execPath);
    expect(args[0]).toMatch(/scripts\/supabase-remote-guard\.mjs$/);
    expect(options.shell).toBe(false);
    expect(options.stdio).toEqual(["ignore", "pipe", "pipe"]);
    expect(options.env.SUPABASE_API_HOST).toBeUndefined();
    expect(options.env.PGHOSTADDR).toBeUndefined();
    expect(options.env.PGSERVICE).toBeUndefined();
    expect(options.env.PGPASSWORD).toBeUndefined();
    expect(args.join(" ")).not.toContain(privateValue);
    const command = guardedArgs(args.slice(1), options.env, state.linked);
    commands.push(command);
    if (command[0] === "link") state.linked = INSTALL_SCOPE.project;
    const dryRun = command.includes("--dry-run");
    if (command[0] === "db" && !dryRun) {
      state.versions = identity.manifest.migrations.approved.map((m: any) => ({
        version: m.filename.slice(0, 14),
      }));
    }
    if (
      state.commandFailure &&
      command.join(" ").includes(state.commandFailure)
    )
      return { status: 1, stdout: privateValue, stderr: privateValue };
    if (command[0] === "functions")
      state.functions.push({
        name: command[2],
        status: "ACTIVE",
        verify_jwt: !command.includes("--no-verify-jwt"),
      });
    if (dryRun)
      return {
        status: 0,
        stdout: identity.manifest.migrations.approved
          .slice(state.badDryRun ? 1 : 0)
          .map((m: any) => m.filename)
          .join("\n"),
        stderr: privateValue,
      };
    return { status: 0, stdout: privateValue, stderr: privateValue };
  });
  const cleanup = vi.fn();
  const artifactFactory = vi.fn(
    (root: string, i: any, stage: string, mode: string) => {
      const artifact = disposableArtifact(root, i, stage, mode);
      return {
        ...artifact,
        cleanup: () => {
          cleanup();
          artifact.cleanup();
        },
      };
    },
  );
  return {
    env,
    state,
    source,
    requests,
    commands,
    transport,
    execute,
    cleanup,
    artifactFactory,
    run: (mode = "apply", overrides = {}) =>
      runInitialInstall({
        mode,
        env,
        readSource: () => source,
        transport,
        execute,
        artifactFactory,
        now: () => state.time,
        ...overrides,
      }),
  };
}

describe("initial staging installation under GitHub environment review", () => {
  it("plans the frozen payload without credentials, transport, CLI or a temporary deployment directory", async () => {
    const f = fixture();
    const report = await f.run("plan", { env: {} });
    expect(report).toMatchObject({
      status: "plan",
      remoteWritesMayHaveOccurred: false,
      plan: {
        migrationCount: 188,
        payloadCommit: identity.payload.frozenCommit,
      },
    });
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.artifactFactory).not.toHaveBeenCalled();
  });
  it("preflights using only metadata and read-only queries, without needing a database password", async () => {
    const f = fixture();
    delete f.env.SUPABASE_DB_PASSWORD;
    const report = await f.run("preflight");
    expect(report).toMatchObject({
      status: "preflight_passed",
      remoteWritesMayHaveOccurred: false,
      freshApplicationCounts: cleanCounts,
    });
    expect(
      f.requests.every(
        (r) => r.method === "GET" || r.resource === "database/query/read-only",
      ),
    ).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.artifactFactory).not.toHaveBeenCalled();
  });
  it("installs the verified 188-migration artifact and 17 functions with sandbox checkout disabled", async () => {
    const f = fixture();
    const report = await f.run();
    expect(report).toMatchObject({
      status: "installed",
      remoteWritesMayHaveOccurred: true,
      migrationsApplied: true,
      publicSettingsConfigured: true,
      authConfigured: true,
      frontendDeployed: false,
      providerPaymentsVerified: false,
    });
    expect(f.state.freshReads).toBe(2);
    expect(report.deployedFunctions).toEqual(
      identity.functions.map((x: any) => x.name),
    );
    const mutations = f.commands.filter(
      (c) => c[0] === "db" && !c.includes("--dry-run"),
    );
    expect(mutations).toEqual([["db", "push", "--linked", "--yes"]]);
    expect(f.commands.find((c) => c[0] === "secrets")).toEqual([
      "secrets",
      "set",
      ...Object.entries(INITIAL_PUBLIC_SETTINGS).map(([k, v]) => `${k}=${v}`),
      "--project-ref",
      INSTALL_SCOPE.project,
    ]);
    for (const fn of identity.functions) {
      const command = f.commands.find(
        (c) => c[0] === "functions" && c[2] === fn.name,
      )!;
      expect(command.includes("--no-verify-jwt")).toBe(!fn.verifyJwt);
    }
    expect(JSON.stringify(report)).not.toContain(privateValue);
    expect(f.cleanup).toHaveBeenCalledOnce();
  }, 30_000);
  it.each([
    ["GITHUB_ACTIONS", "false"],
    ["GITHUB_EVENT_NAME", "push"],
    ["GITHUB_REPOSITORY", "someone/else"],
    ["GITHUB_REF", "refs/heads/main"],
    ["GITHUB_REF", "refs/heads/other-feature"],
    ["GITHUB_WORKFLOW", "other workflow"],
    ["GITHUB_WORKFLOW_REF", "other/ref"],
    ["STAGING_INSTALL_ENVIRONMENT", "supabase-production"],
    ["GITHUB_SHA", "b".repeat(40)],
    ["CONFIRM_COMMIT_SHA", "b".repeat(40)],
    ["CONFIRM_PROJECT_REF", "btrfmxjpjzbyowtvncnc"],
    ["STAGING_SUPABASE_PROJECT_REF", "dgogugyuyfourdttvwuy"],
    ["CONFIRM_APP_ORIGIN", "https://repsync-production.netlify.app"],
    ["STAGING_APPLICATION_ORIGIN", "https://unrelated.invalid"],
    ["SUPABASE_PROJECT_REF", "btrfmxjpjzbyowtvncnc"],
    ["ALLOW_REMOTE_SUPABASE", ""],
    ["SUPABASE_ACCESS_TOKEN", ""],
    ["SUPABASE_DB_PASSWORD", ""],
  ])(
    "rejects mismatched/missing %s before network or CLI access",
    async (key, value) => {
      const f = fixture();
      f.env[key] = value;
      expect(await f.run()).toMatchObject({
        status: "blocked",
        stage: "context",
        remoteWritesMayHaveOccurred: false,
      });
      expect(f.transport).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  it("rejects an uncommitted checkout before remote access", async () => {
    const f = fixture();
    f.source.clean = false;
    expect(await f.run()).toMatchObject({
      code: "INITIAL_COMMIT_CONFIRMATION_MISMATCH",
    });
    expect(f.transport).not.toHaveBeenCalled();
  });
  it.each(Object.keys(cleanCounts))(
    "blocks an existing %s before a CLI operation",
    async (key) => {
      const f = fixture();
      f.state.counts[key as keyof typeof cleanCounts] = 1;
      expect(await f.run()).toMatchObject({
        code: "INITIAL_PROJECT_NOT_EMPTY",
        remoteWritesMayHaveOccurred: false,
      });
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  it.each([
    null,
    [],
    [{}],
    [{ ...cleanCounts, auth_users: "0" }],
    [{ ...cleanCounts, public_relations: -1 }],
  ])("rejects incomplete count evidence", (rows) => {
    expect(() => validateFreshApplication(rows)).toThrow(
      "INITIAL_INVENTORY_INVALID",
    );
  });
  it("blocks already installed or partially applied histories without retrying migrations", async () => {
    const f = fixture();
    f.state.versions = [
      {
        version: identity.manifest.migrations.approved[0].filename.slice(0, 14),
      },
    ];
    expect(await f.run()).toMatchObject({
      code: "INITIAL_INSTALL_REQUIRES_UNINSTALLED_PROJECT",
    });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("blocks any existing deployed function, including functions outside billing", async () => {
    const f = fixture();
    f.state.functions = [
      { name: "unrelated-function", status: "ACTIVE", verify_jwt: true },
    ];
    expect(await f.run()).toMatchObject({
      code: "INITIAL_INSTALL_REQUIRES_UNINSTALLED_PROJECT",
    });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("blocks missing runtime keys and reports only the missing name", async () => {
    const f = fixture();
    f.state.secrets.delete("PADDLE_SANDBOX_PORTAL_API_KEY");
    expect(await f.run()).toMatchObject({
      code: "INITIAL_PADDLE_SETTINGS_MISSING",
      missingPrivatePaddleSettings: ["PADDLE_SANDBOX_PORTAL_API_KEY"],
    });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("blocks live Paddle configuration before CLI access", async () => {
    const f = fixture();
    f.state.secrets.add("PADDLE_LIVE_API_KEY");
    expect(await f.run()).toMatchObject({
      code: "INITIAL_LIVE_PADDLE_SETTINGS_PRESENT",
    });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("rejects a CLI version different from the validated version", async () => {
    const f = fixture();
    f.state.badVersion = true;
    expect(await f.run()).toMatchObject({
      code: "INITIAL_PINNED_CLI_REQUIRED",
      remoteWritesMayHaveOccurred: false,
    });
    expect(f.commands).toEqual([]);
    expect(f.cleanup).toHaveBeenCalledOnce();
  });
  it("rejects a dry run that differs from the entire canonical pending list", async () => {
    const f = fixture();
    f.state.badDryRun = true;
    expect(await f.run()).toMatchObject({
      code: "INITIAL_DRY_RUN_MISMATCH",
      remoteWritesMayHaveOccurred: false,
    });
    expect(f.commands).toHaveLength(2);
    expect(f.cleanup).toHaveBeenCalledOnce();
  });
  it("takes fresh evidence again after the dry run and blocks intervening customer creation", async () => {
    const f = fixture();
    f.state.driftOnSecondRead = true;
    expect(await f.run()).toMatchObject({
      code: "INITIAL_PROJECT_NOT_EMPTY",
      remoteWritesMayHaveOccurred: false,
    });
    expect(f.commands).toHaveLength(2);
    expect(f.cleanup).toHaveBeenCalledOnce();
  });
  it("rejects an inventory that took too long to establish", async () => {
    const f = fixture();
    expect(
      await f.run("preflight", {
        now: vi.fn().mockReturnValueOnce(1_000).mockReturnValue(61_000),
      }),
    ).toMatchObject({
      code: "INITIAL_OBSERVATION_TOO_OLD",
      remoteWritesMayHaveOccurred: false,
    });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("rechecks source after the last inventory before applying migrations", async () => {
    const f = fixture();
    const report = await f.run("apply", {
      readSource: () => ({
        ...f.source,
        clean: f.state.freshReads < 2,
      }),
    });
    expect(report).toMatchObject({
      code: "INITIAL_COMMIT_CONFIRMATION_MISMATCH",
      remoteWritesMayHaveOccurred: false,
    });
    expect(f.commands).toHaveLength(2);
  });
  it("reports an ambiguous migration failure without resetting, resuming or changing configuration", async () => {
    const f = fixture();
    f.state.commandFailure = "db push --linked --yes";
    const report = await f.run();
    expect(report).toMatchObject({
      status: "blocked",
      stage: "apply_migrations",
      code: "INITIAL_CLI_FAILED",
      remoteWritesMayHaveOccurred: true,
      retryAutomatically: false,
    });
    expect(f.commands).toHaveLength(3);
    expect(f.requests.some((r) => r.method === "PATCH")).toBe(false);
    expect(JSON.stringify(report)).not.toContain(privateValue);
    expect(f.cleanup).toHaveBeenCalledOnce();
  });
  it("refuses to deploy functions when installed billing gates are unexpectedly enabled", async () => {
    const f = fixture();
    f.state.policy.sales_enabled = true;
    expect(await f.run()).toMatchObject({
      stage: "verify_migrations",
      code: "INITIAL_MIGRATION_VERIFICATION_FAILED",
      remoteWritesMayHaveOccurred: true,
    });
    expect(f.commands).toHaveLength(3);
  });
  it("reports an Auth configuration failure without deploying functions or exposing its response", async () => {
    const f = fixture();
    const report = await f.run("apply", {
      transport: async (url: string, options: any) =>
        options.method === "PATCH"
          ? new Response(privateValue, { status: 403 })
          : f.transport(url, options),
    });
    expect(report).toMatchObject({
      stage: "configure_auth",
      code: "INITIAL_MANAGEMENT_REQUEST_FAILED",
      httpStatus: 403,
      migrationsApplied: true,
      authConfigured: false,
      deployedFunctions: [],
      retryAutomatically: false,
    });
    expect(JSON.stringify(report)).not.toContain(privateValue);
  }, 30_000);
  it("retains progress and halts after a function deployment failure", async () => {
    const f = fixture();
    f.state.commandFailure = `functions deploy ${identity.functions[2].name}`;
    const report = await f.run();
    expect(report).toMatchObject({
      status: "blocked",
      migrationsApplied: true,
      code: "INITIAL_CLI_FAILED",
      retryAutomatically: false,
      deployedFunctions: identity.functions.slice(0, 2).map((f: any) => f.name),
    });
    expect(JSON.stringify(report)).not.toContain(privateValue);
    expect(f.cleanup).toHaveBeenCalledOnce();
  }, 30_000);
  it("does not report installation success when gateway JWT verification differs", async () => {
    const f = fixture();
    f.state.badFunctionVerification = true;
    expect(await f.run()).toMatchObject({
      code: "INITIAL_FUNCTION_VERIFICATION_FAILED",
      remoteWritesMayHaveOccurred: true,
    });
  }, 30_000);
  it("rejects tampering of the generated migration artifact before CLI access", async () => {
    const f = fixture();
    const report = await f.run("apply", {
      artifactFactory: (root: string, i: any, stage: string, mode: string) => {
        const a = f.artifactFactory(root, i, stage, mode);
        writeFileSync(
          join(
            a.directory,
            "supabase/migrations",
            i.manifest.migrations.approved[0].filename,
          ),
          "-- altered migration",
        );
        return a;
      },
    });
    expect(report).toMatchObject({
      status: "blocked",
      stage: "prepare_artifacts",
      remoteWritesMayHaveOccurred: false,
    });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.cleanup).toHaveBeenCalledOnce();
  });
  it.each([false, true])(
    "retains sanitized deployment progress when cleanup fails (prior failure: %s)",
    async (priorFailure) => {
      const f = fixture();
      if (priorFailure) f.state.commandFailure = "db push --linked --yes";
      const report = await f.run("apply", {
        artifactFactory: (
          root: string,
          i: any,
          stage: string,
          mode: string,
        ) => {
          const artifact = f.artifactFactory(root, i, stage, mode);
          return {
            ...artifact,
            cleanup: () => {
              artifact.cleanup();
              throw new Error(privateValue);
            },
          };
        },
      });
      expect(report).toMatchObject({
        status: "blocked",
        remoteWritesMayHaveOccurred: true,
        artifactCleanupFailed: true,
        retryAutomatically: false,
        code: priorFailure
          ? "INITIAL_CLI_FAILED"
          : "INITIAL_ARTIFACT_CLEANUP_FAILED",
        stage: priorFailure ? "apply_migrations" : "artifact_cleanup",
      });
      expect(JSON.stringify(report)).not.toContain(privateValue);
    },
    30_000,
  );
  it.each([401, 403, 500])(
    "sanitizes HTTP %s without redirecting or retrying",
    async (status) => {
      const f = fixture();
      const transport = vi.fn(
        async () => new Response(privateValue, { status }),
      );
      const report = await f.run("preflight", { transport });
      expect(report).toMatchObject({
        code: "INITIAL_STATUS_INSPECTION_FAILED",
        httpStatus: status,
        remoteWritesMayHaveOccurred: false,
      });
      expect(transport).toHaveBeenCalledOnce();
      expect(JSON.stringify(report)).not.toContain(privateValue);
    },
  );
  it("sanitizes unexpected transport failures and never acquires CLI capability", async () => {
    const f = fixture();
    const transport = vi.fn(async () => {
      throw new Error(privateValue);
    });
    const report = await f.run("preflight", { transport });
    expect(report.status).toBe("blocked");
    expect(JSON.stringify(report)).not.toContain(privateValue);
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("requires both local quality gates before releasing staging credentials into the protected job", () => {
    const workflow = createRequire(import.meta.url)("js-yaml").load(
      readFileSync(".github/workflows/supabase-staging-bootstrap.yml", "utf8"),
    );
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toEqual({
      group: "supabase-staging-commercial",
      "cancel-in-progress": false,
    });
    for (const key of ["feature-quality", "feature-database"]) {
      expect(workflow.jobs[key].environment).toBeUndefined();
      expect(JSON.stringify(workflow.jobs[key])).not.toContain("secrets.");
      expect(workflow.jobs[key].if).toContain("refs/heads/Ahmed-billing");
    }
    const job = workflow.jobs["feature-install"];
    expect(job.environment).toBe("supabase-staging");
    expect(job.needs).toEqual(["feature-quality", "feature-database"]);
    expect(job.if).toContain("refs/heads/Ahmed-billing");
    expect(job.env.STAGING_SUPABASE_PROJECT_REF).toBe(INSTALL_SCOPE.project);
    const remote = job.steps.find((s: any) =>
      s.run?.includes("staging-initial-install.mjs"),
    );
    expect(remote.env.SUPABASE_ACCESS_TOKEN).toBe(
      "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
    );
    expect(JSON.stringify(job)).not.toContain("STAGING_FOUNDER_ACTION");
    expect(workflow.jobs.bootstrap.if).toBe("github.ref == 'refs/heads/main'");
    expect(workflow.jobs.bootstrap.env.STAGING_GOVERNANCE_MODE).toBe(
      "founder_owned_synthetic_staging_v1",
    );
  });
});
