import { describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  METHOD_BEFORE_SHA,
  METHOD_AFTER_SHA,
  METHOD_SCHEMA_QUERY,
  methodFixtureQuery,
  methodReconcileQuery,
  validateMethodFixture,
  patchArtifact,
  runPaymentMethodPatch,
} from "../../scripts/staging-payment-method-patch.mjs";
import { BILLING_APPROVED_PATCH_MIGRATIONS as patches } from "../../scripts/billing-deployment-contract.mjs";
import {
  payloadFingerprint,
  verifyPaymentMethodAmendments,
  PAYMENT_METHOD_UI_AMENDMENT,
  PAYMENT_METHOD_SQL_AMENDMENT,
} from "../../scripts/staging-release-artifacts.mjs";

const owner = "00000000-0000-4000-8000-000000000101",
  original = "00000000-0000-4000-8000-000000000099";
const event = "00000000-0000-4000-8000-000000000102",
  sha = "a".repeat(40);
const approved = JSON.parse(
  readFileSync("config/staging-commercial-certification.json", "utf8"),
).migrations.approved;
const fixtureState = {
  accounts: 1,
  preparations: 1,
  events: 1,
  event_id: event,
  status: "ready",
  unresolved_operations: 0,
  unresolved_legacy_operations: 0,
  payments: 1,
  payment_fingerprint: "f".repeat(64),
  verified_completions: 0,
  bound_updates: 1,
};
function fixture() {
  const env = {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: "elkasaby1996-sys/coachos",
    GITHUB_REF: "refs/heads/Ahmed-billing",
    GITHUB_WORKFLOW: "Paddle Staging Readiness",
    GITHUB_WORKFLOW_REF:
      "elkasaby1996-sys/coachos/.github/workflows/paddle-staging-readiness.yml@refs/heads/Ahmed-billing",
    STAGING_PILOT_ENVIRONMENT: "supabase-staging",
    GITHUB_SHA: sha,
    CONFIRM_COMMIT_SHA: sha,
    STAGING_SUPABASE_PROJECT_REF: "dgogugyuyfourdttvwuy",
    SUPABASE_PROJECT_REF: "dgogugyuyfourdttvwuy",
    PADDLE_ENVIRONMENT: "sandbox",
    ALLOW_REMOTE_SUPABASE: "I_UNDERSTAND_THIS_TOUCHES_REMOTE",
    SUPABASE_ACCESS_TOKEN: "private-token",
    SUPABASE_DB_PASSWORD: "private-password",
    STAGING_FIXTURE_USER_ID: owner,
    STAGING_PILOT_USER_ID: original,
  };
  const source = {
    clean: true,
    commit: sha,
    identity: {
      manifest: { migrations: { approved } },
      functions: Array(17).fill({}),
      payload: { digest: "b".repeat(64) },
    },
  };
  const state = {
    applied: false,
    reconciled: false,
    drift: false,
    fail: "",
    historyDrift: false,
    sourceReads: 0,
    changeSourceAt: Infinity,
  };
  const effects: string[] = [];
  const readSource = () => {
    state.sourceReads++;
    return { ...source, clean: state.sourceReads < state.changeSourceAt };
  };
  const transport = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toMatch(
      /^https:\/\/api.supabase.com\/v1\/projects\/dgogugyuyfourdttvwuy\/database\/query(?:\/read-only)?$/,
    );
    expect(init.redirect).toBe("error");
    const query = JSON.parse(String(init.body)).query;
    if (!url.endsWith("read-only")) {
      effects.push("reconcile");
      expect(query).toBe(
        methodReconcileQuery(owner, original, "c".repeat(64), event),
      );
      if (state.fail === "reconcile")
        return new Response("private-token", { status: 503 });
      state.reconciled = true;
      return Response.json([]);
    }
    expect(query).not.toMatch(/\b(?:insert|update|delete|truncate)\s/i);
    if (query.includes("schema_migrations"))
      return Response.json(
        [...approved, ...(state.applied ? patches : [])]
          .map((m) => ({ version: m.filename.slice(0, 14) }))
          .concat(state.historyDrift ? [{ version: "20990101000000" }] : []),
      );
    if (query === METHOD_SCHEMA_QUERY)
      return Response.json([
        {
          definition_sha256: state.applied
            ? METHOD_AFTER_SHA
            : METHOD_BEFORE_SHA,
          prosecdef: true,
          proconfig: ["search_path=pg_catalog, public"],
          proacl: "{postgres=X/postgres,service_role=X/postgres}",
        },
      ]);
    if (query === methodFixtureQuery(owner))
      return Response.json([
        {
          ...fixtureState,
          ...(state.reconciled
            ? { status: "completed", verified_completions: 1 }
            : {}),
        },
      ]);
    return Response.json([
      {
        environment: "test",
        accounts: 1,
        users: 1,
        reductions: 1,
        fingerprint: (state.applied && state.drift ? "d" : "c").repeat(64),
      },
    ]);
  });
  const cli = vi.fn((args: string[], cwd: string) => {
    expect(cwd).not.toBe(process.cwd());
    effects.push(args.join(" "));
    if (state.fail && args.includes(state.fail))
      throw new Error("private-password");
    if (args.includes("--dry-run")) return patches[0].filename;
    if (args.includes("--yes")) state.applied = true;
    return "";
  });
  return { env, source, state, effects, transport, cli, readSource };
}
describe("reviewed zero-authorization staging patch", () => {
  it("applies exactly one canonical patch, verifies original and retained completion without financial writes", async () => {
    const f = fixture();
    const report = await runPaymentMethodPatch(f);
    expect(report).toMatchObject({
      status: "payment_method_completion_verified",
      originalPreserved: true,
      paymentMethodVerified: true,
      paymentRecoveryVerified: false,
      exactRetryReused: true,
    });
    expect(f.effects).toEqual([
      "link --project-ref dgogugyuyfourdttvwuy",
      "db push --linked --dry-run",
      "db push --linked --yes",
      "reconcile",
    ]);
    expect(JSON.stringify(report)).not.toMatch(/private-|00000000/);
  });
  it.each([
    "GITHUB_REF",
    "CONFIRM_COMMIT_SHA",
    "STAGING_PILOT_ENVIRONMENT",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_DB_PASSWORD",
  ])("blocks invalid %s before reads/writes", async (key) => {
    const f = fixture();
    (f.env as any)[key] = "";
    expect((await runPaymentMethodPatch(f)).status).toBe("blocked");
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.cli).not.toHaveBeenCalled();
  });
  it("rejects original owner reuse", async () => {
    const f = fixture();
    f.env.STAGING_FIXTURE_USER_ID = original;
    expect((await runPaymentMethodPatch(f)).status).toBe("blocked");
    expect(f.effects).toEqual([]);
  });
  it("rejects divergent or already-applied history without repair", async () => {
    const f = fixture();
    f.state.historyDrift = true;
    expect((await runPaymentMethodPatch(f)).code).toBe(
      "METHOD_PATCH_LEDGER_MISMATCH",
    );
    expect(f.effects).toEqual([]);
  });
  it("stops before reconciliation if original account changes", async () => {
    const f = fixture();
    f.state.drift = true;
    expect((await runPaymentMethodPatch(f)).code).toBe(
      "METHOD_PATCH_ORIGINAL_CHANGED",
    );
    expect(f.effects).not.toContain("reconcile");
  });
  it("refuses a ledger change between dry-run and apply", async () => {
    const f = fixture();
    const invoke = f.cli.getMockImplementation()!;
    f.cli.mockImplementation((args, cwd) => {
      const result = invoke(args, cwd);
      if (args.includes("--dry-run")) f.state.historyDrift = true;
      return result;
    });
    expect((await runPaymentMethodPatch(f)).code).toBe(
      "METHOD_PATCH_LEDGER_CHANGED",
    );
    expect(f.effects.some((effect) => effect.includes("--yes"))).toBe(false);
  });
  it.each(["--yes", "reconcile"])(
    "does not retry ambiguous %s writes",
    async (fail) => {
      const f = fixture();
      f.state.fail = fail;
      const result = await runPaymentMethodPatch(f);
      expect(result.status).toBe("blocked");
      expect(result.migrationMayHaveApplied).toBe(true);
      expect(f.effects.filter((e) => e.includes(fail))).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain("private-");
    },
  );
  it("rechecks source before each mutable boundary", async () => {
    const f = fixture();
    f.state.changeSourceAt = 4;
    expect((await runPaymentMethodPatch(f)).status).toBe("blocked");
    expect(f.effects.some((e) => e.includes("--yes"))).toBe(false);
  });
  it.each(["accounts", "preparations", "events", "bound_updates"])(
    "requires one exact %s",
    (key) => {
      expect(() =>
        validateMethodFixture({ ...fixtureState, [key]: 2 }),
      ).toThrow("METHOD_PATCH_FIXTURE_CONFLICT");
    },
  );
  it.each(["unresolved_operations", "unresolved_legacy_operations"])(
    "preserves %s guards",
    (key) => {
      expect(() =>
        validateMethodFixture({ ...fixtureState, [key]: 1 }),
      ).toThrow();
    },
  );
  it("requires processed server completion and unchanged financial count", () => {
    expect(() =>
      validateMethodFixture({ ...fixtureState, status: "completed" }, true),
    ).toThrow();
    expect(() =>
      validateMethodFixture({ ...fixtureState, payments: 2 }),
    ).toThrow();
  });
  it("binds separate canonical patch and UI hashes in the aggregate payload", () => {
    const p = payloadFingerprint();
    expect(p.amendments).toHaveLength(3);
    expect(p.amendments).toContainEqual({
      path: `supabase/migrations/${patches[0].filename}`,
      sha256: patches[0].sha256,
    });
    expect(() =>
      verifyPaymentMethodAmendments(
        process.cwd(),
        Object.keys(PAYMENT_METHOD_UI_AMENDMENT).sort(),
      ),
    ).toThrow("FROZEN_PAYLOAD_DRIFT");
    expect(Object.keys(PAYMENT_METHOD_SQL_AMENDMENT)).toHaveLength(1);
  });
  it("builds canonical 189-only artifact and rejects altered SQL or additional files", () => {
    const a = patchArtifact(process.cwd(), approved);
    try {
      expect(a.migrations).toHaveLength(189);
      a.verify();
      writeFileSync(
        join(a.directory, "supabase/migrations", patches[0].filename),
        "select 1;",
      );
      expect(a.verify).toThrow("METHOD_PATCH_ARTIFACT_DRIFT");
      writeFileSync(
        join(a.directory, "supabase/migrations", patches[0].filename),
        readFileSync(join("supabase/migrations", patches[0].filename)),
      );
      a.verify();
      writeFileSync(
        join(a.directory, "supabase/migrations/20990101000000_unreviewed.sql"),
        "select 1;",
      );
      expect(a.verify).toThrow("METHOD_PATCH_ARTIFACT_DRIFT");
    } finally {
      a.cleanup();
    }
  });
  it("rejects artifact symlinks even with matching contents", () => {
    const a = patchArtifact(process.cwd(), approved);
    try {
      const path = join(
        a.directory,
        "supabase/migrations",
        patches[0].filename,
      );
      rmSync(path);
      symlinkSync(
        join(process.cwd(), "supabase/migrations", patches[0].filename),
        path,
      );
      expect(a.verify).toThrow("RELEASE_SYMLINK_REJECTED");
    } finally {
      a.cleanup();
    }
  });
  it("retains staging environment review and database validation before the patch", () => {
    const workflow = readFileSync(
      ".github/workflows/paddle-staging-readiness.yml",
      "utf8",
    ).split("  payment-method-patch:")[1];
    expect(workflow).toContain("environment: supabase-staging");
    expect(workflow).toContain(
      "needs: [validate, payment-method-database-validation]",
    );
    expect(workflow).toContain(
      "inputs.mode == 'repair_payment_method_completion'",
    );
    expect(workflow).not.toContain("PADDLE_SANDBOX_API_KEY");
  });
});
