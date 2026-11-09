import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  inspectStagingBilling,
  STAGING_PROJECT,
  STATUS_QUERIES,
} from "../../scripts/staging-billing-status.mjs";
import {
  BILLING_FUNCTIONS,
  CONFIGURATION_CLASSES,
  JWT_CONTRACTS,
} from "../../scripts/billing-deployment-contract.mjs";

const manifest = JSON.parse(
  readFileSync("config/staging-commercial-certification.json", "utf8"),
);
const versions = manifest.migrations.approved.map(
  (m: { filename: string }) => ({ version: m.filename.slice(0, 14) }),
);
const env = {
  STAGING_SUPABASE_PROJECT_REF: STAGING_PROJECT,
  SUPABASE_ACCESS_TOKEN: "synthetic-private-management-token",
};
const privateValue = "synthetic-provider-secret-do-not-output";
function fixture() {
  const state = {
    schema: [{ has_migration_history: true, has_billing_policy: true }],
    versions: versions.slice(0, -2),
    policy: [
      {
        environment: "test",
        sales_enabled: false,
        reconciliation_enabled: false,
      },
    ],
    functions: BILLING_FUNCTIONS.map((name) => ({
      name,
      status: "ACTIVE",
      verify_jwt: JWT_CONTRACTS[name],
    })),
    secrets: CONFIGURATION_CLASSES.PADDLE_REQUIRED.filter((name) =>
      name.startsWith("PADDLE_"),
    ).map((name) => ({ name, value: privateValue, digest: privateValue })),
  };
  const transport = vi.fn(async (url: string, options: RequestInit) => {
    expect(url).toMatch(
      new RegExp(
        `^https://api\\.supabase\\.com/v1/projects/${STAGING_PROJECT}/`,
      ),
    );
    expect(options.redirect).toBe("error");
    expect(options.headers).toMatchObject({
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
    });
    if (url.endsWith("/database/query/read-only")) {
      expect(options.method).toBe("POST");
      const { query } = JSON.parse(options.body as string);
      expect(Object.values(STATUS_QUERIES)).toContain(query);
      expect(query).toMatch(/^select /);
      return Response.json(
        query === STATUS_QUERIES.schema
          ? state.schema
          : query === STATUS_QUERIES.migrations
            ? state.versions
            : state.policy,
      );
    }
    expect(options.method).toBe("GET");
    expect(options.body).toBeUndefined();
    if (url.endsWith("/functions")) return Response.json(state.functions);
    if (url.endsWith("/secrets")) return Response.json(state.secrets);
    throw new Error("Unexpected endpoint");
  });
  return {
    state,
    transport,
    run: () => inspectStagingBilling({ env, transport }),
  };
}

