import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

const apiSource = readSource(
  "src",
  "features",
  "notifications",
  "api",
  "notifications.ts",
);
const typesSource = readSource(
  "src",
  "features",
  "notifications",
  "lib",
  "types.ts",
);
const pageSource = readSource(
  "src",
  "features",
  "notifications",
  "pages",
  "notifications-page.tsx",
);
const bellSource = readSource(
  "src",
  "features",
  "notifications",
  "components",
  "notification-bell.tsx",
);
const appRoutes = readSource("src", "routes", "app.tsx");
const ptHubLayout = readSource(
  "src",
  "components",
  "layouts",
  "pt-hub-layout.tsx",
);

describe("delivery-backed notification center contract", () => {
  it("reads inbox items from in-app notification deliveries joined to events", () => {
    expect(apiSource).toContain('.from("notification_deliveries")');
    expect(apiSource).toContain("notification_events");
    expect(apiSource).toContain('.eq("channel", "in_app")');
    expect(apiSource).toContain("suppressed_preference");
    expect(apiSource).not.toContain('.from("notifications")');
  });

  it("supports read, unread, archive, and click state on deliveries", () => {
    expect(apiSource).toContain("markNotificationRead");
    expect(apiSource).toContain("markNotificationUnread");
    expect(apiSource).toContain("archiveNotification");
    expect(apiSource).toContain("clicked_at");
    expect(typesSource).toContain('"action-required"');
    expect(typesSource).toContain('"archived"');
  });

  it("renders the full center filters required for the inbox", () => {
    expect(pageSource).toContain('value="all"');
    expect(pageSource).toContain('value="unread"');
    expect(pageSource).toContain('value="action-required"');
    expect(pageSource).toContain('value="archived"');
    expect(pageSource).toContain("Archive");
    expect(pageSource).toContain("Mark unread");
  });

  it("keeps the PT notifications page concise", () => {
    expect(pageSource).toContain('showActionLabel={audience !== "pt"}');
    expect(pageSource).toContain('showTitle={audience !== "pt"}');
    expect(pageSource).toContain('showTypeLabel={audience !== "pt"}');
    expect(pageSource).toContain(
      'surface={audience === "pt" ? "embedded" : "card"}',
    );
    expect(pageSource).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(pageSource).not.toContain(
      "Track the latest workspace activity and open anything that needs attention.",
    );
    expect(pageSource).not.toContain("Everything reviewed");
    expect(pageSource).not.toContain(
      "Use All to revisit recent workspace activity whenever you need context.",
    );
  });

  it("keeps the PT mark-all action beside the notification list heading", () => {
    const workspaceHeaderBlock = pageSource.match(
      /<WorkspacePageHeader[\s\S]*?\/>/,
    )?.[0];

    expect(workspaceHeaderBlock).toBeTruthy();
    expect(workspaceHeaderBlock).not.toContain("Mark all as read");
    expect(pageSource).toContain('className="self-start"');
    expect(pageSource).toContain("Mark all as read");
  });

  it("keeps PT Hub notifications reachable from the PT Hub shell", () => {
    expect(appRoutes).toContain('path="notifications"');
    expect(appRoutes).toContain("<PtHubNotificationsPage />");
    expect(ptHubLayout).toContain("NotificationBell");
    expect(ptHubLayout).toContain('viewAllHref="/pt-hub/notifications"');
  });

  it("keeps the bell scoped to the delivery-backed unread count", () => {
    expect(bellSource).toContain("useUnreadNotificationCount");
    expect(bellSource).toContain("99+");
    expect(bellSource).toContain("onNotificationClick");
  });
});
