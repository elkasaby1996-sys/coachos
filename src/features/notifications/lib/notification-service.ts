import { supabase } from "../../../lib/supabase";
import type {
  NotificationChannel,
  NotificationDeliveryLog,
  NotificationDeliveryStatus,
  NotificationEvent,
  NotificationPreferences,
  NotificationType,
  PushSubscriptionInput,
  PushSubscriptionPayload,
  PushSubscriptionStatusUpdate,
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
  checkin_reviewed: "checkin_requested",
  message_received: "message_received",
  file_shared: "files_resources",
  birthday_reminder: "milestone_events",
  milestone_achieved: "milestone_events",
  client_joined_workspace: "client_onboarding",
  client_assigned_workspace: "client_onboarding",
  invite_accepted: "client_onboarding",
  invite_sent: "client_onboarding",
  team_invite_received: "client_onboarding",
  team_invite_accepted: "client_onboarding",
  team_invite_declined: "client_onboarding",
  join_request_submitted: "join_requests",
  join_request_approved: "join_requests",
  join_request_declined: "join_requests",
  workout_due_today: "reminders_enabled",
  checkin_due_tomorrow: "reminders_enabled",
  calendar_mention: "appointment_reminders",
  client_inactive: "inactivity_alerts",
  security: "system_events",
  system: "system_events",
};

export function buildProfileNotificationPreferenceDefaults(
  userId: string,
  actorType: "pt" | "client" | "unknown",
) {
  return {
    user_id: userId,
    actor_type: actorType,
    in_app_enabled: true,
    email_enabled: false,
    push_enabled: false,
    lead_alerts: actorType === "pt",
    join_requests: actorType === "pt",
    client_escalation: actorType === "pt",
    missed_checkins: actorType === "pt",
    client_onboarding: actorType === "pt",
    weekly_digest: actorType === "pt",
    product_updates: true,
    program_assigned: actorType !== "pt",
    habit_reminders: actorType !== "pt",
    files_resources: actorType !== "pt",
    appointment_reminders: actorType !== "pt",
    workout_assigned: true,
    workout_updated: true,
    checkin_requested: true,
    checkin_submitted: true,
    message_received: true,
    reminders_enabled: true,
    milestone_events: true,
    inactivity_alerts: true,
    system_events: true,
  };
}

export async function ensureNotificationPreferenceDefaults(params: {
  userId: string;
  actorType: "pt" | "client" | "unknown";
}) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(
      buildProfileNotificationPreferenceDefaults(
        params.userId,
        params.actorType,
      ),
      {
        onConflict: "user_id",
        ignoreDuplicates: true,
      },
    )
    .select("user_id")
    .maybeSingle();
  if (error) throw error;
  return data;
}

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
    return isRouteRootOrChild(url, "/app") ||
      isRouteRootOrChild(url, "/client/onboarding")
      ? url
      : "/app/home";
  }

  if (params.actorType === "pt") {
    return isRouteRootOrChild(url, "/pt") ||
      isRouteRootOrChild(url, "/pt-hub") ||
      url.startsWith("/workspace/")
      ? url
      : "/pt-hub";
  }

  return url;
}

function isRouteRootOrChild(url: string, root: string) {
  return (
    url === root || url.startsWith(`${root}/`) || url.startsWith(`${root}?`)
  );
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

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function buildNotificationDeliveryLog(params: {
  eventId: string;
  recipientUserId: string;
  recipientEmail?: string | null;
  type: NotificationType;
  templateKey: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  provider?: string | null;
  providerMessageId?: string | null;
  retryCount?: number;
  failureCode?: string | null;
  failureReason?: string | null;
  idempotencyKey: string;
}): NotificationDeliveryLog {
  return {
    event_id: params.eventId,
    recipient_user_id: params.recipientUserId,
    recipient_email: normalizeOptionalText(params.recipientEmail),
    notification_type: params.type,
    template_key: params.templateKey,
    channel: params.channel,
    status: params.status,
    provider: normalizeOptionalText(params.provider),
    provider_message_id: normalizeOptionalText(params.providerMessageId),
    retry_count: params.retryCount ?? 0,
    failure_code: normalizeOptionalText(params.failureCode),
    failure_reason: normalizeOptionalText(params.failureReason),
    idempotency_key: `${params.idempotencyKey}:${params.channel}`,
  };
}

export async function logNotificationDelivery(
  delivery: NotificationDeliveryLog,
) {
  const { data, error } = await supabase
    .from("notification_deliveries")
    .upsert(delivery, { onConflict: "idempotency_key" })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function buildPushSubscriptionPayload(
  input: PushSubscriptionInput,
): PushSubscriptionPayload {
  const endpoint = input.endpoint.trim();
  if (!endpoint.startsWith("https://")) {
    throw new Error("Push endpoint must be an HTTPS URL.");
  }

  return {
    user_id: input.user_id,
    endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    user_agent:
      input.user_agent ??
      (typeof navigator === "undefined" ? null : navigator.userAgent),
    status: "active",
    last_seen_at: new Date().toISOString(),
  };
}

export function buildPushSubscriptionStatusUpdate(params: {
  status: "active" | "invalid" | "revoked";
  failureReason?: string | null;
}): PushSubscriptionStatusUpdate {
  const now = new Date().toISOString();
  if (params.status === "active") {
    return {
      status: "active",
      last_seen_at: now,
      last_success_at: now,
      failure_reason: null,
      updated_at: now,
    };
  }

  return {
    status: params.status,
    last_failure_at: now,
    failure_reason: normalizeOptionalText(params.failureReason),
    updated_at: now,
  };
}

export async function registerPushSubscription(input: PushSubscriptionInput) {
  const payload = buildPushSubscriptionPayload(input);

  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(payload, { onConflict: "user_id,endpoint" })
    .select("id, user_id, endpoint, status, last_seen_at")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updatePushSubscriptionStatus(params: {
  userId: string;
  endpoint: string;
  status: "active" | "invalid" | "revoked";
  failureReason?: string | null;
}) {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .update(
      buildPushSubscriptionStatusUpdate({
        status: params.status,
        failureReason: params.failureReason,
      }),
    )
    .eq("user_id", params.userId)
    .eq("endpoint", params.endpoint.trim())
    .select("id, user_id, endpoint, status, last_seen_at")
    .maybeSingle();
  if (error) throw error;
  return data;
}
