import { expect, test } from "@playwright/test";
import { paddlePlanFixture } from "./utils/paddle-plan-fixture";
import { handlePlanChange } from "../../supabase/functions/_shared/billing-plan-change";
import {
  handlePaddlePlanAction,
  type PaddlePlanDependencies,
} from "../../supabase/functions/_shared/paddle-plan-change";
import {
  projectPaddlePlanResult,
  legacyPaddlePlanPreview,
} from "../../supabase/functions/_shared/paddle-workflow-projection";
test.describe.configure({ mode: "parallel" });
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "wait" });
});
// UI and HTTP bridge over a local seeded canonical account with an injected
// provider preview. Payment authority is exercised by SQL/transport suites.
for (const cadence of ["monthly", "annual"] as const) {
  for (const downgrade of [false, true]) {
    test(`Paddle ${cadence} ${downgrade ? "scheduled downgrade" : "failed upgrade"} retains source capacity`, async ({
      page,
      context,
    }, info) => {
      const source = downgrade ? "scale" : "growth";
      const target = downgrade ? "growth" : "scale";
      let providerRequests = 0;
      await context.route(
        (url) =>
          url.protocol === "https:" &&
          (url.hostname === "paddle.com" ||
            url.hostname.endsWith(".paddle.com")),
        (route) => {
          providerRequests++;
          return route.abort();
        },
      );
      const quote = {
        action: "charge",
        amountMinor: 2400,
        currencyCode: "USD",
      };
      const f = await paddlePlanFixture(
        page,
        context,
        info.testId,
        source,
        cadence,
      );
      let operation: Record<string, unknown> | null = null;
      const beforePreview = await f.commercialCounts();
      let submitted = 0;
      const state = () => ({
        provider: "paddle",
        linked: true,
        cadence,
        eligible: !operation,
        operation,
      });
      await context.route(
        "**/rest/v1/rpc/get_my_billing_plan_change_state",
        (route) => route.fulfill({ json: state() }),
      );
      const previewBody = {
        provider: "paddle",
        sourcePlanKey: source,
        sourceCadence: cadence,
        targetPlanKey: target,
        targetCadence: cadence,
        changeKind: downgrade ? "tier_downgrade" : "tier_upgrade",
        effectiveTiming: downgrade ? "period_end" : "immediate",
        prorationMode: downgrade ? "disable_prorations" : "invoice_immediately",
        currentPriceMinor: downgrade ? 9900 : 5900,
        targetPriceMinor: downgrade ? 5900 : 9900,
        currency: "USD",
        effectiveAt: downgrade
          ? new Date(Date.now() + 86400000).toISOString()
          : null,
        dataQualityIssue: false,
        blockers: [],
      };
      const versions: unknown[] = [];
      const bridgeDeps = {
        authenticate: async () => ({ id: "synthetic-owner" }),
        serviceRpc: async (name: string) => {
          if (name === "billing_workflow_provider_v1") return "paddle";
          if (name === "paddle_plan_change_context_v1") return {};
          if (name === "preview_paddle_plan_change_v1")
            return {
              preview: previewBody,
              targetPriceRef: "synthetic-price",
              targetProductRef: "synthetic-product",
            };
          throw new Error("Preview attempted a commercial RPC");
        },
        paddlePlans: () => ({
          retrieve: async () => ({ snapshot: {}, custom: {} }),
          preview: async () => (downgrade ? undefined : quote),
          update: async () => {
            throw new Error("Preview attempted a subscription mutation");
          },
        }),
      } as unknown as PaddlePlanDependencies;
      bridgeDeps.providerAvailable = (provider) => provider === "paddle";
      bridgeDeps.planAction = async (_provider, owner, token, action, input) =>
        projectPaddlePlanResult(
          action,
          await handlePaddlePlanAction(bridgeDeps, owner, token, action, input),
        );
      bridgeDeps.legacyPlanPreview = legacyPaddlePlanPreview;
      await context.route(
        "**/functions/v1/billing-preview-plan-change",
        async (route) => {
          const input = route.request().postDataJSON();
          versions.push(input.previewContractVersion);
          expect(Object.keys(input).sort()).toEqual(
            input.previewContractVersion === undefined
              ? ["operationId", "targetCadence", "targetPlanKey"]
              : [
                  "operationId",
                  "previewContractVersion",
                  "targetCadence",
                  "targetPlanKey",
                ],
          );
          if (input.previewContractVersion !== undefined)
            expect(input.previewContractVersion).toBe(2);
          expect(input.targetCadence).toBe(cadence);
          const response = await handlePlanChange(
            new Request(route.request().url(), {
              method: "POST",
              headers: { authorization: "Bearer synthetic" },
              body: route.request().postData(),
            }),
            bridgeDeps,
            "preview",
          );
          await route.fulfill({
            status: response.status,
            headers: Object.fromEntries(response.headers),
            body: await response.text(),
          });
        },
      );
      // A cached legacy frontend still sends the original three-field body.
      const legacy = await page.evaluate(
        async (body) => {
          const response = await fetch(
            "/functions/v1/billing-preview-plan-change",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          );
          return { status: response.status, body: await response.json() };
        },
        {
          targetPlanKey: target,
          targetCadence: cadence,
          operationId: "a0700000-0000-4000-8000-000000000001",
        },
      );
      expect(legacy.status).toBe(200);
      expect(legacy.body).toEqual(previewBody);
      expect(legacy.body).not.toHaveProperty("quote");
      expect(await f.commercialCounts()).toEqual(beforePreview);
      await context.route(
        "**/functions/v1/billing-change-subscription-plan",
        (route) => {
          const input = route.request().postDataJSON();
          expect(Object.keys(input).sort()).toEqual([
            "operationId",
            "targetCadence",
            "targetPlanKey",
          ]);
          submitted++;
          operation = {
            operationId: input.operationId,
            status: downgrade ? "scheduled" : "awaiting_payment",
            targetPlanKey: target,
            targetCadence: cadence,
            effectiveTiming: downgrade ? "period_end" : "immediate",
            effectiveAt: downgrade
              ? new Date(Date.now() + 86400000).toISOString()
              : null,
            errorCode: downgrade ? null : "BILLING_PLAN_CHANGE_PAYMENT_FAILED",
          };
          return route.fulfill({ json: state() });
        },
      );
      await context.route(
        "**/functions/v1/billing-refresh-plan-change",
        (route) => route.fulfill({ json: state() }),
      );
      await page.reload();
      await page
        .getByRole("button", { name: "Change plan", exact: true })
        .click();
      await expect(
        page.getByLabel("Target billing frequency", { exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByLabel("Target billing frequency", { exact: true }),
      ).toHaveValue(cadence);
      await page
        .getByLabel("Target plan", { exact: true })
        .selectOption(target);
      await page
        .getByRole("button", { name: "Preview plan change", exact: true })
        .click();
      await expect(
        page.getByText(
          "Your payment provider calculates any immediate charge.",
          {
            exact: false,
          },
        ),
      ).toBeVisible();
      if (!downgrade) {
        await expect(
          page.getByText(
            `prorated charge of $${(quote.amountMinor / 100).toFixed(2)} ${quote.currencyCode}`,
            { exact: false },
          ),
        ).toBeVisible();
        await expect(
          page.getByText("No payment has been collected for this change.", {
            exact: false,
          }),
        ).toBeVisible();
      }
      expect(await f.commercialCounts()).toEqual(beforePreview);
      expect(beforePreview).toEqual({ operations: 0, applications: 0 });
      expect(versions).toEqual([undefined, 2]);
      expect(await page.locator("body").innerText()).not.toMatch(
        /\b(?:sub|ctm|txn|pri|pro)_[a-z0-9]+/i,
      );
      expect(providerRequests).toBe(0);
      await f.apply();
      await expect(
        page.getByRole("progressbar", { name: "Clients committed capacity" }),
      ).toHaveAttribute(
        "aria-valuetext",
        downgrade ? /committed of 100;/ : /committed of 50;/,
      );
      await expect(
        page.getByText(
          downgrade
            ? "Your current plan and capacity remain unchanged until this date."
            : "Waiting for verified payment.",
          { exact: false },
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Cancel scheduled change",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Change plan", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Refresh plan change", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Refresh plan change", exact: true }),
      ).toBeEnabled();
      expect(submitted).toBe(1);
      expect(f.patches()).toBe(0);
      expect(providerRequests).toBe(0);
    });
  }
}
