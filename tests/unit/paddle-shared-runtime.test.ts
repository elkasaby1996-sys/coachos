import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertServer,
  readServerEnvironment,
  sandboxAuthorization,
} from "../../supabase/functions/_shared/paddle-catalogue/config";
import { PaddleCatalogueError } from "../../supabase/functions/_shared/paddle-catalogue/validation";
import { sandboxCheckoutAuthorization } from "../../supabase/functions/_shared/paddle-checkout/config";

function edgeRuntime(values: Record<string, string> = {}) {
  const get = vi.fn((name: string) => values[name]);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("Deno", {
    version: { deno: "supabase-edge-runtime" },
    serve: vi.fn(),
    env: { get },
  });
  return get;
}

const syntheticKey = () =>
  [
    "pdl_sdbx_apikey",
    randomBytes(13).toString("hex"),
    randomBytes(11).toString("hex"),
    "Tst",
  ].join("_");

afterEach(() => vi.unstubAllGlobals());

it("accepts Supabase Edge Runtime with a window global", () => {
  edgeRuntime();
  expect(() => assertServer()).not.toThrow();
});

it("preserves Node and its environment reader", () => {
  vi.stubGlobal("window", undefined);
  vi.stubGlobal("Deno", undefined);
  vi.stubEnv("PADDLE_RUNTIME_TEST_VALUE", "synthetic-node-value");
  try {
    expect(() => assertServer()).not.toThrow();
    expect(readServerEnvironment("PADDLE_RUNTIME_TEST_VALUE")).toBe(
      "synthetic-node-value",
    );
  } finally {
    vi.unstubAllEnvs();
  }
});

it("reads Edge Runtime environment through Deno", () => {
  const get = edgeRuntime({
    PADDLE_RUNTIME_TEST_VALUE: "synthetic-edge-value",
  });
  expect(readServerEnvironment("PADDLE_RUNTIME_TEST_VALUE")).toBe(
    "synthetic-edge-value",
  );
  expect(get).toHaveBeenCalledExactlyOnceWith("PADDLE_RUNTIME_TEST_VALUE");
});

it.each([0, 1, 2, 3, 4, 5, 6])(
  "rejects incomplete browser capability set %i even with Node globals",
  (mask) => {
    const get = vi.fn();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal(
      "Deno",
      mask === 0
        ? undefined
        : {
            ...(mask & 1 ? { version: { deno: "supabase-edge-runtime" } } : {}),
            ...(mask & 2 ? { serve: vi.fn() } : {}),
            ...(mask & 4 ? { env: { get } } : {}),
          },
    );
    expect(() => assertServer()).toThrow(PaddleCatalogueError);
    expect(() => readServerEnvironment("PRIVATE_TEST_VALUE")).toThrow(
      "Paddle catalogue: configuration",
    );
    expect(get).not.toHaveBeenCalled();
  },
);

it.each([
  { version: { deno: 1 }, serve: vi.fn(), env: { get: vi.fn() } },
  { version: { deno: "synthetic" }, serve: true, env: { get: vi.fn() } },
  { version: { deno: "synthetic" }, serve: vi.fn(), env: { get: true } },
])("rejects wrong capability types %#", (deno) => {
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("Deno", deno);
  expect(() => assertServer()).toThrow(PaddleCatalogueError);
});

it("accepts complete Deno capabilities without a Node runtime", () => {
  edgeRuntime();
  vi.stubGlobal("process", undefined);
  try {
    assertServer();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("rejects a non-server runtime without window", () => {
  vi.stubGlobal("window", undefined);
  vi.stubGlobal("Deno", {});
  vi.stubGlobal("process", undefined);
  let error: unknown;
  try {
    assertServer();
  } catch (caught) {
    error = caught;
  } finally {
    vi.unstubAllGlobals();
  }
  expect(error).toBeInstanceOf(PaddleCatalogueError);
});

describe.each([
  ["catalogue", "PADDLE_SANDBOX_API_KEY", sandboxAuthorization],
  ["checkout", "PADDLE_SANDBOX_CHECKOUT_API_KEY", sandboxCheckoutAuthorization],
] as const)(
  "%s credentials under Edge Runtime",
  (_name, keyName, authorize) => {
    it("accepts the dedicated synthetic sandbox credential", () => {
      const key = syntheticKey();
      edgeRuntime({ PADDLE_ENVIRONMENT: "sandbox", [keyName]: key });
      expect(authorize(readServerEnvironment)()).toBe(`Bearer ${key}`);
    });
    it.each([
      { PADDLE_ENVIRONMENT: undefined },
      { PADDLE_ENVIRONMENT: "live" },
      { PADDLE_ENVIRONMENT: "test" },
      { [keyName]: undefined },
      { [keyName]: "invalid" },
      { [keyName]: syntheticKey().replace("sdbx", "live") },
      { PADDLE_API_KEY: "forbidden" },
      { PADDLE_LIVE_API_KEY: "forbidden" },
      { PADDLE_API_BASE_URL: "https://api.paddle.com" },
      ...(keyName === "PADDLE_SANDBOX_CHECKOUT_API_KEY"
        ? [{ PADDLE_LIVE_CHECKOUT_API_KEY: "forbidden" }]
        : []),
    ])("still rejects invalid configuration %#", (override) => {
      edgeRuntime();
      const env: Record<string, string | undefined> = {
        PADDLE_ENVIRONMENT: "sandbox",
        [keyName]: syntheticKey(),
        ...override,
      };
      expect(() => authorize((name) => env[name])).toThrow("configuration");
    });
  },
);
