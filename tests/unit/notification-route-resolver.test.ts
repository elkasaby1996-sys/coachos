import { describe, expect, it } from "vitest";
import {
  getNotificationFallbackRoute,
  resolveNotificationActionUrl,
} from "../../src/features/notifications/lib/notification-route-resolver";
import type { NotificationRecord } from "../../src/features/notifications/lib/types";

function createNotification(
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord {
  return {
    id: "delivery-1",
    event_id: "event-1",
    recipient_user_id: "user-1",
    actor_type: "client",
    type: "workout_assigned",
    category: "workouts",
    priority: "normal",
    title: "Workout assigned",
    body: "Your coach assigned a workout.",
    action_url: "/app/workouts/workout-1",
    action_label: "Open",
    entity_type: "assigned_workout",
    entity_id: "workout-1",
    image_url: null,
    metadata: {},
    status: "delivered",
    is_read: false,
    seen_at: null,
    read_at: null,
    archived_at: null,
    clicked_at: null,
    delivery_in_app: true,
    delivery_email: false,
    delivery_push: false,
    created_at: "2026-05-09T10:00:00.000Z",
    ...overrides,
  };
}

describe("notification route resolver", () => {
  it("resolves client workout notifications to Client Portal routes", () => {
    expect(resolveNotificationActionUrl(createNotification(), "client")).toBe(
      "/app/workouts/workout-1",
    );
  });

  it("resolves client file notifications to Client Portal resource fallback", () => {
    expect(
      resolveNotificationActionUrl(
        createNotification({
          type: "file_shared",
          category: "system",
          action_url: "/app/home?module=files",
          entity_type: "file",
          entity_id: "file-1",
        }),
        "client",
      ),
    ).toBe("/app/home?module=files");
  });

  it("prevents client notifications from opening PT routes", () => {
    expect(
      resolveNotificationActionUrl(
        createNotification({ action_url: "/pt/clients/client-1" }),
        "client",
      ),
    ).toBe("/app/home");
  });

  it("resolves PT join-request notifications to PT Hub review routes", () => {
    expect(
      resolveNotificationActionUrl(
        createNotification({
          actor_type: "pt",
          type: "join_request_submitted",
          action_url: "/pt-hub/leads/lead-1",
          entity_type: "lead",
          entity_id: "lead-1",
        }),
        "pt",
      ),
    ).toBe("/pt-hub/leads/lead-1");
  });

  it("falls back safely for inaccessible or deleted targets", () => {
    expect(
      resolveNotificationActionUrl(
        createNotification({
          type: "workout_assigned",
          action_url: null,
          entity_type: "assigned_workout",
          entity_id: null,
        }),
        "client",
      ),
    ).toBe(getNotificationFallbackRoute("client"));

    expect(
      resolveNotificationActionUrl(
        createNotification({
          actor_type: "pt",
          type: "join_request_submitted",
          action_url: "https://evil.example/pt-hub",
        }),
        "pt",
      ),
    ).toBe(getNotificationFallbackRoute("pt"));
  });
});
