import { test, expect } from "@playwright/test";
import { seedEntitlementCoach } from "./utils/account-entitlement-seeds";
import { pgQuery } from "./utils/auth-seeds";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
} from "./utils/test-helpers";

for (const outcome of ["ready", "unsafe", "disabled", "ambiguous"] as const) {
  test(`Paddle checkout ${outcome} uses only the authenticated browser contract`, async ({
    page,
    context,
  }, info) => {
    const coach = await seedEntitlementCoach(info.testId);
    await pgQuery(
      `insert into public.workspaces(id,name,owner_user_id) values('${coach.workspaceId}','Local Paddle browser fixture','${coach.userId}')`,
    );
    const hosted =
      "https://sandbox-pay.paddle.io/checkout/synthetic-launch?transaction_id=synthetic%2Ftransaction";
    let calls = 0;
    await context.route("**/*", (route) => {
      const host = new URL(route.request().url()).hostname;
      return ["localhost", "127.0.0.1"].includes(host)
        ? route.continue()
        : route.abort();
    });
    // No request reaches Paddle, even if the browser attempts an unexpected path.
    await context.route(/https:\/\/[^/]*paddle\.(com|io)\//, (route) =>
      route.abort(),
    );
    await context.route(hosted, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Mock Paddle checkout</h1>",
      }),
    );
    await context.route(
      "**/functions/v1/billing-create-lemon-squeezy-checkout",
      () => {
        throw Error("Paddle selection invoked LS");
      },
    );
    await context.route(
      "**/functions/v1/billing-create-paddle-checkout",
      async (route) => {
        if (route.request().method() === "OPTIONS")
          return route.fulfill({
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers": "*",
            },
          });
        calls++;
        expect(route.request().headers().authorization).toMatch(/^Bearer .+/);
        const body = route.request().postDataJSON();
        expect(Object.keys(body).sort()).toEqual([
          "additionalCoachSeats",
          "cadence",
          "legal",
          "planKey",
        ]);
        expect(body.additionalCoachSeats).toBe(0);
        expect(body.legal.termsAccepted).toBe(true);
        expect(body.legal.refundAcknowledged).toBe(true);
        expect(JSON.stringify(body)).not.toMatch(
          /apikey|priceId|operationId|transactionId|billingAccountId|userId/,
        );
        const json =
          outcome === "ready" || outcome === "unsafe"
            ? {
                status: "ready",
                checkoutUrl:
                  outcome === "ready" ? hosted : "https://evil.example.test",
              }
            : {
                code:
                  outcome === "disabled"
                    ? "PADDLE_CHECKOUT_ROLLOUT_DISABLED"
                    : "PADDLE_CHECKOUT_AMBIGUOUS",
                retryable: false,
              };
        await route.fulfill({
          status:
            outcome === "disabled" ? 403 : outcome === "ambiguous" ? 409 : 200,
          json,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      },
    );
    await signInWithEmail(page, coach.email, coach.password);
    await waitForAuthSessionReady(page);
    await waitForBootstrapResolved(page);
    await page.goto("/pt-hub/settings/billing");
    await waitForBootstrapResolved(page);
    const start = page.getByRole("button", {
      name: "Start subscription",
      exact: true,
    });
    await expect(start).toBeDisabled();
    await page
      .getByRole("checkbox", { name: "I accept the Terms of Service" })
      .check();
    await page
      .getByRole("checkbox", { name: "I acknowledge the Refund Policy" })
      .check();
    await expect(start).toBeEnabled();
    await start.click();
    if (outcome === "ready")
      await expect(
        page.getByRole("heading", { name: "Mock Paddle checkout" }),
      ).toBeVisible();
    else {
      await expect(page.getByRole("alert")).toContainText(
        outcome === "disabled" ? "currently unavailable" : "Contact support",
      );
      await expect(page).toHaveURL(/\/pt-hub\/settings\/billing$/);
      if (outcome !== "disabled") await expect(start).toBeDisabled();
    }
    expect(calls).toBe(1);
    await context.unrouteAll({ behavior: "wait" });
  });
}
