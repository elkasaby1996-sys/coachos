import { expect, test } from "@playwright/test";

const publicRoutes = [
  ["/", "Manage clients and deliver coaching."],
  ["/product", "Run your client workflow in RepSync."],
  ["/pricing", "Choose a plan for your current client load."],
  ["/coaches", "Search published coach profiles."],
  ["/for-coaches", "Manage the work around your coaching."],
  ["/for-clients", "See today's coaching in one place."],
  ["/switch", "Plan your move to RepSync."],
  ["/compare/truecoach", "Compare RepSync with TrueCoach"],
  ["/compare/fitr", "Compare RepSync with FITR"],
  ["/faq", "Answers about using RepSync."],
  ["/security", "Private coaching data requires authenticated access."],
  ["/privacy", "Interim privacy notice"],
  ["/terms", "Interim terms of use"],
  ["/cookies", "Cookie notice"],
  ["/support", "Contact RepSync support."],
] as const;

test.describe("public marketing site", () => {
  for (const [route, heading] of publicRoutes) {
    test(`renders ${route} without mobile overflow`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await page.goto(route);

      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      const hasOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(hasOverflow).toBe(false);
    });
  }

  test("connects the full coaching journey to working product evidence", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: "Keep the full client record from application onward.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Handle sales, delivery, and follow-up in RepSync.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Give clients a clear view of today's coaching.",
      }),
    ).toBeVisible();
    await expect(page.getByText("Lifecycle: Active").first()).toBeVisible();
    await expect(page.getByText("Attention: At risk").first()).toBeVisible();
    await expect(page.locator(".rs-stitch-preview__motion video")).toHaveCount(
      2,
    );
    await expect(page.getByText(/Planned media/i)).toHaveCount(0);
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

  test("keeps the coach trial entry short and focused", async ({ page }) => {
    await page.goto("/start-trial");

    await expect(page).toHaveURL(/\/signup\/pt$/);
    await expect(
      page.getByRole("heading", { name: "Start your 7-day Growth trial" }),
    ).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Email", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Phone number")).toHaveCount(0);
    await expect(page.getByLabel("Country")).toHaveCount(0);
    await expect(page.getByLabel("City")).toHaveCount(0);
  });

  test("plays the hero workflow and respects reduced motion", async ({
    browser,
    page,
  }) => {
    await page.goto("/");
    const videos = page.locator(".rs-stitch-preview__motion video");
    const video = videos.first();

    await expect(videos).toHaveCount(2);
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

  test("sets clear migration expectations before a switch", async ({
    page,
  }) => {
    await page.goto("/switch");
    await expect(
      page.getByRole("heading", {
        name: "Confirm the transfer method for each data type.",
      }),
    ).toBeVisible();
    await expect(page.getByText("Not currently supported")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "RepSync vs TrueCoach" }),
    ).toHaveAttribute("href", "/compare/truecoach");
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
      page.getByRole("dialog", { name: "Analytics preferences" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Decline" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.evaluate(() => localStorage.getItem("repsync_analytics_consent")),
    ).resolves.toBe("rejected");

    await page.goto("/cookies");
    await page.getByRole("button", { name: "Allow analytics" }).click();
    await expect(
      page.evaluate(() => localStorage.getItem("repsync_analytics_consent")),
    ).resolves.toBe("accepted");
  });

  test("renders complete trust, legal, FAQ, and cookie launch content", async ({
    page,
  }) => {
    await page.goto("/security");
    await expect(page.getByText("Authenticated private areas")).toBeVisible();
    await expect(page.getByText("Controlled data paths")).toBeVisible();
    await expect(page.getByText("SOC 2")).toBeVisible();

    await page.goto("/faq");
    await expect(
      page.getByRole("heading", { name: "Security and privacy" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Decline" }).click();
    await page.getByText("How is access controlled?").click();
    await expect(
      page.getByText("Private areas require an authenticated account"),
    ).toBeVisible();

    await page.goto("/privacy");
    await expect(
      page.getByText("Account and profile information"),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex,nofollow",
    );

    await page.goto("/terms");
    await expect(page.getByText("Coach responsibility")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex,nofollow",
    );

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
        name: "Review each part of the client workflow.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("Public coach profile").first()).toBeVisible();
    await expect(page.getByText("Lifecycle").first()).toBeVisible();
    await expect(page.getByText("At risk").first()).toBeVisible();
    await expect(page.getByText("Lifecycle: At risk")).toHaveCount(0);

    await page.goto("/for-coaches");
    await expect(
      page.getByRole("heading", {
        name: "Check whether RepSync matches your coaching business.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Automated billing is required immediately."),
    ).toBeVisible();

    await page.goto("/for-clients");
    await expect(
      page.getByRole("link", { name: "I have an invitation" }).first(),
    ).toHaveAttribute("href", "/signup/client");
    await expect(
      page.getByRole("link", { name: "Log in" }).first(),
    ).toHaveAttribute("href", "/login");
    await expect(
      page.getByRole("link", { name: "Browse coaches" }).first(),
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
          await expect(
            page.locator(".rs-stitch-preview").first(),
          ).toBeVisible();
        }
      }
    }
  });

  test("renders branded public 404", async ({ page }) => {
    await page.goto("/not-a-real-public-page");

    await expect(
      page.getByRole("heading", {
        name: "Page not found",
        exact: true,
      }),
    ).toBeVisible();
  });
});
