import { expect, test } from "@playwright/test";
import { planChangeFixture } from "./utils/plan-change-fixture";
test.describe.configure({ mode: "parallel" });
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "wait" });
});
test("Growth purchase waits for payment, then reduction and cancellation retain the correct limits", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(
    page,
    context,
    info.testId,
    "growth",
    "monthly",
    "card",
    true,
  );
  const seats = page.locator("#coach-seats");
  await expect(
    seats.getByText("Effective limit: 2", { exact: false }),
  ).toBeVisible();
  await f.buySeats(1);
  await expect(
    seats.getByText("Awaiting verified payment", { exact: false }),
  ).toBeVisible();
  await expect(
    seats.getByText("Effective limit: 2", { exact: false }),
  ).toBeVisible();
  expect(f.patches()).toBe(1);
  await f.payment();
  await page
    .getByRole("button", { name: "Refresh coach seats", exact: true })
    .click();
  await expect(
    seats.getByText("Effective limit: 3", { exact: false }),
  ).toBeVisible();
  await f.previewSeats(0);
  await page
    .getByRole("button", { name: "Confirm scheduled reduction", exact: true })
    .click();
  await expect(
    seats.getByText("New invitations must fit the scheduled limit of 2", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    seats.getByText("Effective limit: 3", { exact: false }),
  ).toBeVisible();
  expect((await f.reserveSeats(2)).granted).toBe(false);
  await page
    .getByRole("button", { name: "Cancel scheduled reduction", exact: true })
    .click();
  await expect(
    seats.getByText("New invitations must fit", { exact: false }),
  ).toHaveCount(0);
  await expect(
    seats.getByText("Effective limit: 3", { exact: false }),
  ).toBeVisible();
});
test("failed payment preserves seats and recovery completes the same purchase", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(
    page,
    context,
    info.testId,
    "growth",
    "monthly",
    "card",
    true,
  );
  await f.buySeats(1);
  await f.payment(false);
  await page
    .getByRole("button", { name: "Refresh coach seats", exact: true })
    .click();
  await expect(
    page
      .locator("#coach-seats")
      .getByText("Effective limit: 2", { exact: false }),
  ).toBeVisible();
  await f.payment(true);
  await page
    .getByRole("button", { name: "Refresh coach seats", exact: true })
    .click();
  await expect(
    page
      .locator("#coach-seats")
      .getByText("Effective limit: 3", { exact: false }),
  ).toBeVisible();
  expect(f.patches()).toBe(1);
});
test("maximum seat purchase blocks an incompatible plan and committed-seat reduction", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(
    page,
    context,
    info.testId,
    "growth",
    "monthly",
    "card",
    true,
  );
  await f.buySeats(3);
  await f.payment();
  await page
    .getByRole("button", { name: "Refresh coach seats", exact: true })
    .click();
  await expect(
    page
      .locator("#coach-seats")
      .getByText("Effective limit: 5", { exact: false }),
  ).toBeVisible();
  const reservation = await f.reserveSeats(3);
  expect(reservation.granted).toBe(true);
  await f.previewSeats(0);
  await expect(
    page.locator("#coach-seats").getByText("Target limit: 2", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Confirm scheduled reduction",
      exact: true,
    }),
  ).toBeDisabled();
  expect(f.patches()).toBe(1);
  await f.release(reservation.reservationId);
  await f.preview("launch");
  await expect(
    page.getByText("Current commitments exceed the target plan.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(f.patches()).toBe(1);
});
test("unapproved provider quantity preserves approved capacity in manual review", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(
    page,
    context,
    info.testId,
    "growth",
    "monthly",
    "card",
    true,
  );
  f.snapshot().quantity = 3;
  await f.payment();
  await page
    .getByRole("button", { name: "Refresh coach seats", exact: true })
    .click();
  await expect(
    page
      .locator("#coach-seats")
      .getByText("Coach-seat billing needs review", { exact: false }),
  ).toBeVisible();
  await expect(
    page
      .locator("#coach-seats")
      .getByText("Effective limit: 2", { exact: false }),
  ).toBeVisible();
  expect(f.patches()).toBe(0);
});

for (const kind of ["active", "pending"] as const)
  test(`${kind} team commitments block reduction before provider mutation`, async ({
    page,
    context,
  }, info) => {
    const f = await planChangeFixture(
      page,
      context,
      info.testId,
      "growth",
      "monthly",
      "card",
      true,
    );
    await f.buySeats(1);
    await f.payment();
    await page
      .getByRole("button", { name: "Refresh coach seats", exact: true })
      .click();
    await f.addSeatCommitments(kind, 2);
    await f.previewSeats(0);
    await expect(
      page
        .locator("#coach-seats")
        .getByText("Target limit: 2", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Confirm scheduled reduction",
        exact: true,
      }),
    ).toBeDisabled();
    expect(f.patches()).toBe(1);
    if (kind === "pending") {
      await f.revokeSeatInvites();
      await f.previewSeats(0);
      await page
        .getByRole("button", {
          name: "Confirm scheduled reduction",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Cancel scheduled reduction",
          exact: true,
        }),
      ).toBeVisible();
    }
  });
test("compatible plan upgrade retains purchased seats", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(
    page,
    context,
    info.testId,
    "growth",
    "monthly",
    "card",
    true,
  );
  await f.buySeats(1);
  await f.payment();
  await page
    .getByRole("button", { name: "Refresh coach seats", exact: true })
    .click();
  await f.preview("scale");
  await f.apply();
  await expect(
    page.getByText("Waiting for verified payment.", { exact: false }),
  ).toBeVisible();
  await f.payment();
  await page
    .getByRole("button", { name: "Refresh coach seats", exact: true })
    .click();
  await expect(
    page
      .locator("#coach-seats")
      .getByText("Effective limit: 6", { exact: false }),
  ).toBeVisible();
  expect(f.snapshot().quantity).toBe(2);
});
test("over-maximum and forged seat requests never dispatch", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(
    page,
    context,
    info.testId,
    "growth",
    "monthly",
    "card",
    true,
  );
  for (const body of [
    { targetAdditionalSeats: 4, operationId: crypto.randomUUID() },
    { targetAdditionalSeats: 1, quantity: 2, operationId: crypto.randomUUID() },
  ]) {
    const status = await page.evaluate(
      async (body) =>
        (
          await fetch("/functions/v1/billing-change-coach-seat-quantity", {
            method: "POST",
            body: JSON.stringify(body),
          })
        ).status,
      body,
    );
    expect(status).toBeGreaterThanOrEqual(400);
  }
  expect(f.patches()).toBe(0);
});
