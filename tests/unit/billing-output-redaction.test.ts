import { describe, expect, it, vi, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redactBillingPrivateValues as redact } from "../../src/lib/redact-billing-private-values";
import {
  createBillingOperatorOutput,
  emitBillingSnapshot,
} from "../../scripts/billing-operator-output.mjs";
import {
  canaries,
  fields,
  fixture,
  identity,
  projectFields,
  projectReferences,
  projectSemanticCanaries,
  projectUrls,
  references,
  semanticCanaries,
} from "../fixtures/billing-output-canaries.mjs";

function noLeaks(value: unknown) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const canary of canaries)
    expect(serialized.includes(canary), "private canary survived output").toBe(
      false,
    );
}
describe("billing output policy", () => {
  it.each(references)(
    "redacts bare synthetic provider shape %s",
    (reference) => {
      expect(redact(reference)).toBe("[redacted provider reference]");
    },
  );
  it.each(fields)("protects semantic field %s", (key) => {
    const value = { [key]: semanticCanaries[fields.indexOf(key)] };
    noLeaks(redact(value));
    noLeaks(redact(JSON.stringify(value)));
    noLeaks(
      redact(`Diagnostic ${key}="${semanticCanaries[fields.indexOf(key)]}"`),
    );
  });
  it.each(projectReferences)(
    "redacts bare synthetic project reference %s",
    (projectReference) => {
      expect(redact(projectReference)).toBe("[redacted project identifier]");
    },
  );
  it.each(projectFields)("protects project field %s", (key) => {
    const value = {
      [key]: projectSemanticCanaries[projectFields.indexOf(key)],
    };
    noLeaks(redact(value));
    noLeaks(redact(JSON.stringify(value)));
    noLeaks(
      redact(
        `CLI row ${key}=${projectSemanticCanaries[projectFields.indexOf(key)]}`,
      ),
    );
  });
  it.each(projectUrls)("redacts private project URL %s", (url) => {
    expect(redact(url)).toBe("[redacted project identifier]");
  });
  it("recurses through keys, arrays, Error causes and serialized diagnostics without mutation", () => {
    const value = fixture();
    const before = JSON.stringify(value);
    const clean = redact(value);
    noLeaks(clean);
    expect(JSON.stringify(value)).toBe(before);
    expect(redact(clean)).toEqual(clean);
    expect(clean.state).toBe("processed");
    noLeaks(redact(JSON.stringify(value)));
  });
  it("retains ordinary text and public URLs", () => {
    const value = {
      message: "Growth Monthly: 50 clients, 2 seats",
      url: "https://example.test/help",
      publicSupabaseUrl: "https://supabase.com/docs",
      products: "Supabase Paddle staging",
      amount: 42,
    };
    expect(redact(value)).toEqual(value);
  });
  it("does not execute custom serialization and covers encoded references", () => {
    const toJSON = vi.fn(() => references[0]);
    noLeaks(redact({ nested: { toJSON } }));
    expect(toJSON).not.toHaveBeenCalled();
    expect(redact(references[0].replace(/_/g, "%5F"))).toBe(
      "[redacted provider reference]",
    );
  });
  it("fails closed for unreadable diagnostic objects", () => {
    const output = createBillingOperatorOutput();
    const value = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error(references[0]);
        },
      },
    );
    expect(output.serialize(value)).toBe("[output omitted: redaction failed]");
  });
  it("handles cycles, getters, private object keys and repeated identities", () => {
    const value: Record<string, unknown> = { [identity]: references[0] };
    value.self = value;
    Object.defineProperty(value, "danger", {
      enumerable: true,
      get() {
        throw new Error("must not execute");
      },
    });
    noLeaks(redact(value));
    expect(redact(value).self).toBe("[circular]");
  });
  it("redacts signatures idempotently", () => {
    const once = redact("signature=SYNTHETIC_SIGNATURE_NOT_REAL");
    noLeaks(once);
    expect(redact(once)).toBe(once);
  });
  it("allocates stable session-local aliases unrelated to source bytes", () => {
    const output = createBillingOperatorOutput();
    expect(output.alias("CHECKOUT", references[0])).toBe("CHECKOUT-A");
    expect(output.alias("CHECKOUT", references[0])).toBe("CHECKOUT-A");
    expect(output.alias("CHECKOUT", references[1])).toBe("CHECKOUT-B");
    expect(output.alias("TX", references[2])).toBe("TX-A");
    expect(createBillingOperatorOutput().alias("CHECKOUT", references[1])).toBe(
      "CHECKOUT-A",
    );
  });
  it("suppresses raw browser output and sanitizes before emitting", async () => {
    const getAXState = vi.fn().mockResolvedValue(references[0]);
    const emit = vi.fn();
    await emitBillingSnapshot({ getAXState }, emit);
    expect(getAXState).toHaveBeenCalledWith({ emit: false });
    noLeaks(emit.mock.calls);
  });
  it("captures real process stdout, stderr and generated reports with zero canary matches", () => {
    const directory = mkdtempSync(join(tmpdir(), "billing-output-synthetic-"));
    try {
      // stderr is independently captured by spawnSync below; no shell interpolation.
      const result = spawnSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "scripts/test-billing-output.mjs",
          directory,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      expect(result.status).toBe(0);
      noLeaks(result.stdout);
      noLeaks(result.stderr);
      for (const file of readdirSync(directory))
        noLeaks(readFileSync(join(directory, file), "utf8"));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

vi.mock("@sentry/react", () => ({
  init: vi.fn(),
  reactRouterV7BrowserTracingIntegration: vi.fn(),
  replayIntegration: vi.fn(),
  consoleLoggingIntegration: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("actual Sentry callbacks remove all canaries without sending telemetry", async () => {
  vi.stubEnv("VITE_SENTRY_DSN", "https://synthetic.example.test");
  const Sentry = await import("@sentry/react");
  const { initSentry } = await import("../../src/lib/sentry");
  initSentry();
  const config = vi.mocked(Sentry.init).mock.calls[0]![0]!;
  for (const name of [
    "beforeBreadcrumb",
    "beforeSend",
    "beforeSendLog",
    "beforeSendTransaction",
  ] as const) {
    const callback = config[name] as (value: unknown) => unknown;
    noLeaks(callback(fixture()));
  }
});
