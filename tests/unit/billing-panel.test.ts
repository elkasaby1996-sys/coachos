import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
vi.mock("../../src/features/billing/use-billing-checkout", () => ({
  useBillingCheckout: () => ({
    state: { refetch: vi.fn() },
    create: { isPending: false },
  }),
}));
import { BillingCheckoutPanel } from "../../src/features/billing/checkout-panel";
function render(owner: boolean, kind = "trial") {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(BillingCheckoutPanel, {
        owner,
        requestedPlan: "launch",
        subscription: {
          kind,
          effectiveStatus: kind === "paid" ? "active" : "trialing",
        },
        refresh: async () => null,
      }),
    ),
  );
}
describe("Billing permission and subscription panel", () => {
  it("team member has no initiation action", () => {
    expect(render(false)).not.toContain("<button");
    expect(render(false)).toContain("Only the account owner");
  });
  it("owner sees price, tax and immediate conversion disclosure", () => {
    const html = render(true);
    expect(html).toContain("Start subscription");
    expect(html).toContain("Paid plan starts immediately");
    expect(html).toContain("Applicable taxes");
  });
  it("paid account cannot start a second checkout or change its plan", () => {
    const html = render(true, "paid");
    expect(html).toContain("Paid subscription confirmed");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<select");
  });
});
