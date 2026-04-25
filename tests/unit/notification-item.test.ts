import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotificationItem } from "../../src/features/notifications/components/notification-item";
import type { NotificationRecord } from "../../src/features/notifications/lib/types";

const baseNotification: NotificationRecord = {
  id: "notif-1",
  recipient_user_id: "user-1",
  type: "message_received",
  category: "messages",
  priority: "normal",
  title: "Message received",
  body: "New message from Omar Elkasaby",
  action_url: "/pt-hub/messages",
  entity_type: "lead",
  entity_id: "lead-1",
  image_url: null,
  metadata: {},
  is_read: true,
  read_at: "2026-04-25T09:00:00.000Z",
  delivery_in_app: true,
  delivery_email: false,
  delivery_push: false,
  created_at: "2026-04-25T08:00:00.000Z",
};

describe("NotificationItem", () => {
  it("renders notification icons without the legacy bordered badge wrapper", () => {
    const markup = renderToStaticMarkup(
      React.createElement(NotificationItem, {
        notification: baseNotification,
      }),
    );

    expect(markup).not.toContain("rounded-xl border");
    expect(markup).not.toContain("section-accent-icon-badge");
  });

  it("keeps the notification icon tied to the module tone", () => {
    const markup = renderToStaticMarkup(
      React.createElement(NotificationItem, {
        notification: baseNotification,
      }),
    );

    expect(markup).toContain("section-accent-title");
  });
});
