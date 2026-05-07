import { describe, expect, it } from "vitest";
import { getNotificationTitle } from "../../src/features/notifications/lib/notification-utils";
import type { NotificationRecord } from "../../src/features/notifications/lib/types";

function createNotification(
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord {
  return {
    id: "notification-1",
    recipient_user_id: "user-1",
    type: "client_inactive",
    category: "general",
    priority: "normal",
    title: "Client inactive for 2+ days",
    body: "Omar Elkasaby has no recent activity.",
    action_url: "/pt/clients/client-1?tab=overview",
    entity_type: "client",
    entity_id: "client-1",
    image_url: null,
    metadata: {},
    is_read: false,
    read_at: null,
    delivery_in_app: true,
    delivery_email: false,
    delivery_push: false,
    created_at: "2026-04-26T12:00:00.000Z",
    ...overrides,
  };
}

describe("notification display copy", () => {
  it("names inactive clients in PT activity headlines using existing body copy", () => {
    const title = getNotificationTitle(createNotification(), "pt");

    expect(title).toBe("Omar Elkasaby inactive for 2+ days");
  });

  it("prefers client name metadata when available", () => {
    const title = getNotificationTitle(
      createNotification({
        body: "Client has no recent activity.",
        metadata: { client_name: "Sara Ahmed" },
      }),
      "pt",
    );

    expect(title).toBe("Sara Ahmed inactive for 2+ days");
  });

  it("keeps client-facing reminder titles generic", () => {
    const title = getNotificationTitle(createNotification(), "client");

    expect(title).toBe("Client inactive for 2+ days");
  });
});
