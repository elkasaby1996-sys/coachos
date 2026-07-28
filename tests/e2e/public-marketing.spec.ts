import { expect, test } from "@playwright/test";

const publicRoutes = [
  ["/", "From first inquiry to every check-in."],
  ["/product", "The Whole Coaching Relationship, Connected."],
  [
    "/for-coaches",
    "Run a more organized coaching business without making coaching feel corporate.",
  ],
  [
    "/for-clients",
    "Everything your coach needs you to see, in one clear place.",
  ],
  ["/switch", "Move the coaching business, not just the workout library."],
  ["/compare/truecoach", "Considering a move from TrueCoach?"],
  ["/compare/fitr", "Considering a move from FITR?"],
  ["/faq", "Useful answers. No inflated claims."],
  ["/security", "Access should follow the coaching relationship."],
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms of Service"],
  ["/cookies", "Cookie notice and analytics preferences."],
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

  test("tells the coach-week story with product and human evidence", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: "Know the workload before it gets loud.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Give attention where it changes the week.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Keep the conversation close to the work.",
      }),
    ).toBeVisible();
    await expect(page.getByText("Sample week").first()).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "A coach's week" }),
    ).toBeVisible();
    await expect(page.getByText("32 sessions").first()).toBeVisible();
    await expect(page.getByText("Maya L.").first()).toBeVisible();
    await expect(page.locator(".rs-week-photo img")).toHaveCount(4);
  });

  test("routes primary CTAs to trial, product, and switching paths", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: "Start 7-day trial" }).first(),
    ).toHaveAttribute("href", "/start-trial");
    await expect(
      page.getByRole("link", { name: "Plan your switch" }).first(),
    ).toHaveAttribute("href", "/switch");
    await expect(
      page.getByRole("link", { name: "Explore the product" }).first(),
    ).toHaveAttribute("href", "/product");
  });

  test("plays the hero workflow and respects reduced motion", async ({
    browser,
    page,
  }) => {
    await page.goto("/");
    const video = page.locator(".rs-stitch-preview__motion video");

    await expect(video).toHaveCount(1);
    expect(await video.evaluate((element) => element.muted)).toBe(true);
    await expect
      .poll(() => video.evaluate((element) => element.currentTime))
      .toBeGreaterThan(0);

    const reducedMotionContext = await browser.newContext({
      reducedMotion: "reduce",
    });
    const reducedMotionPage = await reducedMotionContext.newPage();
    await reducedMotionPage.goto("/");

    await expect(
      reducedMotionPage.locator(".rs-stitch-preview__motion video"),
    ).toHaveCount(0);
    await expect(
      reducedMotionPage.locator(
        '.rs-stitch-preview__motion img[src*="repsync-workflow-poster.png"]',
      ),
    ).toBeVisible();

    await reducedMotionContext.close();
  });

  test("validates the switch form", async ({ page }) => {
    await page.goto("/switch");
    await expect(page.getByLabel("Switching timeline")).toBeVisible();
    await expect(page.getByLabel("Team size")).toBeVisible();
    await expect(
      page.getByText("Migration needs", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Plan your switch" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Enter your first name.",
    );
  });

  test("gates marketing analytics behind cookie consent", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto("/product");

    const eventCount = await page.evaluate(() => {
      let count = 0;
      window.addEventListener("repsync:marketing-event", () => {
        count += 1;
      });
      return new Promise<number>((resolve) => {
        setTimeout(() => resolve(count), 50);
      });
    });
    expect(eventCount).toBe(0);

    await expect(
      page.getByRole("dialog", { name: "Choose optional analytics." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reject optional" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.evaluate(() => localStorage.getItem("repsync_analytics_consent")),
    ).resolves.toBe("rejected");

    await page.getByRole("button", { name: "Manage cookies" }).click();
    await page.getByRole("button", { name: "Accept analytics" }).click();
    await expect(
      page.evaluate(() => localStorage.getItem("repsync_analytics_consent")),
    ).resolves.toBe("accepted");
  });

  test("renders complete trust, legal, FAQ, and cookie launch content", async ({
    page,
  }) => {
    await page.goto("/security");
    await expect(page.getByText("Supabase authentication")).toBeVisible();
    await expect(page.getByText("Claims not made")).toBeVisible();
    await expect(page.getByText("SOC 2")).toBeVisible();

    await page.goto("/faq");
    await expect(
      page.getByRole("heading", { name: "Security and privacy" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reject optional" }).click();
    await page.getByText("How is access controlled?").click();
    await expect(
      page.getByText("Private areas require authenticated accounts"),
    ).toBeVisible();

    await page.goto("/privacy");
    await expect(
      page.getByText("Legal approval: Required before production launch"),
    ).toBeVisible();
    await expect(page.getByText("Marketing-form information")).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByText("Early access behavior")).toBeVisible();
    await expect(page.getByText("migration completeness")).toBeVisible();

    await page.goto("/cookies");
    await expect(
      page.getByRole("heading", { name: "Essential" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Analytics", exact: true }),
    ).toBeVisible();
  });

  test("renders complete product, coach, and client marketing evidence", async ({
    page,
  }) => {
    await page.goto("/product");
    await expect(
      page.getByRole("heading", {
        name: "Eleven chapters. One coaching relationship.",
      }),
    ).toBeVisible();
    await expect(page.getByText("Public coach profile").first()).toBeVisible();
    await expect(page.getByText("Lifecycle").first()).toBeVisible();
    await expect(page.getByText("At risk").first()).toBeVisible();
    await expect(page.getByText("Lifecycle: At risk")).toHaveCount(0);

    await page.goto("/for-coaches");
    await expect(
      page.getByRole("heading", { name: "RepSync is a good fit when..." }),
    ).toBeVisible();
    await expect(
      page.getByText("You need automated billing immediately."),
    ).toBeVisible();

    await page.goto("/for-clients");
    await expect(
      page.getByRole("link", { name: "I have an invitation" }).first(),
    ).toHaveAttribute("href", "/login");
    await expect(
      page.getByRole("link", { name: "Log in" }).first(),
    ).toHaveAttribute("href", "/login");
    await expect(
      page.getByRole("link", { name: "I am looking for a coach" }).first(),
    ).toHaveAttribute("href", "/coaches");
  });

  test("keeps product and audience pages responsive at key widths", async ({
    page,
  }) => {
    for (const width of [320, 768, 1280]) {
      for (const route of ["/product", "/for-coaches", "/for-clients"]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        const hasOverflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        );
        expect(hasOverflow).toBe(false);
        if (route === "/product") {
          await expect(
            page.locator("[data-product-chapter]").first(),
          ).toBeVisible();
        } else {
          await expect(page.locator(".rs-preview-card").first()).toBeVisible();
        }
      }
    }
  });

  test("shows retryable backend failure on switch form", async ({ page }) => {
    await page.route("**/functions/v1/marketing-lead-submit", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary backend failure" }),
      });
    });

    await page.goto("/switch");
    await page.getByLabel("First name").fill("Maya");
    await page.getByLabel("Last name").fill("Coach");
    await page.getByLabel("Email").fill("maya@example.com");
    await page.getByLabel("Business name").fill("Maya Strength");
    await page.getByLabel("Coaching model").selectOption("online");
    await page.getByLabel("Active clients").selectOption("6_20");
    await page.getByLabel("Current platform").selectOption("truecoach");
    await page.getByLabel("Primary reason").selectOption("lead_to_client");
    await page.getByLabel("Switching timeline").selectOption("within_90_days");
    await page.getByLabel("Team size").selectOption("solo");
    await page.getByLabel("Client information").check();
    await page.getByLabel("Active programs").check();
    await page.getByLabel("Check-ins").check();
    await page.getByLabel(/I agree RepSync can contact me/).check();

    await page.getByRole("button", { name: "Plan your switch" }).click();

    await expect(page.getByRole("status")).toContainText(
      "Edge Function returned a non-2xx status code",
    );
    await expect(
      page.getByRole("button", { name: "Plan your switch" }),
    ).toBeEnabled();
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
