import { expect, test } from "@playwright/test";
import { signInWithEmail } from "./utils/test-helpers";

// Uses the optional local demo seed; all inbox writes below are intercepted.
test.skip(
  process.env.E2E_NOTIFICATION_DEMO !== "1",
  "Requires the local PT demo account",
);
for (const width of [1602, 375]) {
  test(`notification attribution, alignment and delete recovery at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 732 });
    await signInWithEmail(page, "demo.pt@repsync.test", "DemoPass123!");
    const event = {
      actor_type: "client",
      category: "checkins",
      priority: "normal",
      title: "Check-in submitted",
      body: "Zoe Ramirez submitted a check-in.",
      type: "checkin_submitted",
      action_url: "/pt/clients/zoe?tab=checkins",
      metadata: { client_name: "Zoe Ramirez" },
    };
    let rows = [
      {
        id: "notification-one",
        event_id: "event-one",
        channel: "in_app",
        status: "delivered",
        read_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        notification_events: { ...event, id: "event-one" },
      },
      {
        id: "notification-two",
        event_id: "event-two",
        channel: "in_app",
        status: "delivered",
        read_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        notification_events: {
          ...event,
          id: "event-two",
          type: "message_received",
          category: "messages",
          title: "New message from Marcus Chen",
          body: "Calf is a little tight after the bike intervals.",
          metadata: {},
        },
      },
      {
        id: "notification-three",
        event_id: "event-three",
        channel: "in_app",
        status: "delivered",
        read_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        notification_events: {
          ...event,
          id: "event-three",
          priority: "high",
          body: "Recovery is 8/10 and one blocker needs review.",
        },
      },
    ];
    let failDelete = true;
    await page.route("**/rest/v1/notification_deliveries?*", async (route) => {
      if (route.request().method() === "DELETE") {
        if (failDelete) {
          await route.fulfill({
            status: 500,
            json: { message: "Temporary delete failure" },
          });
          return;
        }
        const id = new URL(route.request().url()).searchParams
          .get("id")!
          .slice(3);
        rows = rows.filter((row) => row.id !== id);
        await route.fulfill({ json: [{ id }] });
        return;
      }
      await route.fulfill({ json: rows });
    });
    await page.goto("/pt/notifications");
    const cards = page.locator("[data-notification-id]");
    await expect(cards).toHaveCount(3);
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Archive", exact: true }),
    ).toHaveCount(0);
    await expect(cards.nth(1)).toContainText("Marcus Chen");
    await expect(cards.nth(0)).toContainText("Zoe Ramirez");
    await expect(cards.nth(2)).toContainText("Zoe Ramirez");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width > 600) {
      const positions = await cards.evaluateAll((elements) =>
        elements.map((element) => {
          const time = element.querySelector("time")!.getBoundingClientRect();
          const button = Array.from(element.querySelectorAll("button"))
            .find((b) => b.textContent === "Delete")!
            .getBoundingClientRect();
          return {
            timeX: time.x,
            timeCenter: time.y + time.height / 2,
            buttonCenter: button.y + button.height / 2,
          };
        }),
      );
      for (const position of positions) {
        expect(Math.abs(position.timeX - positions[0].timeX)).toBeLessThan(2);
        expect(
          Math.abs(position.timeCenter - position.buttonCenter),
        ).toBeLessThan(2);
      }
    }
    await page.screenshot({
      path: `test-results/notifications-${width}.png`,
      fullPage: true,
    });
    const message = page.locator('[data-notification-id="notification-two"]');
    await message.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(
      page.getByText("Temporary delete failure", { exact: true }),
    ).toBeVisible();
    await expect(message).toBeVisible();
    failDelete = false;
    await message.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(message).toHaveCount(0);
    await expect(cards).toHaveCount(2);
    await page.reload();
    await expect(cards).toHaveCount(2);
  });
}
