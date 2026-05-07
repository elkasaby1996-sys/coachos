import { describe, expect, it } from "vitest";
import {
  buildAssignmentNotificationEvent,
  sanitizeNotificationActionUrl,
  shouldDeliverNotification,
} from "../../src/features/notifications/lib/notification-service";

describe("notification delivery rules", () => {
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
});
