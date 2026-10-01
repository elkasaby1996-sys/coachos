import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, it, expect, vi } from "vitest";
import type { BillingProviderSummary } from "../../src/features/billing/billing-management-contracts";
import type { PaymentMethodState } from "../../src/features/billing/payment-method-contracts";
const mocks = vi.hoisted(() => ({
  summary: {} as BillingProviderSummary,
  state: {} as PaymentMethodState,
}));
vi.mock("../../src/features/billing/use-payment-method-update", () => ({
  useBillingProviderSummary: () => ({ data: mocks.summary, refetch: vi.fn() }),
  usePaymentMethodState: () => ({ data: mocks.state, refetch: vi.fn() }),
  usePaymentMethodUpdateMutation: () => ({ isPending: false }),
}));
import { BillingManagementPanel } from "../../src/features/billing/billing-management-panel";
function render(owner = true) {
  return renderToStaticMarkup(
    React.createElement(BillingManagementPanel, {
      owner,
      refresh: async () => null,
    }),
  );
}
beforeEach(() => {
  mocks.summary = {
    linked: true,
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEndsAt: "2027-01-01T00:00:00Z",
    reconciliationStatus: "processed",
    errorCode: null,
    revision: "x",
    pending: false,
  };
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
      mocks.summary.status = status;
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
      if (reason === "unavailable")
        mocks.state = {
          available: false,
          reason: "not_available",
          maySettleExistingBalance: false,
        };
      if (reason === "manual_review")
        mocks.summary.reconciliationStatus = "manual_review";
      if (reason === "pending") mocks.summary.pending = true;
      if (reason === "mismatched") mocks.summary.status = "past_due";
      const html = render();
      expect(html).toMatch(
        /<button[^>]*disabled=""[^>]*>Update payment method/,
      );
      if (reason === "manual_review") expect(html).toContain("manual review");
    },
  );
  it.each(["expired", "canceled", "unlinked"])(
    "%s has no payment action",
    (status) => {
      if (status === "unlinked") mocks.summary.linked = false;
      else mocks.summary.status = status as "expired" | "canceled";
      expect(render()).not.toContain("Update payment method");
    },
  );
  it("scheduled cancellation states only verified access", () => {
    mocks.summary.cancelAtPeriodEnd = true;
    const html = render();
    expect(html).toContain("Cancellation scheduled");
    expect(html).toContain("paid access continues");
    expect(html).not.toMatch(
      /Manage billing|resume|cancel cancellation|portal/,
    );
  });
  it("nonowner has no panel", () => expect(render(false)).toBe(""));
});
