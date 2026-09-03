import { expect, test } from "@playwright/test";

const chapterIds = [
  "acquire",
  "onboard",
  "training",
  "nutrition-habits",
  "messaging",
  "check-ins",
  "client-attention",
  "operations-analytics",
  "client-experience",
  "team-access",
];

test.describe("public product page", () => {
  test("renders ten available chapter links and trial actions", async ({
    page,
  }) => {
    await page.goto("/product");
    const nav = page.getByRole("navigation", {
      name: "Product deep-dive chapters",
    });
    await expect(nav.getByRole("link")).toHaveCount(chapterIds.length);

    for (const id of chapterIds) {
      await expect(nav.locator(`a[href="#${id}"]`)).toHaveCount(1);
      await expect(page.locator(`section#${id}`)).toHaveCount(1);
    }

    await expect(
      page.getByRole("link", { name: "Start 7-day trial" }).first(),
    ).toHaveAttribute("href", "/start-trial");
    await expect(
      page.getByRole("link", { name: "Explore for coaches" }),
    ).toHaveAttribute("href", "/for-coaches");
  });

  test("supports direct hashes, history, and current chapter state", async ({
    page,
  }) => {
    await page.goto("/product#messaging");
    await expect(page.locator("section#messaging")).toBeInViewport();
    await expect(
      page.locator('a[href="#messaging"][aria-current="location"]'),
    ).toBeVisible();

    await page.locator('a[href="#team-access"]').first().click();
    await expect(page).toHaveURL(/#team-access$/);
    await expect(
      page.locator('a[href="#team-access"][aria-current="location"]'),
    ).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/#messaging$/);
  });

  test("keeps lifecycle and attention separate and hides unverified integrations", async ({
    page,
  }) => {
    await page.goto("/product#client-attention");
    const attention = page.locator("#client-attention");
    await expect(
      attention.getByText("Active", { exact: true }).first(),
    ).toBeVisible();
    await expect(attention.getByText("At risk", { exact: true })).toBeVisible();
    await expect(attention.getByText("Missed latest check-in")).toBeVisible();
    await expect(page.getByText("Lifecycle: At risk")).toHaveCount(0);

    await expect(page.getByText("WHOOP", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Garmin", { exact: true })).toHaveCount(0);
    await expect(page.locator("section#integrations")).toHaveCount(0);
    await expect(
      page.getByText("No public integrations are listed yet."),
    ).toHaveCount(0);
  });

  test("renders the public coach-profile video and complete SEO metadata", async ({
    page,
  }) => {
    await page.goto("/product");
    await expect(page.locator(".rs-product-ref-media").first()).toBeVisible();
    await expect(
      page.locator(
        '.rs-product-ref-media video[src*="repsync-public-coach-profiles.webm"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        '.rs-product-ref-media img[src*="repsync-client-experience-poster.png"]',
      ),
    ).toBeVisible();
    await expect(page.locator(".rs-product-capture").first()).toBeVisible();
    await expect(page.getByText("MEDIA PLACEHOLDER")).toHaveCount(0);
    await expect(page).toHaveTitle(
      "RepSync Product | The Whole Coaching Relationship",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/product$/,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "The Whole Coaching Relationship, Connected | RepSync",
    );
  });

  test("uses an accessible mobile selector without overflow", async ({
    page,
  }) => {
    for (const width of [320, 375, 390, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/product");
      const hasOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(hasOverflow, `overflow at ${width}px`).toBe(false);

      if (width <= 1024) {
        const selector = page.getByLabel("Current product chapter");
        await expect(selector).toBeVisible();
        await selector.selectOption("check-ins");
        await expect(page).toHaveURL(/#check-ins$/);
        await expect(page.locator("#client-attention")).toHaveCSS(
          "background-color",
          "rgb(20, 23, 17)",
        );
      }
    }
  });
});
