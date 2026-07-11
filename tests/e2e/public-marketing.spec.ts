import { expect, test } from "@playwright/test";

const publicRoutes = [
  ["/", "More than workout delivery. Run the whole coaching business."],
  ["/product", "One system for the whole coaching relationship."],
  ["/for-coaches", "Look premium before the call. Stay organized after the sale."],
  ["/for-clients", "Find a coach, apply clearly, and know what to do next."],
  ["/switch", "Moving coaching systems should start with the workflow."],
  ["/compare/truecoach", "RepSync vs TrueCoach"],
  ["/compare/fitr", "RepSync vs FITR"],
  ["/faq", "Useful answers. No inflated claims."],
  ["/security", "Clear security language for an early access product."],
  ["/request-access", "Tell us how your coaching business works."],
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms of Service"],
  ["/cookies", "Cookie notice"],
] as const;

test.describe("public marketing site", () => {
  for (const [route, heading] of publicRoutes) {
    test(`renders ${route} without mobile overflow`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await page.goto(route);

      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      const hasOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(hasOverflow).toBe(false);
    });
  }

  test("shows readable homepage and product preview evidence", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByText("Programs, nutrition, habits").first()).toBeVisible();
    await expect(page.getByText("Lifecycle: Active").first()).toBeVisible();
    await expect(page.getByText("Attention: At risk").first()).toBeVisible();
    await expect(page.getByText("Lifecycle: At risk")).toHaveCount(0);
  });

  test("routes primary CTAs to early access and switching paths", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: "Request early access" }).first(),
    ).toHaveAttribute("href", "/request-access");
    await expect(
      page.getByRole("link", { name: "Plan your switch" }).first(),
    ).toHaveAttribute("href", "/switch");
    await expect(
      page.getByRole("link", { name: "See the product" }).first(),
    ).toHaveAttribute("href", "/product");
  });

  test("validates complete request access and switch forms", async ({
    page,
  }) => {
    await page.goto("/request-access");
    await page.getByRole("button", { name: "Request early access" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Enter your first name.",
    );

    await page.goto("/switch");
    await expect(page.getByLabel("Switching timeline")).toBeVisible();
    await expect(page.getByLabel("Team size")).toBeVisible();
    await expect(page.getByLabel("Data to move")).toBeVisible();
    await page.getByRole("button", { name: "Plan your switch" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Enter your first name.",
    );
  });

  test("renders branded public 404", async ({ page }) => {
    await page.goto("/not-a-real-public-page");

    await expect(
      page.getByRole("heading", {
        name: "This page is not in the coaching plan.",
      }),
    ).toBeVisible();
  });
});
