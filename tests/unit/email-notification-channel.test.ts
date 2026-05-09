import { describe, expect, it } from "vitest";
import {
  buildEmailDeliveryPatch,
  getEmailTemplateKey,
  renderNotificationEmail,
  validateEmailTemplateVariables,
} from "../../src/features/notifications/lib/email-notification-channel";
import { resolveNotificationActionUrl } from "../../src/features/notifications/lib/notification-route-resolver";
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
    action_label: "Open workout",
    entity_type: "assigned_workout",
    entity_id: "workout-1",
    image_url: null,
    metadata: {
      recipient_name: "Sam",
      action_url: "/app/workouts/workout-1",
    },
    status: "queued",
    is_read: false,
    seen_at: null,
    read_at: null,
    archived_at: null,
    clicked_at: null,
    delivery_in_app: true,
    delivery_email: true,
    delivery_push: false,
    created_at: "2026-05-09T10:00:00.000Z",
    ...overrides,
  };
}

describe("email notification channel", () => {
  it("uses stable client and PT product template keys", () => {
    expect(getEmailTemplateKey("client", "workout_assigned")).toBe(
      "client.workout_assigned",
    );
    expect(getEmailTemplateKey("pt", "join_request_submitted")).toBe(
      "pt.join_request_submitted",
    );
  });

  it("validates required template variables before provider send", () => {
    const notification = createNotification({
      metadata: {
        recipient_name: "Sam",
      },
    });

    expect(() =>
      validateEmailTemplateVariables({
        audience: "client",
        notification,
        templateKey: "client.workout_assigned",
      }),
    ).toThrow("Missing email template variables: action_url");
  });

  it("renders escaped client-facing email content with safe Client Portal links", () => {
    const notification = createNotification({
      title: "<script>alert(1)</script>",
      metadata: {
        recipient_name: "Sam <Admin>",
        action_url: "/app/workouts/workout-1",
      },
    });

    const rendered = renderNotificationEmail({
      audience: "client",
      notification,
    });

    expect(rendered.templateKey).toBe("client.workout_assigned");
    expect(rendered.subject).toContain("Workout assigned");
    expect(rendered.html).toContain("Sam &lt;Admin&gt;");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.text).toContain("/app/workouts/workout-1");
    expect(resolveNotificationActionUrl(notification, "client")).toBe(
      "/app/workouts/workout-1",
    );
  });

  it("does not render PT workspace URLs into client email links", () => {
    const rendered = renderNotificationEmail({
      audience: "client",
      notification: createNotification({
        action_url: "/pt/clients/client-1",
        metadata: {
          recipient_name: "Sam",
          action_url: "/pt/clients/client-1",
        },
      }),
    });

    expect(rendered.text).toContain("/app/home");
    expect(rendered.html).not.toContain("/pt/clients");
  });

  it("captures provider failures as failed delivery patches", () => {
    expect(
      buildEmailDeliveryPatch({
        provider: "resend",
        status: "failed",
        failureCode: "provider_error",
        failureReason: "429 rate limit",
      }),
    ).toMatchObject({
      provider: "resend",
      status: "failed",
      failure_code: "provider_error",
      failure_reason: "429 rate limit",
    });
  });
});
