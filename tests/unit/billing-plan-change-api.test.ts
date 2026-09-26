import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestPlanChange } from "../../src/features/billing/plan-change-api";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({
  supabase: { functions: { invoke } },
}));
const input = {
  targetPlanKey: "scale",
  targetCadence: "monthly",
  operationId: "a0700000-0000-4000-8000-000000000001",
};
const preview = {
  provider: "paddle",
  sourcePlanKey: "growth",
  sourceCadence: "monthly",
  targetPlanKey: "scale",
  targetCadence: "monthly",
  changeKind: "tier_upgrade",
  effectiveTiming: "immediate",
  prorationMode: "invoice_immediately",
  currentPriceMinor: 3900,
  targetPriceMinor: 6900,
  currency: "USD",
  effectiveAt: null,
  dataQualityIssue: false,
  blockers: [],
};
const quote = { action: "charge", amountMinor: 2700, currencyCode: "USD" };
beforeEach(() => invoke.mockReset());
describe("Paddle preview contract negotiation client", () => {
  it("requests v2 without mutating the apply input or allowing an override", async () => {
    invoke.mockResolvedValue({ data: { ...preview, quote }, error: null });
    const body = { ...input, previewContractVersion: 1 };
    await expect(requestPlanChange("preview", body, "paddle")).resolves.toEqual(
      { ...preview, quote },
    );
    expect(invoke).toHaveBeenCalledExactlyOnceWith(
      "billing-preview-plan-change",
      {
        body: { ...input, previewContractVersion: 2 },
      },
    );
    expect(body.previewContractVersion).toBe(1);
  });
  it("preserves the non-Paddle preview request and response", async () => {
    const { provider: _provider, ...legacy } = preview;
    invoke.mockResolvedValue({ data: legacy, error: null });
    await expect(requestPlanChange("preview", input)).resolves.toEqual(legacy);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(
      "billing-preview-plan-change",
      { body: input },
    );
  });
  it.each(["apply", "cancel", "refresh"] as const)(
    "does not version %s",
    async (action) => {
      const state = {
        linked: true,
        cadence: "monthly",
        eligible: true,
        operation: null,
      };
      invoke.mockResolvedValue({ data: state, error: null });
      const body =
        action === "apply"
          ? input
          : action === "cancel"
            ? { operationId: input.operationId }
            : {};
      await requestPlanChange(action, body, "paddle");
      expect(invoke.mock.calls[0][1]).toEqual({ body });
      expect(invoke).toHaveBeenCalledOnce();
    },
  );
  it.each([
    undefined,
    null,
    {},
    { ...quote, amountMinor: 0 },
    { ...quote, amountMinor: -1 },
    { ...quote, amountMinor: 0.5 },
    { ...quote, amountMinor: Number.MAX_SAFE_INTEGER + 1 },
    { ...quote, currencyCode: "EUR" },
    { ...quote, action: "credit" },
    { ...quote, privateField: "unexpected" },
  ])(
    "rejects missing or malformed v2 quote without retry: %j",
    async (value) => {
      invoke.mockResolvedValue({
        data: { ...preview, ...(value === undefined ? {} : { quote: value }) },
        error: null,
      });
      await expect(
        requestPlanChange("preview", input, "paddle"),
      ).rejects.toMatchObject({ code: "BILLING_PLAN_CHANGE_PROVIDER_FAILED" });
      expect(invoke).toHaveBeenCalledExactlyOnceWith(
        "billing-preview-plan-change",
        { body: { ...input, previewContractVersion: 2 } },
      );
    },
  );
  it("never retries a v15 or unsupported-version error as legacy", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        context: { json: async () => ({ code: "BILLING_INVALID_INPUT" }) },
      },
    });
    await expect(
      requestPlanChange("preview", input, "paddle"),
    ).rejects.toThrow();
    expect(invoke).toHaveBeenCalledOnce();
  });
});
