import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleDisabledLegacyCheckout } from "../../supabase/functions/_shared/billing-disabled-checkout";
import { handlePlanChange } from "../../supabase/functions/_shared/billing-plan-change";
import { handleSeatQuantity } from "../../supabase/functions/_shared/billing-seat-quantity";
import { createBillingRuntimeDependencies } from "../../supabase/functions/_shared/billing-runtime-dependencies";
import type { BillingDependencies } from "../../supabase/functions/_shared/billing-handlers";

afterEach(() => vi.unstubAllGlobals());
const id = "a0700000-0000-4000-8000-000000000001";

function graph(entry: string, visited = new Set<string>()): Set<string> {
  const path = resolve(entry);
  if (visited.has(path)) return visited;
  visited.add(path);
  const source = readFileSync(path, "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const walk = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) &&
      node.text.startsWith(".") &&
      (ts.isImportDeclaration(node.parent) ||
        ts.isExportDeclaration(node.parent) ||
        (ts.isCallExpression(node.parent) &&
          node.parent.expression.kind === ts.SyntaxKind.ImportKeyword) ||
        ts.isExternalModuleReference(node.parent))
    ) {
      graph(resolve(dirname(path), node.text), visited);
    }
    ts.forEachChild(node, walk);
  };
  walk(ast);
  return visited;
}

