import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { BillingError } from "../../supabase/functions/_shared/billing-common";
import {
  handleSeatQuantity,
  seatQuantityRequest,
} from "../../supabase/functions/_shared/billing-seat-quantity";
import type { BillingDependencies } from "../../supabase/functions/_shared/billing-handlers";
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
      seatAction: vi.fn(),
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
    expect(deps.seatAction).not.toHaveBeenCalled();
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
