import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/features/billing/providers/active-provider", () => ({
  billingBrowserProvider: null,
}));
vi.mock("../../src/features/billing/use-billing-checkout", () => ({
  useBillingCheckout: () => ({
    state: { refetch: vi.fn() },
    create: { isPending: false },
  }),
}));

import { BillingCheckoutPanel } from "../../src/features/billing/checkout-panel";

describe("billing checkout with unsupported provider configuration", () => {
  it("shows an unavailable state and no purchase action", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(BillingCheckoutPanel, {
          owner: true,
          requestedPlan: "launch",
          subscription: { kind: "trial", effectiveStatus: "trialing" },
          refresh: async () => null,
        }),
      ),
    );
    expect(html).toContain("Subscription checkout is currently unavailable.");
    expect(html).not.toContain("Start subscription");
    expect(html).not.toContain("<select");
  });
});
