import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type {
  PlanChangePreview,
  PlanChangeState,
} from "../../src/features/billing/plan-change-contracts";
const mocks = vi.hoisted(() => ({ state: {} as PlanChangeState }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.state, refetch: vi.fn() }),
}));
vi.mock("../../src/lib/auth", () => ({
  useSessionAuth: () => ({ user: { id: "owner" } }),
}));
import {
  PlanChangePanel,
  PlanChangePreviewDetails,
} from "../../src/features/billing/plan-change-panel";
const preview: PlanChangePreview = {
  sourcePlanKey: "launch",
  sourceCadence: "monthly",
  targetPlanKey: "growth",
  targetCadence: "annual",
  changeKind: "combined_upgrade",
  effectiveTiming: "immediate",
  prorationMode: "invoice_immediately",
  currentPriceMinor: 1900,
  targetPriceMinor: 59000,
  currency: "USD",
  effectiveAt: null,
  dataQualityIssue: false,
  blockers: [],
};
const render = (element: React.ReactElement) =>
  renderToStaticMarkup(React.createElement(MemoryRouter, null, element));
describe("plan change presentation", () => {
  it("shows annual total, payment gate and nonexact provider calculation", () => {
    const html = render(
      React.createElement(PlanChangePreviewDetails, { preview }),
    );
    expect(html).toContain("$590.00 USD charged annually");
    expect(html).toContain("after verified payment");
    expect(html).toContain("not an exact charge preview");
    expect(html).toContain("Taxes and credits");
  });
  it("shows period end, blockers and remediation", () => {
    const html = render(
      React.createElement(PlanChangePreviewDetails, {
        preview: {
          ...preview,
          effectiveTiming: "period_end",
          effectiveAt: "2027-01-01T00:00:00Z",
          blockers: [
            {
              dimension: "counted_clients",
              committed: 55,
              targetLimit: 50,
              overBy: 5,
              managementRoute: "/pt-hub/clients",
              remediation: "Review clients.",
            },
          ],
        },
      }),
    );
    expect(html).toContain("Proration is disabled");
    expect(html).toContain("55");
    expect(html).toContain('href="/pt-hub/clients"');
    expect(html).toContain("Review clients.");
  });
  it.each([
    "provider_pending",
    "awaiting_payment",
    "scheduled",
    "cancel_pending",
    "ambiguous",
    "manual_review",
  ] as const)("renders %s recovery state", (status) => {
    mocks.state = {
      linked: true,
      cadence: "monthly",
      eligible: false,
      operation: {
        operationId: "a0700000-0000-4000-8000-000000000001",
        status,
        targetPlanKey: "growth",
        targetCadence: "monthly",
        effectiveAt: "2027-01-01T00:00:00Z",
        effectiveTiming:
          status === "awaiting_payment" ? "immediate" : "period_end",
        errorCode: null,
      },
    };
    const html = render(
      React.createElement(PlanChangePanel, {
        owner: true,
        refresh: async () => null,
      }),
    );
    expect(html).toContain(status.replace(/_/g, " "));
    expect(html).toContain("Refresh plan change");
    expect(html.includes("Cancel scheduled change")).toBe(
      status === "scheduled",
    );
    expect(html).not.toMatch(
      /Buy seats|Refund|Coupon|customer_portal_update_subscription/,
    );
  });
  it("hides details from nonowners", () =>
    expect(
      render(
        React.createElement(PlanChangePanel, {
          owner: false,
          refresh: async () => null,
        }),
      ),
    ).toBe(""));
});
