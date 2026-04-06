import { expect, test } from "@playwright/test";

test.describe("Smoke: auth guards and recovery", () => {
  test("Unauthenticated user is redirected to login from protected PT route", async ({
    page,
  }) => {
    await page.goto("/pt/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
  });
});
