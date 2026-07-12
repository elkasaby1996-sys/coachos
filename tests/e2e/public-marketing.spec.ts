import { expect, test } from "@playwright/test";

const publicRoutes = [
  ["/", "More than workout delivery. Run the whole coaching business."],
  ["/product", "One system for the whole coaching relationship."],
  ["/for-coaches", "Run a more organized coaching business without making coaching feel corporate."],
  ["/for-clients", "Everything your coach needs you to see, in one clear place."],
  ["/switch", "Move the coaching business, not just the workout library."],
  ["/compare/truecoach", "Considering a move from TrueCoach?"],
  ["/compare/fitr", "Considering a move from FITR?"],
  ["/faq", "Useful answers. No inflated claims."],
  ["/security", "Access should follow the coaching relationship."],
  ["/request-access", "Tell us how your coaching business works."],
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

  test("shows readable homepage and product preview evidence", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: "Built for the work around the workout.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Lifecycle and attention stay separate.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Give coaches the right view of shared work.",
      }),
    ).toBeVisible();
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
    await expect(page.getByText("Migration needs", { exact: true })).toBeVisible();
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
    await expect(page.evaluate(() => localStorage.getItem("repsync_analytics_consent"))).resolves.toBe(
      "rejected",
    );

    await page.getByRole("button", { name: "Manage cookies" }).click();
    await page.getByRole("button", { name: "Accept analytics" }).click();
    await expect(page.evaluate(() => localStorage.getItem("repsync_analytics_consent"))).resolves.toBe(
      "accepted",
    );
  });

  test("renders complete trust, legal, FAQ, and cookie launch content", async ({
    page,
  }) => {
    await page.goto("/security");
    await expect(page.getByText("Supabase authentication")).toBeVisible();
    await expect(page.getByText("Claims not made")).toBeVisible();
    await expect(page.getByText("SOC 2")).toBeVisible();

    await page.goto("/faq");
    await expect(page.getByRole("heading", { name: "Security and privacy" })).toBeVisible();
    await page.getByRole("button", { name: "Reject optional" }).click();
    await page.getByText("How is access controlled?").click();
    await expect(page.getByText("Private areas require authenticated accounts")).toBeVisible();

    await page.goto("/privacy");
    await expect(page.getByText("Legal approval: Required before production launch")).toBeVisible();
    await expect(page.getByText("Marketing-form information")).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByText("Early access behavior")).toBeVisible();
    await expect(page.getByText("migration completeness")).toBeVisible();

    await page.goto("/cookies");
    await expect(page.getByRole("heading", { name: "Essential" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  });

  test("renders complete product, coach, and client marketing evidence", async ({
    page,
  }) => {
    await page.goto("/product");
    await expect(
      page.getByRole("heading", { name: "One relationship, seven connected moments." }),
    ).toBeVisible();
    await expect(page.getByText("Public coach profile").first()).toBeVisible();
    await expect(page.getByText("Not currently available").first()).toBeVisible();
    await expect(page.getByText("Lifecycle: Active").first()).toBeVisible();
    await expect(page.getByText("Lifecycle: At risk")).toHaveCount(0);

    await page.goto("/for-coaches");
    await expect(
      page.getByRole("heading", { name: "RepSync is a good fit when..." }),
    ).toBeVisible();
    await expect(page.getByText("You need automated billing immediately.")).toBeVisible();

    await page.goto("/for-clients");
    await expect(page.getByRole("link", { name: "I have an invitation" }).first()).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: "Log in" }).first()).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: "I am looking for a coach" }).first()).toHaveAttribute("href", "/coaches");
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
        await expect(page.locator(".rs-preview-card").first()).toBeVisible();
      }
    }
  });

  test("submits request-access form successfully without duplicate requests", async ({
    page,
  }) => {
    let submitCount = 0;
    await page.route("**/functions/v1/marketing-lead-submit", async (route) => {
      submitCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, id: "lead_test" }),
      });
    });

    await page.goto("/request-access");
    await page.getByLabel("First name").fill("Maya");
    await page.getByLabel("Last name").fill("Coach");
    await page.getByLabel("Email").fill("maya@example.com");
    await page.getByLabel("Coaching model").selectOption("online");
    await page.getByLabel("Active clients").selectOption("6_20");
    await page.getByLabel("Primary reason").selectOption("lead_to_client");
    await page.getByLabel(/I agree RepSync can contact me/).check();

    const submit = page.getByRole("button", { name: "Request early access" });
    await Promise.all([submit.click(), submit.click()]);

    await expect(page.getByRole("status")).toContainText(
      "Thanks. Your early access request has been received.",
    );
    expect(submitCount).toBe(1);
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
