import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/pages/pt-hub/settings/tabs/notifications.tsx",
  "utf8",
);
const notificationHooksSource = readFileSync(
  "src/features/notifications/hooks/use-notifications.ts",
  "utf8",
);
const notificationApiSource = readFileSync(
  "src/features/notifications/api/notifications.ts",
  "utf8",
);

describe("PT Hub notification settings contract", () => {
  it("writes PT product notification preferences to the canonical notification preference table", () => {
    expect(source).toContain("useNotificationPreferences");
    expect(source).toContain("useUpdateNotificationPreferences");
    expect(source).toContain("lead_alerts");
    expect(source).toContain("join_requests");
    expect(source).toContain("weekly_digest");
    expect(source).toContain("product_updates");
  });

  it("updates actor-aware notification preference cache entries after save", () => {
    expect(notificationHooksSource).toContain("setQueriesData");
    expect(notificationHooksSource).toContain(
      "queryKey: notificationsKeys.preferences(userId)",
    );
  });

  it("loads the PT-specific preference columns that the settings tab saves", () => {
    expect(notificationApiSource).toContain("actor_type");
    expect(notificationApiSource).toContain("lead_alerts");
    expect(notificationApiSource).toContain("join_requests");
    expect(notificationApiSource).toContain("client_escalation");
    expect(notificationApiSource).toContain("missed_checkins");
    expect(notificationApiSource).toContain("client_onboarding");
    expect(notificationApiSource).toContain("weekly_digest");
    expect(notificationApiSource).toContain("product_updates");
  });
});