describe("actual retired checkout/webhook endpoints", () => {
  const entries = [
    "../../supabase/functions/billing-create-lemon-squeezy-checkout/index",
    "../../supabase/functions/billing-lemon-squeezy-webhook/index",
  ];
  it.each(entries)("serves a static retirement from %s", async (entry) => {
    const serve = vi.fn(),
      environment = vi.fn(() => {
        throw Error("Secret read");
      });
    const network = vi.fn(() => {
      throw Error("Network dispatch");
    });
    vi.stubGlobal("Deno", { serve, env: { get: environment } });
    vi.stubGlobal("fetch", network);
    vi.resetModules();
    await import(entry);
    expect(serve).toHaveBeenCalledOnce();
    const handler = serve.mock.calls[0]![0] as (request: Request) => Response;
    const body = vi.fn(() => {
      throw Error("Body processing");
    });
    const request = {
      method: "POST",
      json: body,
      text: body,
      arrayBuffer: body,
      get headers() {
        throw Error("Signature/auth access");
      },
      get body() {
        throw Error("Payload access");
      },
    } as unknown as Request;
    const response = handler(request);
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      code: "BILLING_PROVIDER_RETIRED",
      message: "This billing provider has been permanently retired.",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("location")).toBe(false);
    expect(body).not.toHaveBeenCalled();
    expect(environment).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });
  it.each(["GET", "HEAD", "PUT", "DELETE", "PATCH"])("rejects %s", (method) => {
    expect(
      handleDisabledLegacyCheckout(
        new Request("http://local.invalid", { method }),
      ).status,
    ).toBe(405);
  });
  it("keeps OPTIONS inert", () => {
    const response = handleDisabledLegacyCheckout(
      new Request("http://local.invalid", { method: "OPTIONS" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS",
    );
  });
  it("has only static leaves in all three tombstone import graphs", () => {
    for (const [entry, leaf] of [
      ["billing-create-lemon-squeezy-checkout", "billing-disabled-checkout.ts"],
      ["billing-lemon-squeezy-webhook", "billing-disabled-checkout.ts"],
      ["billing-create-customer-portal-link", "billing-portal-retired.ts"],
    ])
      expect([...graph(`supabase/functions/${entry}/index.ts`)].sort()).toEqual(
        [
          resolve(`supabase/functions/${entry}/index.ts`),
          resolve(`supabase/functions/_shared/${leaf}`),
        ].sort(),
      );
  });
});

describe("Paddle-only routing before any provider construction", () => {
  for (const kind of ["plan", "seat"] as const) {
    const handle = kind === "plan" ? handlePlanChange : handleSeatQuantity;
    const code =
      kind === "plan" ? "BILLING_PLAN_CHANGE" : "BILLING_SEAT_QUANTITY";
    for (const action of ["preview", "apply", "cancel", "refresh"] as const) {
      const input =
        action === "refresh"
          ? {}
          : action === "cancel"
            ? { operationId: id }
            : kind === "plan"
              ? {
                  operationId: id,
                  targetPlanKey: "growth",
                  targetCadence: "monthly",
                }
              : {
                  targetAdditionalSeats: 1,
                  ...(action === "apply" ? { operationId: id } : {}),
                };
      it.each([false, null, undefined, {}, "unknown", "lemonsqueezy", 1])(
        `${kind} ${action} rejects non-positive route %j`,
        async (route) => {
          const serviceRpc = vi.fn(async () => route);
          const planAction = vi.fn(),
            seatAction = vi.fn(),
            owner = vi.fn();
          const deps = {
            authenticate: async () => ({ id }),
            serviceRpc,
            providerAvailable: (provider) => provider === "paddle",
            planAction,
            seatAction,
            ownerRpc: () => owner,
          } satisfies BillingDependencies;
          const response = await handle(
            new Request("http://local.invalid", {
              method: "POST",
              headers: { authorization: "Bearer synthetic" },
              body: JSON.stringify(input),
            }),
            deps,
            action,
          );
          expect(response.status).toBe(route === null ? 409 : 503);
          expect(await response.json()).toEqual({
            code: `${code}_${route === null ? "NOT_ELIGIBLE" : "PROVIDER_FAILED"}`,
          });
          expect(serviceRpc).toHaveBeenCalledExactlyOnceWith(
            "billing_workflow_provider_v1",
            { p_owner: id },
          );
          expect(planAction).not.toHaveBeenCalled();
          expect(seatAction).not.toHaveBeenCalled();
          expect(owner).not.toHaveBeenCalled();
        },
      );
    }
    it(`${kind} cannot fall back when its Paddle transport is absent`, async () => {
      const serviceRpc = vi.fn(async () => "paddle");
      const deps = {
        authenticate: async () => ({ id }),
        serviceRpc,
      } as unknown as BillingDependencies;
      const response = await handle(
        new Request("http://local.invalid", {
          method: "POST",
          headers: { authorization: "Bearer synthetic" },
          body: "{}",
        }),
        deps,
        "refresh",
      );
      expect(response.status).toBe(503);
      expect(serviceRpc).toHaveBeenCalledOnce();
    });
  }
});

describe("runtime composition without retired configuration", () => {
  it("constructs shared/Paddle dependencies with no LS configuration or IO", async () => {
    const env = vi.fn((name: string) => {
      const values: Record<string, string> = {
        SUPABASE_URL: "https://platform.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "synthetic",
        PADDLE_ENVIRONMENT: "sandbox",
        PADDLE_SANDBOX_API_KEY: "pdl_sdbx_synthetic",
        PADDLE_SANDBOX_PAYMENT_METHOD_API_KEY: "pdl_sdbx_synthetic",
      };
      if (
        /LEMON|BILLING_PROVIDER_ENVIRONMENT|BILLING_APP_BASE_URL|BILLING_PORTAL/.test(
          name,
        )
      )
        throw Error("Retired configuration read");
      return values[name] ?? "";
    });
    const client = vi.fn(() => ({}));
    const network = vi.fn(() => {
      throw Error("Network dispatch");
    });
    const deps = createBillingRuntimeDependencies(
      client as never,
      env,
      network,
    );
    expect(client).toHaveBeenCalledOnce();
    expect(deps).not.toHaveProperty("config");
    expect(deps.planAction).toBeTypeOf("function");
    expect(deps.seatAction).toBeTypeOf("function");
    await expect(
      deps.planAction!("paddle", id, "synthetic", "cancel", {}),
    ).rejects.toThrow("BILLING_PLAN_CHANGE_CANNOT_CANCEL");
    await expect(
      deps.seatAction!("paddle", id, "synthetic", "cancel", {}),
    ).rejects.toThrow("BILLING_SEAT_QUANTITY_CANNOT_CANCEL");
    expect(deps.paymentMethodTransport!("paddle", "test")).toHaveProperty(
      "prepare",
    );
    expect(() => deps.paymentMethodTransport!("lemonsqueezy", "test")).toThrow(
      "BILLING_PROVIDER_NOT_CONFIGURED",
    );
    expect(network).not.toHaveBeenCalled();
  });
  it("all deployed-source graphs exclude LS executable modules and secrets", () => {
    const entries = readdirSync("supabase/functions", {
      withFileTypes: true,
    }).filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== "_shared" &&
        existsSync(`supabase/functions/${entry.name}/index.ts`),
    );
    expect(entries.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        "billing-create-paddle-checkout",
        "billing-lemon-squeezy-webhook",
        "billing-create-lemon-squeezy-checkout",
        "billing-create-customer-portal-link",
      ]),
    );
    for (const entry of entries) {
      for (const path of graph(`supabase/functions/${entry.name}/index.ts`)) {
        const source = readFileSync(path, "utf8");
        expect(source, path).not.toMatch(
          /createLemonSqueezy|handleBillingWebhook|api\.lemonsqueezy\.com|LEMONSQUEEZY_API_KEY|LEMONSQUEEZY_WEBHOOK_SECRET/,
        );
      }
    }
  });
});
