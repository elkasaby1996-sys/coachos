import { describe, expect, it } from "vitest";
import {
  buildAssignmentNotificationEvent,
  buildProfileNotificationPreferenceDefaults,
  buildNotificationDeliveryLog,
  buildPushSubscriptionPayload,
  buildPushSubscriptionStatusUpdate,
  sanitizeNotificationActionUrl,
  shouldDeliverNotification,
} from "../../src/features/notifications/lib/notification-service";

describe("notification delivery rules", () => {
  it("creates actor-aware PT notification preference defaults", () => {
    expect(
      buildProfileNotificationPreferenceDefaults("user-1", "pt"),
    ).toMatchObject({
      user_id: "user-1",
      actor_type: "pt",
      lead_alerts: true,
      join_requests: true,
      client_onboarding: true,
      program_assigned: false,
      habit_reminders: false,
    });
  });

  it("creates actor-aware client notification preference defaults", () => {
    expect(
      buildProfileNotificationPreferenceDefaults("user-1", "client"),
    ).toMatchObject({
      user_id: "user-1",
      actor_type: "client",
      lead_alerts: false,
      join_requests: false,
      workout_assigned: true,
      program_assigned: true,
      habit_reminders: true,
    });
  });

  it("suppresses product email when email preferences are off", () => {
    expect(
      shouldDeliverNotification({
        channel: "email",
        type: "workout_assigned",
        transactional: false,
        preferences: {
          email_enabled: false,
          workout_assigned: true,
        },
      }),
    ).toBe(false);
  });

  it("allows transactional security notifications to bypass preferences", () => {
    expect(
      shouldDeliverNotification({
        channel: "email",
        type: "security",
        transactional: true,
        preferences: {
          email_enabled: false,
          system_events: false,
        },
      }),
    ).toBe(true);
  });

  it("keeps client notification links inside the client portal", () => {
    expect(
      sanitizeNotificationActionUrl({
        actorType: "client",
        url: "/pt/clients/client-1",
      }),
    ).toBe("/app/home");
  });

  it("builds idempotent client assignment events with portal links", () => {
    const event = buildAssignmentNotificationEvent({
      recipientUserId: "user-1",
      actorType: "client",
      type: "workout_assigned",
      entityType: "assigned_workout",
      entityId: "workout-1",
      title: "Workout assigned",
      body: "Your coach assigned a workout.",
      actionUrl: "/app/workouts/workout-1",
      workspaceId: "workspace-1",
    });

    expect(event.action_url).toBe("/app/workouts/workout-1");
    expect(event.idempotency_key).toBe(
      "workout_assigned:user-1:assigned_workout:workout-1",
    );
  });

  it("builds delivery logs with recipient email, provider fields, and channel idempotency", () => {
    const delivery = buildNotificationDeliveryLog({
      eventId: "event-1",
      recipientUserId: "user-1",
      recipientEmail: "client@example.com",
      type: "workout_assigned",
      templateKey: "client.workout_assigned",
      channel: "email",
      status: "queued",
      provider: "dev-log",
      idempotencyKey: "workout_assigned:user-1:assigned_workout:workout-1",
    });

    expect(delivery).toMatchObject({
      event_id: "event-1",
      recipient_user_id: "user-1",
      recipient_email: "client@example.com",
      notification_type: "workout_assigned",
      template_key: "client.workout_assigned",
      channel: "email",
      status: "queued",
      provider: "dev-log",
      retry_count: 0,
      idempotency_key:
        "workout_assigned:user-1:assigned_workout:workout-1:email",
    });
  });

  it("builds safe web-push registration payloads without sensitive notification content", () => {
    const payload = buildPushSubscriptionPayload({
      user_id: "user-1",
      endpoint: "https://push.example.com/device/1",
      p256dh: "key",
      auth: "auth-secret",
      user_agent: "Test Browser",
    });

    expect(payload).toMatchObject({
      user_id: "user-1",
      endpoint: "https://push.example.com/device/1",
      p256dh: "key",
      auth: "auth-secret",
      user_agent: "Test Browser",
      status: "active",
    });
    expect(payload).not.toHaveProperty("title");
    expect(payload).not.toHaveProperty("body");
  });

  it("marks invalid push subscriptions inactive with failure metadata", () => {
    const update = buildPushSubscriptionStatusUpdate({
      status: "invalid",
      failureReason: "410 Gone",
    });

    expect(update.status).toBe("invalid");
    expect(update.last_failure_at).toEqual(expect.any(String));
    expect(update.failure_reason).toBe("410 Gone");
  });
});
