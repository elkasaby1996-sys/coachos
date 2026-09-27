import { expect, test } from "@playwright/test";
import { paddleSeatFixture } from "./utils/paddle-seat-fixture";

test.describe.configure({ mode: "parallel" });
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "wait" });
});

for (const cadence of ["monthly", "annual"] as const) {
  test(`Paddle ${cadence} increase preview and payment gate`, async ({
    page,
    context,
  }, info) => {
    const f = await paddleSeatFixture(page, context, info.testId, cadence);
    const panel = page.locator("#coach-seats");
    await expect(
      panel.getByText(
        `Each additional seat: ${cadence === "monthly" ? "$12.00 USD / month" : "$120.00 USD / year"}`,
      ),
    ).toBeVisible();
    await f.previewSeats(1);
    await expect(
      panel.getByText("Proration, taxes and credits are calculated by Paddle", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      panel.getByText("No payment has been collected", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Confirm seat purchase", exact: true })
      .click();
    await expect(
      panel.getByText("Awaiting verified payment", { exact: false }),
    ).toBeVisible();
    await expect(
      panel.getByText("Effective limit: 2", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm seat purchase", exact: true }),
    ).toHaveCount(0);
    await f.refreshSeats();
    expect(f.calls()).toEqual({ previews: 1, applies: 1 });
    await f.verifyNoCommercialWrites();
  });
}
test("Paddle scheduled reduction retains approval and hides unsupported cancellation", async ({
  page,
  context,
}, info) => {
  const f = await paddleSeatFixture(page, context, info.testId, "monthly", 2);
  await f.previewSeats(0);
  await f.scheduleSeatReduction();
  const panel = page.locator("#coach-seats");
  await expect(
    panel.getByText("Reduction to 0 additional seats is scheduled", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    panel.getByText("Effective limit: 4", { exact: false }),
  ).toBeVisible();
  await expect(
    panel.getByText("scheduled limit of 2", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Cancel scheduled reduction",
      exact: true,
    }),
  ).toHaveCount(0);
  await f.refreshSeats();
  expect(f.calls()).toEqual({ previews: 1, applies: 1 });
  await f.verifyNoCommercialWrites();
});
test("Paddle plan conflict, ambiguity and manual review cannot create a new intent", async ({
  page,
  context,
}, info) => {
  const f = await paddleSeatFixture(page, context, info.testId);
  f.setState({ ...f.state(), blockingOperation: "plan_change" });
  await f.refreshSeats();
  await expect(
    page.getByText("A plan change is pending", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Additional coach seats", { exact: true }),
  ).toHaveCount(0);
  for (const status of ["ambiguous", "manual_review"] as const) {
    f.setState({
      ...f.state(),
      blockingOperation: null,
      operation: {
        id: "a0700000-0000-4000-8000-000000000001",
        status,
        direction: "increase",
        targetAdditionalSeats: 1,
        effectiveAt: null,
        errorCode:
          status === "ambiguous"
            ? "BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS"
            : "BILLING_SEAT_QUANTITY_MANUAL_REVIEW",
      },
    });
    await f.refreshSeats();
    await expect(
      page.getByText(
        status === "ambiguous"
          ? "do not repeat the purchase"
          : "Coach-seat billing needs review",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(
      page.getByLabel("Additional coach seats", { exact: true }),
    ).toHaveCount(0);
  }
  expect(f.calls()).toEqual({ previews: 0, applies: 0 });
  await f.verifyNoCommercialWrites();
});
