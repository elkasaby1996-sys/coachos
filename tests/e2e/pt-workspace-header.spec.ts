import { expect, test } from "@playwright/test";
import { signInWithEmail } from "./utils/test-helpers";

test.skip(
  process.env.E2E_WORKSPACE_DEMO !== "1",
  "Requires the local PT demo account",
);
test("workspace header stays within its available width in both sidebar states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1602, height: 732 });
  await page.addInitScript(() =>
    localStorage.setItem("coachos-pt-sidebar-collapsed", "false"),
  );
  await signInWithEmail(page, "demo.pt@repsync.test", "DemoPass123!");
  await page.goto("/w/mercer-performance-lab/clients");
  const header = page.locator(".pt-workspace-shell-utilities");
  await expect(header).toBeVisible({ timeout: 30000 });
  for (const width of [1024, 1280, 1440, 1602]) {
    await page.setViewportSize({ width, height: 732 });
    for (const collapsed of [false, true]) {
      const toggle = page.getByRole("button", {
        name: collapsed ? "Collapse navigation" : "Expand navigation",
        exact: true,
      });
      if (await toggle.isVisible()) await toggle.click();
      await expect(
        page.getByRole("button", {
          name: collapsed ? "Expand navigation" : "Collapse navigation",
          exact: true,
        }),
      ).toBeVisible();
      const frame = (await header.boundingBox())!;
      for (const name of ["Workspace menu", "Profile menu"]) {
        const control = page.getByRole("button", { name, exact: true });
        const bounds = (await control.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(frame.x);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(
          frame.x + frame.width + 1,
        );
        expect(bounds.x + bounds.width).toBeLessThan(width);
      }
      if (width >= 1280) {
        const search = (await page
          .getByRole("searchbox", { name: "Search workspace", exact: true })
          .boundingBox())!;
        const actions = (await page
          .locator(".pt-workspace-header-action-cluster")
          .boundingBox())!;
        expect(search.width).toBeGreaterThan(150);
        expect(search.x + search.width).toBeLessThanOrEqual(actions.x);
      } else {
        await expect(
          page.getByRole("button", { name: "Open workspace search" }),
        ).toBeVisible();
      }
      await header.screenshot({
        path: `test-results/header-${width}-${collapsed ? "collapsed" : "expanded"}.png`,
      });
    }
  }
  await page.getByRole("button", { name: "Profile menu", exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.goto("/w/mercer-performance-lab/clients");
  await page
    .getByRole("button", { name: "Workspace menu", exact: true })
    .click();
  await expect(page.getByRole("menu")).toBeVisible();
});
