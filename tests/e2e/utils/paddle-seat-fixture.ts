import { expect, type BrowserContext, type Page } from "@playwright/test";
import type {
  SeatQuantityState,
  SeatQuantityPreview,
} from "../../../src/features/billing/seat-quantity-contracts";
import { seedEntitlementCoach } from "./account-entitlement-seeds";
import { pgQuery } from "./auth-seeds";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
} from "./test-helpers";
import { trackRpcReads } from "./rpc-readiness";

async function paddleSeatPageFixture(
  page: Page,
  context: BrowserContext,
  scope: string,
) {
  const coach = await seedEntitlementCoach(`paddle-seat-${scope}`, true);
  const waitForReads = trackRpcReads(page);
  await context.route(
    "**/rest/v1/rpc/get_my_billing_plan_change_state",
    (route) =>
      route.fulfill({
        json: {
          provider: "paddle",
          linked: false,
          cadence: null,
          eligible: false,
          operation: null,
        },
      }),
  );
  await context.route(
    "**/rest/v1/rpc/get_my_billing_payment_method_state_v1",
    (route) =>
      route.fulfill({
        json: {
          available: false,
          reason: "not_available",
          maySettleExistingBalance: false,
        },
      }),
  );
  await context.route(
    "**/rest/v1/rpc/get_my_effective_account_entitlements",
    async (route) => {
      const body = await (await route.fetch()).json();
      body.subscription = {
        ...body.subscription,
        kind: "paid",
        storedStatus: "active",
        effectiveStatus: "active",
        planKey: "growth",
        planDisplayName: "Growth",
        accessLabel: "Growth",
        accessMode: "full",
      };
      await route.fulfill({ json: body });
    },
  );
  const seatAction = async (action: "apply" | "refresh", button: string) => {
    const endpoint =
      action === "apply"
        ? "billing-change-coach-seat-quantity"
        : "billing-refresh-coach-seat-change";
    await Promise.all([
      ...[
        `/functions/v1/${endpoint}`,
        "/rest/v1/rpc/get_my_billing_seat_quantity_state",
        "/rest/v1/rpc/get_my_effective_account_entitlements",
        "/rest/v1/rpc/get_my_account_capacity_snapshot",
      ].map(async (path) => {
        const response = await page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === path,
        );
        expect(response.ok()).toBe(true);
        await response.finished();
      }),
      page.getByRole("button", { name: button, exact: true }).click(),
    ]);
    await waitForReads();
    await expect(
      page.getByRole("button", { name: "Refresh coach seats", exact: true }),
    ).toBeEnabled();
  };
  return {
    async open() {
      await signInWithEmail(page, coach.email, coach.password);
      await waitForAuthSessionReady(page);
      await waitForBootstrapResolved(page);
      await page.goto("/pt-hub/settings/billing");
      await waitForBootstrapResolved(page);
      await expect(
        page.getByRole("button", { name: "Refresh coach seats", exact: true }),
      ).toBeEnabled();
      await waitForReads();
    },
    async commercialCounts() {
      const rows = await pgQuery<{ operations: number; applications: number }>(
        `with account as (select id from public.billing_accounts where owner_user_id='${coach.userId}'::uuid)
        select ((select count(*) from public.billing_plan_change_operations where billing_account_id in (select id from account))+
          (select count(*) from public.billing_seat_quantity_operations where billing_account_id in (select id from account))+
          (select count(*) from public.billing_operations_v2 where billing_account_id in (select id from account)))::int operations,
          (select count(*)::int from public.billing_payment_applications_v2 where billing_account_id in (select id from account)) applications`,
      );
      return rows[0];
    },
    refreshSeats: () => seatAction("refresh", "Refresh coach seats"),
    scheduleSeatReduction: () =>
      seatAction("apply", "Confirm scheduled reduction"),
    async previewSeats(target: number) {
      await page
        .getByLabel("Additional coach seats", { exact: true })
        .selectOption(String(target));
      const response = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname ===
            "/functions/v1/billing-preview-coach-seat-change",
      );
      await page
        .getByRole("button", { name: "Preview seat change", exact: true })
        .click();
      await (await response).finished();
    },
  };
}

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
    (url) => !["localhost", "127.0.0.1"].includes(url.hostname),
    async (route) => {
      providerCalls++;
      await route.abort();
    },
  );
  // Serve optional stylesheet requests locally; every other nonlocal request
  // remains blocked and fails the zero-provider-request assertion.
  await context.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  const f = await paddleSeatPageFixture(page, context, scope);
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
  await f.open();
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
