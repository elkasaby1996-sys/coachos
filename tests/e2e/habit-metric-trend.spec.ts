import { expect, test, type Page } from "@playwright/test";

async function openFixture(page: Page, mode = "normal") {
  await page.route("**/__habit-trend-fixture?*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/tests/e2e/fixtures/habit-metric-trend.tsx');
    </script></body></html>`,
    }),
  );
  await page.goto(`/__habit-trend-fixture?mode=${mode}`);
  await expect(page.getByRole("dialog")).toBeVisible();
}

for (const width of [1602, 375]) {
  test(`trend graph supports pointer and keyboard inspection at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 732 });
    await openFixture(page);
    const chart = page.getByRole("slider");
    const axisLabels = chart.locator('text[text-anchor="end"]');
    expect(await axisLabels.allTextContents()).toEqual([
      "1,942.3",
      "2,015.8",
      "2,089.3",
      "2,162.8",
    ]);
    expect(
      await axisLabels.evaluateAll((labels) =>
        labels.every(
          (label) =>
            label.getBoundingClientRect().left >=
            label.closest("svg")!.getBoundingClientRect().left,
        ),
      ),
    ).toBe(true);
    await expect(chart).toHaveAttribute("aria-valuetext", "Aug 31: 1995");
    await chart.press("ArrowRight");
    await expect(chart).toHaveAttribute("aria-valuetext", "Sep 1: 2110");
    await chart.press("End");
    await expect(chart).toHaveAttribute("aria-valuetext", "Sep 6: No entry");
    const point = chart.locator("circle").nth(2);
    await point.click();
    await expect(chart).toHaveAttribute("aria-valuetext", "Sep 2: 2035");
    await expect(page.getByText("2047", { exact: true })).toBeVisible();
    const dialog = await page.getByRole("dialog").boundingBox();
    expect(dialog!.x).toBeGreaterThanOrEqual(0);
    expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(width);
    expect(await chart.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/habit-trend-${width}.png` });
  });
}

test("missing entries break the line and zero remains a valid single point", async ({
  page,
}) => {
  await openFixture(page, "gaps");
  const path = page.getByRole("slider").locator("path");
  expect((await path.getAttribute("d"))!.match(/M/g)).toHaveLength(2);
  await openFixture(page, "single");
  await expect(page.getByRole("slider")).toHaveAttribute(
    "aria-valuetext",
    "Aug 31: 0",
  );
  await expect(page.getByRole("slider").locator("circle")).toHaveCount(1);
  expect(
    await page.getByRole("slider").locator("path").getAttribute("d"),
  ).not.toMatch(/NaN|Infinity/);
  await openFixture(page, "empty");
  await expect(page.getByText("No entries in the last 7 days.")).toBeVisible();
  await expect(page.getByRole("slider")).toHaveCount(0);
});
