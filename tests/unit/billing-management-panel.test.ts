import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, it, expect, vi } from "vitest";
import type { AccountSubscriptionSummary } from "../../src/features/account-entitlements/contracts";
import type { PaymentMethodState } from "../../src/features/billing/payment-method-contracts";
import type { SeatQuantityState } from "../../src/features/billing/seat-quantity-contracts";
const mocks = vi.hoisted(() => ({
  subscription: {} as AccountSubscriptionSummary,
  state: {} as PaymentMethodState,
  seats: undefined as SeatQuantityState | undefined,
  seatError: false,
}));
vi.mock("../../src/features/billing/use-payment-method-update", () => ({
  usePaymentMethodState: () => ({ data: mocks.state, refetch: vi.fn() }),
  usePaymentMethodUpdateMutation: () => ({ isPending: false }),
  usePaymentMethodSeatState: () => ({
    data: mocks.seats,
    isError: mocks.seatError,
  }),
}));
import { BillingManagementPanel } from "../../src/features/billing/billing-management-panel";
function render(owner = true) {
  return renderToStaticMarkup(
    React.createElement(BillingManagementPanel, {
      owner,
      subscription: mocks.subscription,
      refresh: async () => null,
    }),
  );
}
beforeEach(() => {
  mocks.seats = undefined;
  mocks.seatError = false;
  mocks.subscription = {
    kind: "paid",
    effectiveStatus: "active",
    storedStatus: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEndsAt: "2027-01-01T00:00:00Z",
  } as AccountSubscriptionSummary;
  mocks.state = {
    available: true,
    status: "active",
    maySettleExistingBalance: false,
  };
});
describe("RepSync billing management", () => {
  it.each(["active", "past_due"] as const)(
    "eligible %s owner can update",
    (status) => {
      mocks.subscription.effectiveStatus = status;
      mocks.state = {
        available: true,
        status,
        maySettleExistingBalance: status === "past_due",
      };
      const html = render();
      expect(html).toContain("Update payment method");
      expect(html).not.toMatch(
        /<button[^>]*disabled=""[^>]*>Update payment method/,
      );
      expect(
        html.includes("may collect your existing outstanding balance"),
      ).toBe(status === "past_due");
      expect(html).not.toContain("Manage billing");
    },
  );
  it.each(["unavailable", "manual_review", "pending", "mismatched"])(
    "%s cannot activate",
    (reason) => {
      mocks.state = {
        available: false,
        reason: "not_available",
        maySettleExistingBalance: false,
      };
      const html = render();
      expect(html).toMatch(
        /<button[^>]*disabled=""[^>]*>Update payment method/,
      );
      expect(html).toContain("unavailable");
    },
  );
  it.each(["expired", "canceled"])("%s has no payment action", (status) => {
    mocks.subscription.effectiveStatus = status as "expired" | "canceled";
    mocks.state = {
      available: false,
      reason: "not_available",
      maySettleExistingBalance: false,
    };
    expect(render()).not.toContain("Update payment method");
  });
  it("scheduled cancellation states only verified access", () => {
    mocks.subscription.cancelAtPeriodEnd = true;
    const html = render();
    expect(html).toContain("Cancellation scheduled");
    expect(html).toContain("paid access continues");
    expect(html).not.toMatch(
      /Manage billing|resume|cancel cancellation|portal/,
    );
  });
  it("nonowner has no panel", () => expect(render(false)).toBe(""));
  it("explains a pending reduction without advertising eligibility or cancellation", () => {
    mocks.state = {
      available: false,
      reason: "not_available",
      maySettleExistingBalance: false,
    };
    mocks.seats = {
      provider: "paddle",
      available: false,
      summary: { currentAdditionalSeats: 1, manualReview: false },
      operation: {
        id: "synthetic",
        status: "scheduled",
        direction: "reduction",
        targetAdditionalSeats: 0,
        effectiveAt: "2026-12-10T22:23:38.061119Z",
        errorCode: null,
      },
    } as SeatQuantityState;
    const html = render();
    expect(html).toContain("RepSync pauses payment-method updates");
    expect(html).toContain('dateTime="2026-12-10T22:23:38.061119Z"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Update payment method/);
    expect(html).not.toContain("Cancel reduction");
    mocks.seatError = true;
    expect(render()).not.toContain("A seat reduction is scheduled");
    expect(render()).toContain("Payment-method update is unavailable");
    mocks.seatError = false;
    mocks.seats.operation!.status = "ambiguous";
    expect(render()).not.toContain("A seat reduction is scheduled");
    mocks.seats.operation!.status = "completed";
    expect(render()).not.toContain("A seat reduction is scheduled");
  });
});
