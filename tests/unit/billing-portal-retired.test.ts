import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { handleRetiredCustomerPortal } from "../../supabase/functions/_shared/billing-portal-retired";

describe("actual portal compatibility tombstone", () => {
  it.each([undefined, "Bearer synthetic-owner"])(
    "POST is inert regardless of auth %s",
    async (authorization) => {
      const network = vi.spyOn(globalThis, "fetch");
      try {
        for (let i = 0; i < 3; i++) {
          const response = handleRetiredCustomerPortal(
            new Request("https://local.test/portal", {
              method: "POST",
              headers: authorization ? { authorization } : {},
              body: JSON.stringify({
                purpose: "manage_billing",
                customer: "synthetic-customer",
              }),
            }),
          );
          expect(response.status).toBe(410);
          expect(await response.json()).toEqual({
            code: "BILLING_PORTAL_RETIRED",
          });
          expect(response.headers.get("cache-control")).toBe(
            "no-store, private",
          );
        }
        expect(network).not.toHaveBeenCalled();
      } finally {
        network.mockRestore();
      }
    },
  );
  it("entrypoint imports only the inert handler, with no service/auth/provider dependency", () => {
    const source = readFileSync(
      "supabase/functions/billing-create-customer-portal-link/index.ts",
      "utf8",
    );
    expect(source).toContain("Deno.serve(handleRetiredCustomerPortal)");
    expect(source).not.toMatch(
      /billing-runtime|billing-portal\.ts|billingDependencies/,
    );
    const handler = readFileSync(
      "supabase/functions/_shared/billing-portal-retired.ts",
      "utf8",
    );
    expect(handler).not.toMatch(
      /import |authenticate|serviceRpc|fetch\(|customerPortal|portalUrl/,
    );
  });
  it("OPTIONS keeps CORS and other methods are rejected", () => {
    const options = handleRetiredCustomerPortal(
      new Request("https://local.test", { method: "OPTIONS" }),
    );
    expect(options.status).toBe(200);
    expect(options.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS",
    );
    expect(
      handleRetiredCustomerPortal(new Request("https://local.test")).status,
    ).toBe(405);
  });
});
