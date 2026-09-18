import { expect, test } from "@playwright/test";
import { legalSiteConfig } from "../../src/lib/legal-site";

const publicRoutes = [
  ["/", "From first inquiry to every check-in."],
  ["/product", "The Whole Coaching Relationship, Connected."],
  [
    "/pricing",
    "Start with the clients you coach today. Grow when the operation does.",
  ],
  ["/coaches", "Find a coach who fits how you want to train."],
  ["/for-coaches", "Run the business around your coaching."],
  ["/for-clients", "Your coaching, without the clutter."],
  ["/switch", "Move only after the workflow is clear."],
  ["/compare/truecoach", "RepSync compared with TrueCoach"],
  ["/compare/fitr", "RepSync compared with FITR"],
  ["/faq", "Useful answers. No inflated claims."],
  ["/security", "Access should follow the coaching relationship."],
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms of Service"],
  ["/refunds", "Refund and Cancellation Policy"],
  ["/cookies", "Cookie notice"],
  ["/support", "How can we help?"],
] as const;

test.describe("public marketing site", () => {
  test("shows reseller terms and buyer support without a session or placeholder phone", async ({
    page,
  }) => {
    await page.route("**/auth/v1/**", (route) => route.abort());
    await page.goto("/terms");
    await expect(page.locator("[data-paddle-reseller]")).toContainText(
      "Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns",
    );
    await page.goto("/support");
    const contact = page.getByRole("region", { name: "Buyer support contact" });
    await expect(
      contact.getByRole("link", { name: "support@repsync.com" }),
    ).toHaveAttribute("href", "mailto:support@repsync.com");
    await expect(contact).not.toContainText(
      /\bTODO\b|\[PHONE\]|\+000|placeholder|example number/i,
    );
    for (const path of ["/terms", "/refunds", "/support"]) {
      await page.goto(path);
      await expect(
        page.getByRole("link", {
          name: legalSiteConfig.supportPhone,
          exact: true,
        }),
      ).toHaveAttribute("href", `tel:${legalSiteConfig.supportPhone}`);
    }
    await page.setViewportSize({ width: 375, height: 900 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("support-375.png"),
      fullPage: true,
    });
    await page.goto("/faq");
    await page
      .getByText("Does RepSync provide medical advice?", { exact: true })
      .click();
    await expect(
      page.getByText(
        /RepSync provides software tools used by independent fitness professionals/,
      ),
    ).toBeVisible();
  });
  for (const [route, heading, section] of [
    ["/privacy", "Privacy Policy", "18. Contact"],
    ["/terms", "Terms of Service", "25. Contact"],
    ["/refunds", "Refund and Cancellation Policy", "14. Contact"],
  ]) {
    test(`makes ${route} public, complete, and indexable without a session`, async ({
      page,
    }) => {
      await page.route("**/auth/v1/**", (route) => route.abort());
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: section, exact: true }),
      ).toBeAttached();
      await expect(page.locator("main")).toContainText("Operated by: RepSync");
      await expect(page.locator("main")).not.toContainText(
        "[LEGAL OPERATOR NAME]",
      );
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page).not.toHaveTitle(/Interim/i);
      for (const name of ["robots", "googlebot"])
        await expect(page.locator(`meta[name="${name}"]`)).toHaveAttribute(
          "content",
          "index,follow",
        );
      for (const [path, label] of [
        ["/privacy", "Privacy Policy"],
        ["/terms", "Terms of Service"],
        ["/refunds", "Refund Policy"],
      ])
        await expect(
          page
            .locator("footer")
            .getByRole("link", { name: label, exact: true }),
        ).toHaveAttribute("href", path);
    });
  }

  test("serves all three complete policies without JavaScript or authentication", async ({
    browser,
  }, testInfo) => {
    test.skip(
      !testInfo.config.configFile?.endsWith("public-marketing.config.ts"),
      "Requires the built-site public-only configuration.",
    );
    const context = await browser.newContext({
      javaScriptEnabled: false,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    try {
      for (const [path, title] of [
        ["privacy", "Privacy Policy"],
        ["terms", "Terms of Service"],
        ["refunds", "Refund and Cancellation Policy"],
      ]) {
        const response = await page.goto(`http://127.0.0.1:4175/${path}/`);
        expect(response?.status()).toBe(200);
        if (path !== "privacy") {
          await expect(
            page.getByRole("link", {
              name: legalSiteConfig.supportPhone,
              exact: true,
            }),
          ).toHaveAttribute("href", `tel:${legalSiteConfig.supportPhone}`);
        }
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
        await expect(page.locator("main")).toContainText(
          "Operated by: RepSync",
        );
        await expect(page.locator("main")).not.toContainText(
          "[LEGAL OPERATOR NAME]",
        );
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
          "content",
          "index,follow",
        );
      }
    } finally {
      await context.close();
    }
  });

  test("keeps legal text and footer readable at phone, tablet, and desktop widths", async ({
    page,
  }, testInfo) => {
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/terms");
      await expect(
        page.getByRole("heading", { name: "Terms of Service", exact: true }),
      ).toBeVisible();
      await expect(page.locator("main")).toContainText(
        "RepSync itself does not provide personal training",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      if (width === 375 || width === 1440)
        await page.screenshot({
          path: testInfo.outputPath(`legal-${width}.png`),
        });
    }
  });

  test("shows the v1 commercial prices and retains paid-plan intent", async ({
    page,
  }) => {
    await page.goto("/pricing");
    const cards = page.locator(".rs-pricing-plan");
    await expect(cards).toHaveCount(3);
    for (const [index, name, price, clients, workspaces] of [
      [0, "Launch", "$19", 10, "1 workspace"],
      [1, "Growth", "$59", 50, "3 workspaces"],
      [2, "Scale", "$119", 100, "5 workspaces"],
    ] as const) {
      const card = cards.nth(index);
      await expect(card.locator(".rs-stitch-kicker")).toHaveText(name);
      await expect(card.locator(".rs-pricing-plan__price strong")).toHaveText(
        price,
      );
      await expect(card).toContainText(`Client capacity: ${clients}`);
      await expect(card).toContainText(workspaces);
    }
    await expect(
      page.locator(".rs-pricing-plan--featured .rs-stitch-kicker"),
    ).toHaveText("Growth");
    await page.getByRole("button", { name: "Annual" }).click();
    await expect(cards.locator(".rs-pricing-plan__price strong")).toHaveText([
      "$190",
      "$590",
      "$1,190",
    ]);
    await cards
      .nth(2)
      .getByRole("link", { name: "Start 14-day trial" })
      .click();
    await expect(page).toHaveURL(/\/signup\/pt\?plan=scale$/);
    await expect(
      page.getByRole("heading", { name: "Start your 14-day Growth trial" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Scale is your intended paid plan/),
    ).toBeVisible();
  });

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
        name: "The coaching relationship does not begin with a workout.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Acquire, coach, and retain from the same operating rhythm.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Clear for the coach. Calm for the client.",
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
      page.getByRole("link", { name: "Start 14-day trial" }).first(),
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
      page.getByRole("heading", { name: "Start your 14-day Growth trial" }),
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
        name: "Every category needs an honest support state.",
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
      page.getByText("Private areas require authenticated accounts"),
    ).toBeVisible();

    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: "Account and identity information" }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "index,follow",
    );

    await page.goto("/terms");
    await expect(
      page.getByRole("heading", {
        name: "2. Coaches and clients are independent",
      }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "index,follow",
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
        name: "10 chapters. One coaching relationship.",
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
        name: "Know whether RepSync fits before you start.",
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
