import { expect, type BrowserContext, type Page } from "@playwright/test";
import type {
  SeatQuantityState,
  SeatQuantityPreview,
} from "../../../src/features/billing/seat-quantity-contracts";
import { planChangeFixture } from "./plan-change-fixture";

/** Local authenticated app + mocked safe Paddle read contract. SQL authority is
 * independently exercised by paddle_seat_quantity.sql; never contacts Paddle. */
export async function paddleSeatFixture(
  page: Page,
  context: BrowserContext,
  scope: string,
  cadence: "monthly" | "annual" = "monthly",
  approved = 0,
) {
  let providerCalls = 0;
  await context.route(
    (url) =>
      url.hostname === "paddle.com" || url.hostname.endsWith(".paddle.com"),
    async (route) => {
      providerCalls++;
      await route.abort();
    },
  );
  const f = await planChangeFixture(
    page,
    context,
    scope,
    "growth",
    cadence,
    "card",
    true,
  );
  let state: SeatQuantityState = {
    provider: "paddle",
    available: true,
    canCancel: false,
    blockingOperation: null,
    summary: {
      planKey: "growth",
      cadence,
      includedSeats: 2,
      currentAdditionalSeats: approved,
      maximumSeats: 5,
      maximumAdditionalSeats: 3,
      currentEffectiveLimit: 2 + approved,
      growthLimit: 2 + approved,
      actual: 1,
      pending: 0,
      reserved: 0,
      committed: 1,
      unitPriceMinor: cadence === "monthly" ? 1200 : 12000,
      currentTotalMinor:
        (cadence === "monthly" ? 5900 : 59000) +
        approved * (cadence === "monthly" ? 1200 : 12000),
      manualReview: false,
    },
    operation: null,
  };
  let applies = 0,
    previews = 0;
  await context.route(
    "**/rest/v1/rpc/get_my_billing_seat_quantity_state",
    (route) => route.fulfill({ json: state }),
  );
  await context.route(
    "**/functions/v1/billing-preview-coach-seat-change",
    (route) => {
      const input = route.request().postDataJSON();
      expect(Object.keys(input)).toEqual(["targetAdditionalSeats"]);
      previews++;
      const {
        growthLimit: _growth,
        manualReview: _review,
        ...s
      } = state.summary!;
      const reduction = input.targetAdditionalSeats < s.currentAdditionalSeats;
      const result: SeatQuantityPreview = {
        ...s,
        provider: "paddle",
        targetAdditionalSeats: input.targetAdditionalSeats,
        currentProviderQuantity: s.currentAdditionalSeats,
        targetProviderQuantity: input.targetAdditionalSeats,
        targetEffectiveLimit: 2 + input.targetAdditionalSeats,
        direction: reduction ? "reduction" : "increase",
        timing: reduction ? "period_end" : "immediate",
        effectiveAt: reduction ? "2027-10-23T00:00:00Z" : null,
        targetTotalMinor:
          s.currentTotalMinor +
          (input.targetAdditionalSeats - s.currentAdditionalSeats) *
            s.unitPriceMinor,
        currency: "USD",
        capacityBlocked: false,
        eligible: true,
        errorCode: null,
        disclosure: "Provider calculated proration",
      };
      return route.fulfill({ json: result });
    },
  );
  await context.route(
    "**/functions/v1/billing-change-coach-seat-quantity",
    (route) => {
      const input = route.request().postDataJSON();
      expect(Object.keys(input).sort()).toEqual([
        "operationId",
        "targetAdditionalSeats",
      ]);
      expect(input.operationId).toMatch(/^[0-9a-f-]{36}$/);
      applies++;
      const reduction =
        input.targetAdditionalSeats < state.summary!.currentAdditionalSeats;
      state = {
        ...state,
        summary: {
          ...state.summary!,
          growthLimit: reduction
            ? 2 + input.targetAdditionalSeats
            : state.summary!.growthLimit,
        },
        operation: {
          id: input.operationId,
          status: reduction ? "scheduled" : "awaiting_payment",
          direction: reduction ? "reduction" : "increase",
          targetAdditionalSeats: input.targetAdditionalSeats,
          effectiveAt: reduction ? "2027-10-23T00:00:00Z" : null,
          errorCode: null,
        },
      };
      return route.fulfill({ json: state });
    },
  );
  await context.route(
    "**/functions/v1/billing-refresh-coach-seat-change",
    (route) => route.fulfill({ json: state }),
  );
  await f.refreshSeats();
  const before = await f.commercialCounts();
  return {
    ...f,
    state: () => state,
    setState: (next: SeatQuantityState) => {
      state = next;
    },
    async verifyNoCommercialWrites() {
      expect(await f.commercialCounts()).toEqual(before);
      expect(providerCalls).toBe(0);
    },
    calls: () => ({ applies, previews }),
  };
}
