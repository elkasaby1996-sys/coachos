import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CapacityMeters } from "../../src/features/account-capacity/capacity-meters";
import { dimension, snapshot } from "./account-capacity-fixtures";
const mocks = vi.hoisted(() => ({
  capacity: {
    data: undefined,
    isLoading: false,
    error: new Error("offline"),
    refetch: vi.fn(),
  },
}));
vi.mock("../../src/features/account-capacity", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useMyAccountCapacitySnapshot: () => mocks.capacity,
}));
vi.mock("../../src/features/account-entitlements", () => ({
  useMyEffectiveAccountEntitlements: () => ({
    data: {
      subscription: {
        kind: "complimentary",
        accessLabel: "Complimentary beta access",
        effectiveStatus: "active",
      },
      billingAccount: { requestedPaidPlanKey: "growth" },
    },
  }),
  AccountEntitlementError: class extends Error {},
}));
vi.mock("../../src/features/pt-hub/lib/pt-hub", () => ({
  usePtHubPayments: () => ({ data: { invoices: [] } }),
}));
import { PtHubSettingsBillingTab } from "../../src/pages/pt-hub/settings/tabs/billing";
describe("Billing capacity", () => {
  it("renders all dimensions with finite numeric usage and no controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(CapacityMeters, { snapshot: snapshot() }),
    );
    for (const label of [
      "Clients",
      "Coach seats",
      "Workspaces",
      "Published packages",
    ])
      expect(html).toContain(label);
    expect(html).toContain("1 current client of 10");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("disabled");
  });
  it.each([
    [8, "Approaching limit"],
    [10, "At limit"],
    [11, "Over limit"],
  ] as const)("renders state for %s current clients", (n, label) => {
    const s = snapshot();
    s.dimensions[0] = dimension("counted_clients", n);
    const html = renderToStaticMarkup(
      React.createElement(CapacityMeters, { snapshot: s }),
    );
    expect(html).toContain(label);
    if (n > 10)
      expect(html).toContain(
        "Current usage is above the standard Scale allowance. Complimentary beta access is unchanged.",
      );
  });
  it("shows unlimited and unavailable without fake bars", () => {
    const s = snapshot();
    s.dimensions = s.dimensions.map((d) => dimension(d.key, 1, null));
    const html = renderToStaticMarkup(
      React.createElement(CapacityMeters, { snapshot: s }),
    );
    expect(html).toContain("Unlimited");
    expect(html).not.toContain("progressbar");
    const unavailable = renderToStaticMarkup(
      React.createElement(CapacityMeters, { snapshot: snapshot(true) }),
    );
    expect(unavailable).toContain("Capacity limit unavailable");
    expect(unavailable).not.toContain("progressbar");
  });
  it("explains pending/reserved and unknown lifecycle quality", () => {
    const s = snapshot();
    s.dimensions[0] = {
      ...dimension("counted_clients", 7, 10, 1, 1),
      dataQualityIssue: true,
    };
    const html = renderToStaticMarkup(
      React.createElement(CapacityMeters, { snapshot: s }),
    );
    expect(html).toContain("7 current clients + 1 pending + 1 reserved of 10");
    expect(html).toContain(
      "Unknown client lifecycle states count conservatively",
    );
  });
  it("keeps entitlement and payment placeholders when capacity fails", () => {
    const html = renderToStaticMarkup(
      React.createElement(PtHubSettingsBillingTab),
    );
    expect(html).toContain("Complimentary beta access");
    expect(html).toContain("Account capacity unavailable");
    expect(html).toContain("Retry capacity");
    expect(html).toContain("No payment method connected");
  });
  it("uses the local hook without compatibility fallback or commerce controls", () => {
    const source = readFileSync(
      "src/pages/pt-hub/settings/tabs/billing.tsx",
      "utf8",
    );
    expect(source).toContain("useMyAccountCapacitySnapshot()");
    expect(source).not.toMatch(
      /subscription_plan|subscription_status|checkout|purchase/i,
    );
  });
});