describe("read-only staging billing inventory", () => {
  it("identifies the pending billing migrations without claiming deployment or payment certification", async () => {
    const f = fixture();
    const result = await f.run();
    expect(result).toMatchObject({
      status: "inspected",
      project: STAGING_PROJECT,
      migrations: {
        appliedCount: 186,
        expectedCount: 188,
        matchesApprovedVersionPrefix: true,
        pending: manifest.migrations.approved
          .slice(-2)
          .map((m: { filename: string }) => m.filename),
        hashesAndSchemaVerified: false,
      },
      functions: {
        missing: [],
        inactive: [],
        jwtMismatch: [],
        deployedSourceVerified: false,
      },
      configuration: {
        missingServerSettings: [],
        valuesVerified: false,
        frontendConfigurationVerified: false,
      },
      providerPaymentsVerified: false,
      deploymentAuthorized: false,
      remoteChangesPerformed: false,
    });
    expect(f.transport).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(result)).not.toContain(privateValue);
    expect(JSON.stringify(result)).not.toContain(env.SUPABASE_ACCESS_TOKEN);
  });
  it.each([undefined, "", "btrfmxjpjzbyowtvncnc", "dgogugyuyfourdttvwuy"])(
    "rejects unconfirmed target %s before IO",
    async (project) => {
      const transport = vi.fn();
      expect(
        await inspectStagingBilling({
          env: { ...env, STAGING_SUPABASE_PROJECT_REF: project },
          transport,
        }),
      ).toMatchObject({ status: "blocked", code: "STAGING_PROJECT_MISMATCH" });
      expect(transport).not.toHaveBeenCalled();
    },
  );
  it("reports a missing GitHub token without opening a network connection", async () => {
    const transport = vi.fn();
    expect(
      await inspectStagingBilling({
        env: { STAGING_SUPABASE_PROJECT_REF: STAGING_PROJECT },
        transport,
      }),
    ).toMatchObject({ code: "SUPABASE_ACCESS_TOKEN_MISSING" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("handles a fresh schema without querying absent tables or declaring it safe to deploy", async () => {
    const f = fixture();
    f.state.schema = [
      { has_migration_history: false, has_billing_policy: false },
    ];
    expect(await f.run()).toMatchObject({
      migrations: { appliedCount: 0, expectedCount: 188 },
      billingPolicy: null,
      deploymentAuthorized: false,
    });
    expect(f.transport).toHaveBeenCalledTimes(3);
  });
  it("reports divergent migration history without inventing a pending suffix", async () => {
    const f = fixture();
    f.state.versions[0] = { version: "20000101000000" };
    expect(await f.run()).toMatchObject({
      migrations: { matchesApprovedVersionPrefix: false, pending: null },
    });
  });
  it("reports missing settings, inactive functions, JWT drift, and live configuration", async () => {
    const f = fixture();
    f.state.secrets = [
      {
        name: "PADDLE_LIVE_API_KEY",
        value: privateValue,
        digest: privateValue,
      },
    ];
    const missing = f.state.functions.pop()!.name;
    f.state.functions[0].status = "INACTIVE";
    f.state.functions[1].verify_jwt = !f.state.functions[1].verify_jwt;
    const result = await f.run();
    expect(result).toMatchObject({
      functions: {
        missing: [missing],
        inactive: [f.state.functions[0].name],
        jwtMismatch: [f.state.functions[1].name],
      },
      configuration: { livePaddleSettingCount: 1 },
    });
    expect(result.configuration.missingServerSettings).toContain(
      "PADDLE_SANDBOX_PORTAL_API_KEY",
    );
    expect(JSON.stringify(result)).not.toContain(privateValue);
  });
  it.each([302, 401, 403, 404, 429, 500])(
    "sanitizes HTTP %s and never retries against a writable endpoint",
    async (status) => {
      const transport = vi.fn(
        async () => new Response(privateValue, { status }),
      );
      const result = await inspectStagingBilling({ env, transport });
      expect(result).toEqual({
        status: "blocked",
        stage: "schema",
        code: "STAGING_READ_ONLY_REQUEST_FAILED",
        httpStatus: status,
        remoteChangesPerformed: false,
      });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["invalid JSON", "oversized", "invalid shape", "private error"])(
    "bounds and sanitizes %s",
    async (kind) => {
      const transport = vi.fn(async () => {
        if (kind === "private error") throw new Error(privateValue);
        if (kind === "invalid shape") return Response.json([{ privateValue }]);
        return new Response(
          kind === "oversized" ? "x".repeat(1024 * 1024 + 1) : privateValue,
          { headers: { "content-type": "application/json" } },
        );
      });
      const result = await inspectStagingBilling({ env, transport });
      expect(result.status).toBe("blocked");
      expect(JSON.stringify(result)).not.toContain(privateValue);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps credentials in the protected GitHub job and requires no database password or deployment command", () => {
    const workflow = readFileSync(
      ".github/workflows/supabase-migration-status.yml",
      "utf8",
    );
    expect(workflow).toContain("environment: supabase-staging");
    expect(workflow).toContain(
      "SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}",
    );
    expect(workflow).toContain(
      `STAGING_SUPABASE_PROJECT_REF: ${STAGING_PROJECT}`,
    );
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(
      /SUPABASE_DB_PASSWORD|--password|supabase (?:link|db push|functions deploy|secrets set)/,
    );
    expect(workflow).not.toContain("secrets.PADDLE_");
  });
});
