import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import type {
  SeatQuantityPreview,
  SeatQuantityState,
} from "../../src/features/billing/seat-quantity-contracts";
const mocks = vi.hoisted(() => ({ state: {} as SeatQuantityState }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.state }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("../../src/lib/auth", () => ({
  useSessionAuth: () => ({ user: { id: "owner" } }),
}));
import {
  SeatQuantityPanel,
  SeatQuantitySummary,
  SeatQuantityPreviewDetails,
} from "../../src/features/billing/seat-quantity-panel";
const summary: NonNullable<SeatQuantityState["summary"]> = {
  planKey: "growth",
  cadence: "annual",
  includedSeats: 2,
  currentAdditionalSeats: 1,
  maximumSeats: 5,
  maximumAdditionalSeats: 3,
  currentEffectiveLimit: 3,
  growthLimit: 3,
  actual: 2,
  pending: 1,
  reserved: 0,
  committed: 3,
  unitPriceMinor: 12000,
  currentTotalMinor: 71000,
  manualReview: false,
};
const preview: SeatQuantityPreview = {
  ...summary,
  currentProviderQuantity: 2,
  targetProviderQuantity: 3,
  targetAdditionalSeats: 2,
  targetEffectiveLimit: 4,
  direction: "increase",
  timing: "immediate",
  effectiveAt: null,
  targetTotalMinor: 83000,
  currency: "USD",
  capacityBlocked: false,
  eligible: true,
  errorCode: null,
  disclosure: "Provider-calculated proration",
};
const render = (element: React.ReactElement) =>
  renderToStaticMarkup(React.createElement(MemoryRouter, null, element));
describe("coach-seat presentation", () => {
  it("renders annual seat price, approved summary and total", () => {
    const html = render(React.createElement(SeatQuantitySummary, { summary }));
    expect(html).toContain("$120.00 USD / year");
    expect(html).toContain("$710.00 USD / year");
    expect(html).toContain("1 purchased additional seats");
  });
  it("describes target annual total and payment gate without exact proration", () => {
    const html = render(
      React.createElement(SeatQuantityPreviewDetails, { preview }),
    );
    expect(html).toContain("$830.00 USD / year");
    expect(html).toContain("after verified payment");
    expect(html).toContain("not an exact charge preview");
  });
  it("shows capacity blockers and management route", () => {
    const html = render(
      React.createElement(SeatQuantityPreviewDetails, {
        preview: {
          ...preview,
          direction: "reduction",
          timing: "period_end",
          targetAdditionalSeats: 0,
          targetEffectiveLimit: 2,
          capacityBlocked: true,
          eligible: false,
          errorCode: "BILLING_SEAT_QUANTITY_CAPACITY_BLOCKED",
        },
      }),
    );
    expect(html).toContain("3 committed");
    expect(html).toContain("Target limit: 2");
    expect(html).toContain("/pt-hub/workspaces");
  });
  it("nonowner has no seat or operation data", () => {
    mocks.state = { available: true, summary, operation: null };
    expect(
      render(
        React.createElement(SeatQuantityPanel, {
          owner: false,
          refresh: vi.fn(),
        }),
      ),
    ).toBe("");
  });
  it.each([
    "awaiting_payment",
    "scheduled",
    "cancel_pending",
    "ambiguous",
    "manual_review",
  ] as const)("renders %s without new-purchase controls", (status) => {
    mocks.state = {
      available: true,
      summary,
      operation: {
        id: "00000000-0000-4000-8000-000000000001",
        status,
        direction: status === "awaiting_payment" ? "increase" : "reduction",
        targetAdditionalSeats: 0,
        effectiveAt: "2030-01-01T00:00:00Z",
        errorCode: null,
      },
    };
    const html = render(
      React.createElement(SeatQuantityPanel, { owner: true, refresh: vi.fn() }),
    );
    expect(html).not.toContain("Preview seat change");
    expect(html).toContain("Refresh coach seats");
    expect(html).not.toContain(mocks.state.operation!.id);
    if (status === "scheduled")
      expect(html).toContain("Cancel scheduled reduction");
    if (status === "awaiting_payment")
      expect(html).toContain("Awaiting verified payment");
    if (status === "cancel_pending")
      expect(html).toContain("lower growth limit remains");
  });
});
