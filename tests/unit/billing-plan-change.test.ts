import { describe, expect, it, vi } from "vitest";
import {
  handlePlanChange,
  planChangeRequest,
} from "../../supabase/functions/_shared/billing-plan-change";
import type { BillingDependencies } from "../../supabase/functions/_shared/billing-handlers";
import {
  safePlanChangeError,
  planChangePreviewSchema,
} from "../../src/features/billing/plan-change-contracts";
const input = {
  targetPlanKey: "growth",
  targetCadence: "monthly",
  operationId: "a0700000-0000-4000-8000-000000000001",
};
describe("shared plan change boundary", () => {
  it.each([
    "subscriptionId",
    "amount",
    "currency",
    "invoice_immediately",
    "disable_prorations",
    "classification",
    "effectiveAt",
    "billingAccountId",
    "sourcePlan",
    "paymentProcessor",
  ])("rejects browser %s", (key) =>
    expect(() => planChangeRequest({ ...input, [key]: "forged" })).toThrow(
      "BILLING_INVALID_INPUT",
    ),
  );
  it("denies anonymous before database or provider construction", async () => {
    const serviceRpc = vi.fn(),
      planAction = vi.fn();
    const deps = {
      authenticate: async () => null,
      serviceRpc,
      planAction,
    } as unknown as BillingDependencies;
    const r = await handlePlanChange(
      new Request("http://local.invalid", {
        method: "POST",
        headers: { authorization: "Bearer synthetic" },
        body: JSON.stringify(input),
      }),
      deps,
      "apply",
    );
    expect(r.status).toBe(401);
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(planAction).not.toHaveBeenCalled();
  });
  it("safe frontend errors cannot render raw provider data", () =>
    expect(
      safePlanChangeError({ message: "secret", code: "raw" }).message,
    ).not.toContain("secret"));
  it("rejects provider identifiers in previews", () =>
    expect(
      planChangePreviewSchema.safeParse({ provider_subscription_id: "3" })
        .success,
    ).toBe(false));
});
