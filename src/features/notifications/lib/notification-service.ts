import { supabase } from "../../../lib/supabase";
import type {
  NotificationChannel,
  NotificationEvent,
  NotificationPreferences,
  NotificationType,
  PushSubscriptionInput,
} from "./types";

type PreferenceKey =
  | keyof Pick<
      NotificationPreferences,
      | "workout_assigned"
      | "workout_updated"
      | "checkin_requested"
      | "checkin_submitted"
      | "message_received"
      | "reminders_enabled"
      | "milestone_events"
      | "inactivity_alerts"
      | "system_events"
    >
  | "lead_alerts"
  | "join_requests"
  | "client_escalation"
  | "missed_checkins"
  | "client_onboarding"
  | "weekly_digest"
  | "product_updates"
  | "program_assigned"
  | "habit_reminders"
  | "files_resources"
  | "appointment_reminders";

const notificationPreferenceMap: Record<NotificationType, PreferenceKey> = {
  workout_assigned: "workout_assigned",
  program_assigned: "program_assigned",
  habit_assigned: "habit_reminders",
  task_assigned: "reminders_enabled",
  workout_updated: "workout_updated",
  checkin_requested: "checkin_requested",
  checkin_submitted: "checkin_submitted",
  message_received: "message_received",
  file_shared: "files_resources",
  birthday_reminder: "milestone_events",
  milestone_achieved: "milestone_events",
  client_joined_workspace: "client_onboarding",
  client_assigned_workspace: "client_onboarding",
  invite_accepted: "client_onboarding",
  invite_sent: "client_onboarding",
  join_request_submitted: "join_requests",
  join_request_approved: "join_requests",
  join_request_declined: "join_requests",
  workout_due_today: "reminders_enabled",
  checkin_due_tomorrow: "reminders_enabled",
  client_inactive: "inactivity_alerts",
  security: "system_events",
  system: "system_events",
};

export function shouldDeliverNotification(params: {
  channel: NotificationChannel;
  type: NotificationType;
  transactional?: boolean;
  preferences: Partial<NotificationPreferences> | null | undefined;
}) {
  if (params.transactional) return true;
  const preferences = params.preferences;
  if (!preferences) return false;

  if (params.channel === "email" && !preferences.email_enabled) return false;
  if (params.channel === "push" && !preferences.push_enabled) return false;
  if (params.channel === "in_app" && preferences.in_app_enabled === false) {
    return false;
  }

  const preferenceKey = notificationPreferenceMap[params.type];
  const value = preferences[preferenceKey as keyof NotificationPreferences];
  return value !== false;
}

export function sanitizeNotificationActionUrl(params: {
  actorType: "pt" | "client" | "system";
  url: string | null | undefined;
}) {
  const url = params.url?.trim() ?? "";
  if (!url || !url.startsWith("/") || url.startsWith("//")) return null;

  if (params.actorType === "client") {
    return url.startsWith("/app") || url.startsWith("/client/onboarding")
      ? url
      : "/app/home";
  }

  if (params.actorType === "pt") {
    return url.startsWith("/pt") ||
      url.startsWith("/pt-hub") ||
      url.startsWith("/workspace/")
      ? url
      : "/pt-hub";
  }

  return url;
}

export function buildAssignmentNotificationEvent(params: {
  recipientUserId: string;
  actorType: "pt" | "client";
  type:
    | "client_assigned_workspace"
    | "workout_assigned"
    | "program_assigned"
    | "habit_assigned"
    | "checkin_requested"
    | "file_shared"
    | "message_received"
    | "join_request_submitted"
    | "join_request_approved"
    | "join_request_declined";
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  actionUrl: string;
  workspaceId?: string | null;
}) {
  return {
    recipient_user_id: params.recipientUserId,
    actor_type: params.actorType,
    type: params.type,
    title: params.title,
    body: params.body,
    action_url: sanitizeNotificationActionUrl({
      actorType: params.actorType,
      url: params.actionUrl,
    }),
    entity_type: params.entityType,
    entity_id: params.entityId,
    metadata: {
      workspace_id: params.workspaceId ?? null,
    },
    transactional: false,
    idempotency_key: [
      params.type,
      params.recipientUserId,
      params.entityType,
      params.entityId,
    ].join(":"),
  } satisfies NotificationEvent;
}

export async function queueNotificationEvent(event: NotificationEvent) {
  const { data, error } = await supabase
    .from("notification_events")
    .upsert(event, { onConflict: "idempotency_key" })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function registerPushSubscription(input: PushSubscriptionInput) {
  const endpoint = input.endpoint.trim();
  if (!endpoint.startsWith("https://")) {
    throw new Error("Push endpoint must be an HTTPS URL.");
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: input.user_id,
        endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.user_agent ?? navigator.userAgent,
        status: "active",
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    )
    .select("id, user_id, endpoint, status, last_seen_at")
    .maybeSingle();
  if (error) throw error;
  return data;
}
