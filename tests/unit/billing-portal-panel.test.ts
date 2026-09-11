import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import type { BillingProviderSummary } from "../../src/features/billing/portal-contracts";
const mocks = vi.hoisted(() => ({ summary: {} as BillingProviderSummary }));
vi.mock("../../src/features/billing/use-customer-portal", () => ({
  useBillingProviderSummary: () => ({ data: mocks.summary, refetch: vi.fn() }),
  useCustomerPortalLinkMutation: () => ({ isPending: false }),
}));
import { CustomerPortalPanel } from "../../src/features/billing/customer-portal-panel";
function render(owner = true) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(CustomerPortalPanel, {
        owner,
        refresh: async () => null,
      }),
    ),
  );
}
describe("Billing portal presentation", () => {
  it.each(["active", "past_due", "grace", "expired", "cancellation", "review"])(
    "renders %s with appropriate actions",
    (state) => {
      mocks.summary = {
        linked: true,
        status: ["review", "cancellation"].includes(state)
          ? "active"
          : (state as BillingProviderSummary["status"]),
        cancelAtPeriodEnd: state === "cancellation",
        currentPeriodEndsAt: "2027-01-01T00:00:00Z",
        reconciliationStatus:
          state === "review" ? "manual_review" : "processed",
        errorCode: null,
        revision: "x",
        pending: false,
      };
      const html = render();
      expect(html).toContain("Manage billing");
      expect(html.includes("Update payment method")).toBe(
        ["past_due", "grace"].includes(state),
      );
      if (state === "cancellation")
        expect(html).toContain("Cancellation scheduled");
      if (state === "grace") expect(html).toContain("existing-delivery-only");
      if (state === "review") expect(html).toContain("manual review");
      if (state === "expired")
        expect(html).toContain("Start a new subscription");
      expect(html).not.toMatch(/<select|Upgrade|Downgrade|Pause|Buy seats/);
    },
  );
  it("hides all actions from nonowner", () => expect(render(false)).toBe(""));
});
