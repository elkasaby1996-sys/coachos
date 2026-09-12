import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  createLemonSqueezyProvider,
  BillingError,
} from "../../supabase/functions/_shared/lemon-squeezy";
import {
  parseSubscriptionItem,
  subscriptionItemQuantityRequest,
} from "../../supabase/functions/_shared/billing-seat-item";
import {
  handleSeatQuantity,
  seatQuantityRequest,
} from "../../supabase/functions/_shared/billing-seat-quantity";
import type { BillingDependencies } from "../../supabase/functions/_shared/billing-handlers";
const item = (quantity = 2) => ({
  data: {
    type: "subscription-items",
    id: "91",
    attributes: {
      subscription_id: 92,
      price_id: 93,
      quantity,
      is_usage_based: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-09-12T00:00:00Z",
    },
  },
});
describe("coach-seat provider adapter", () => {
  it.each([
    ["immediate", true, false],
    ["period_end", false, true],
  ] as const)("uses exact %s PATCH", async (timing, invoice, disable) => {
    const transport = vi.fn(async () => new Response(JSON.stringify(item())));
    await createLemonSqueezyProvider("deterministic-test-key", transport)
      .updateSubscriptionItemQuantity!("91", 2, timing);
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][0]).toBe(
      "https://api.lemonsqueezy.com/v1/subscription-items/91",
    );
    const init = transport.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      data: {
        type: "subscription-items",
        id: "91",
        attributes: {
          quantity: 2,
          invoice_immediately: invoice,
          disable_prorations: disable,
        },
      },
    });
  });
  it("retrieves and strips provider fields", async () => {
    const value = item();
    Object.assign(value.data.attributes, { private: "not-returned" });
    const provider = createLemonSqueezyProvider(
      "fixture",
      vi.fn(async () => new Response(JSON.stringify(value))),
    );
    expect(await provider.retrieveSubscriptionItem!("91")).toEqual({
      item_id: "91",
      subscription_id: "92",
      price_id: "93",
      quantity: 2,
      is_usage_based: false,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-09-12T00:00:00.000Z",
    });
  });
  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid quantity %s before transport",
    (q) => {
      expect(() =>
        subscriptionItemQuantityRequest("91", q, "immediate"),
      ).toThrow("BILLING_SEAT_QUANTITY_TARGET_INVALID");
    },
  );
  it.each([
    "quantity",
    "is_usage_based",
    "price_id",
    "subscription_id",
    "created_at",
    "updated_at",
  ])("rejects malformed %s", (field) => {
    const value = item();
    (value.data.attributes as Record<string, unknown>)[field] = null;
    expect(() => parseSubscriptionItem(value, "91")).toThrow(
      "BILLING_SEAT_QUANTITY_MANUAL_REVIEW",
    );
  });
  it.each([422, 429, 500])(
    "classifies HTTP %s without leaking provider body",
    async (status) => {
      const provider = createLemonSqueezyProvider(
        "fixture",
        vi.fn(async () => new Response("sensitive provider data", { status })),
      );
      await expect(
        provider.updateSubscriptionItemQuantity!("91", 2, "immediate"),
      ).rejects.toMatchObject({
        code:
          status === 422
            ? "BILLING_SEAT_QUANTITY_PROVIDER_FAILED"
            : "BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS",
        ambiguous: status !== 422,
      });
    },
  );
  it("timeout is ambiguous and is never retried", async () => {
    const transport = vi.fn(async () => {
      throw new Error("private timeout");
    });
    await expect(
      createLemonSqueezyProvider("fixture", transport)
        .updateSubscriptionItemQuantity!("91", 2, "immediate"),
    ).rejects.toMatchObject({ ambiguous: true });
    expect(transport).toHaveBeenCalledOnce();
  });
  it("malformed successful mutation is ambiguous", async () => {
    await expect(
      createLemonSqueezyProvider(
        "fixture",
        vi.fn(async () => new Response("{}")),
      ).updateSubscriptionItemQuantity!("91", 2, "immediate"),
    ).rejects.toMatchObject({ ambiguous: true });
  });
});
describe("seat handler boundaries", () => {
  it.each([
    "quantity",
    "amount",
    "currency",
    "providerSubscriptionId",
    "billingAccountId",
    "mappingId",
    "priceId",
    "effectiveDate",
    "invoice_immediately",
  ])("rejects browser field %s", (field) => {
    expect(() =>
      seatQuantityRequest(
        { targetAdditionalSeats: 1, [field]: "forged" },
        "preview",
      ),
    ).toThrow();
  });
  it("preview accepts only target count", () =>
    expect(
      seatQuantityRequest({ targetAdditionalSeats: 1 }, "preview"),
    ).toEqual({ targetAdditionalSeats: 1 }));
  it("owner authorization precedes provider and database access", async () => {
    const deps = {
      authenticate: vi.fn(async () => null),
      serviceRpc: vi.fn(),
      config: vi.fn(),
    } as unknown as BillingDependencies;
    const response = await handleSeatQuantity(
      new Request("https://fixture.test", {
        method: "POST",
        headers: { authorization: "Bearer fixture" },
        body: "{}",
      }),
      deps,
      "refresh",
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: "BILLING_SEAT_QUANTITY_OWNER_REQUIRED",
    });
    expect(deps.serviceRpc).not.toHaveBeenCalled();
    expect(deps.config).not.toHaveBeenCalled();
  });
  it("safe errors never return arbitrary exception data", async () => {
    const deps = {
      authenticate: async () => {
        throw new BillingError("PRIVATE-USER-SECRET");
      },
      log: vi.fn(),
    } as unknown as BillingDependencies;
    const response = await handleSeatQuantity(
      new Request("https://fixture.test", {
        method: "POST",
        headers: { authorization: "Bearer fixture" },
        body: "{}",
      }),
      deps,
      "refresh",
    );
    expect(await response.text()).not.toContain("PRIVATE");
  });
  it.each([
    "src/lib/auth.tsx",
    "src/lib/auth-callback.ts",
    "src/components/common/theme-provider.tsx",
    "src/components/common/bootstrap-gate.tsx",
    "src/main.tsx",
    "src/routes/app.tsx",
  ])("does not load seat billing in %s", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(
      /seat-quantity|SeatQuantity|coach-seat-change/,
    );
  });
});
