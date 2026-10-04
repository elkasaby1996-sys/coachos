import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPlanChangeState,
  requestPlanChange,
} from "../../src/features/billing/plan-change-api";
import {
  fetchSeatQuantityState,
  requestSeatQuantity,
} from "../../src/features/billing/seat-quantity-api";
const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({
  supabase: { rpc, functions: { invoke } },
}));
beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
});
describe("browser provider authority fails closed", () => {
  it.each([undefined, null, "lemonsqueezy", "unknown", "Paddle", 1])(
    "discards non-Paddle state %j rather than exposing a legacy operation",
    async (provider) => {
      rpc.mockResolvedValue({
        error: null,
        data: {
          provider,
          linked: true,
          available: true,
          eligible: true,
          cadence: "monthly",
          summary: { privateLegacyField: "synthetic" },
          operation: { id: "synthetic-private-operation" },
          canCancel: true,
        },
      });
      expect(await fetchPlanChangeState()).toEqual({
        linked: false,
        eligible: false,
        cadence: null,
        operation: null,
      });
      expect(await fetchSeatQuantityState()).toEqual({
        available: false,
        canCancel: false,
        summary: null,
        operation: null,
      });
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        "get_my_billing_plan_change_state",
        "get_my_billing_seat_quantity_state",
      ]);
      expect(invoke).not.toHaveBeenCalled();
    },
  );
  for (const action of ["preview", "apply", "cancel", "refresh"] as const) {
    it.each([undefined, null, "lemonsqueezy", "unknown"])(
      `${action} cannot use missing or retired provider %j`,
      async (provider) => {
        await expect(
          requestPlanChange(action, {}, provider as never),
        ).rejects.toMatchObject({
          code: "BILLING_PLAN_CHANGE_NOT_ELIGIBLE",
        });
        await expect(
          requestSeatQuantity(action, {}, provider as never),
        ).rejects.toThrow(
          "Recover payment or resume your subscription before changing coach seats.",
        );
        expect(invoke).not.toHaveBeenCalled();
        expect(rpc).not.toHaveBeenCalled();
      },
    );
  }
  it("keeps the explicit Paddle state and seat dispatch contract", async () => {
    const plan = {
      provider: "paddle",
      linked: true,
      cadence: "monthly",
      eligible: true,
      operation: null,
    };
    rpc.mockResolvedValue({ data: plan, error: null });
    expect(await fetchPlanChangeState()).toEqual(plan);
    const seat = {
      provider: "paddle",
      available: false,
      canCancel: false,
      summary: null,
      operation: null,
    };
    rpc.mockResolvedValue({ data: seat, error: null });
    expect(await fetchSeatQuantityState()).toEqual(seat);
    invoke.mockResolvedValue({ data: seat, error: null });
    expect(await requestSeatQuantity("refresh", {}, "paddle")).toEqual(seat);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(
      "billing-refresh-coach-seat-change",
      { body: {} },
    );
  });
});
